/**
 * Connection-level 28P01 recovery for the postgres.js pool (T-040).
 *
 * WHY THIS EXISTS
 *
 * RDS rotates the master password every 7 days (see ./credentials.ts). The pool
 * already picks the new password up on the next NEW connection, but only if it
 * re-reads the secret -- and when the cached value is the one the server just
 * rejected, nothing in the connection path notices. postgres.js calls the
 * `password` function BEFORE the server has seen the credential, so the
 * resolver cannot know it was refused; the 28P01 surfaces later, on the query
 * that was waiting for that connection.
 *
 * So the retry lives here: one level above the driver, where both facts are
 * visible. `withPasswordAuthRetry` (./credentials.ts) drops the dead credential
 * and re-runs the operation exactly once.
 *
 * Drizzle executes every statement through `client.unsafe(sql, params)` and
 * every transaction through `client.begin(cb)`, so intercepting those (plus
 * direct tagged-template calls) covers all database round trips without
 * touching a single call site.
 *
 * Deliberately its own module: it has no database, no env, no pool, so it can
 * be unit-tested on its own.
 */
import type postgres from 'postgres';
import { withPasswordAuthRetry } from './credentials';

export type PostgresClient = ReturnType<typeof postgres>;

/**
 * The part of postgres.js's `PendingQuery` this module relies on: it is a
 * thenable, and Drizzle awaits either it directly or its `values()`.
 */
interface RetryableQuery<T> extends PromiseLike<T> {
  catch: (onRejected: (reason: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally: () => void) => Promise<T>;
  values: () => Promise<unknown>;
  execute: () => Promise<unknown>;
}

/** Wraps one pending query so it is retried once after a 28P01. */
function retryingQuery<T>(run: () => PromiseLike<T>): RetryableQuery<T> {
  const attempt = () => withPasswordAuthRetry(async () => await run());

  return {
    then: (onFulfilled, onRejected) => attempt().then(onFulfilled, onRejected),
    catch: (onRejected) => attempt().catch(onRejected),
    finally: (onFinally) => attempt().finally(onFinally),
    values: () =>
      withPasswordAuthRetry(async () => await (run() as unknown as RetryableQuery<unknown>).values()),
    execute: () =>
      withPasswordAuthRetry(async () => await (run() as unknown as RetryableQuery<unknown>).execute()),
  };
}

/**
 * Wraps a postgres.js client so a connection rejected with 28P01 is retried
 * once with a freshly read password.
 *
 * Retrying a `begin` is safe for the same reason a query retry is: 28P01 is
 * raised while authenticating a NEW connection, before the transaction callback
 * has been invoked, so nothing has been written yet. Every other error is
 * rethrown untouched.
 */
export function withConnectionPasswordRetry(client: PostgresClient): PostgresClient {
  return new Proxy(client, {
    // Tagged-template call: sql`select 1`
    apply(target, thisArg, args) {
      return retryingQuery(
        () => Reflect.apply(target, thisArg, args) as unknown as PromiseLike<unknown>
      );
    },

    get(target, property, receiver) {
      if (property === 'unsafe') {
        return (query: string, params?: unknown[], options?: unknown) =>
          retryingQuery(
            () =>
              target.unsafe(query, params as never, options as never) as unknown as PromiseLike<unknown>
          );
      }

      if (property === 'begin') {
        return (...args: unknown[]) =>
          withPasswordAuthRetry(() =>
            (target.begin as unknown as (...inner: unknown[]) => Promise<unknown>)(...args)
          );
      }

      // Everything else (end, listen, options, ...) passes straight through,
      // with `this` bound to the real client.
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function'
        ? (value as (...inner: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as unknown as PostgresClient;
}
