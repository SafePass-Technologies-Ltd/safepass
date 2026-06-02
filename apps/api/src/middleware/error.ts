import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError, type ZodIssue } from 'zod';

/**
 * Global error handler middleware for Hono.
 * Catches all errors and returns structured JSON responses.
 */
export async function errorHandler(err: Error, c: Context): Promise<Response> {
  // Known HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: err.status,
          message: err.message,
        },
      },
      err.status
    );
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const issues: ZodIssue[] = (err as ZodError).issues;
    return c.json(
      {
        error: {
          code: 400,
          message: 'Validation failed',
          details: issues.map((issue: ZodIssue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400
    );
  }

  // Unexpected errors
  console.error('Unhandled error:', err);

  const isProd = process.env.NODE_ENV === 'production';

  return c.json(
    {
      error: {
        code: 500,
        message: isProd ? 'Internal server error' : err.message,
      },
    },
    500
  );
}
