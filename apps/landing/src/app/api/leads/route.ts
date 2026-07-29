import { NextResponse } from 'next/server';
import { LeadPayloadSchema } from '@safepass/shared';
import { getServerEnv } from '@/lib/env';

/**
 * Lead Intake Service (FEAT-012, architecture.md's component of the same name).
 *
 * Receives all three lead types, validates and normalises them, and forwards
 * them to the SafePass Backend API. It holds NO persistent store of its own —
 * the site's README carries the explicit non-goal *"It will never become the
 * system of record for leads or user data"*, and this handler is where that
 * boundary is actually enforced.
 *
 * On a delivery failure it returns a clear, specific error rather than
 * silently dropping the submission (FEAT-012's acceptance criteria, R-004):
 * the client then shows the Submission Error state with preserved data, a
 * Retry button, and a fallback contact address.
 *
 * The client sends only the visitor-entered fields; the envelope
 * (`leadType`, `sourcePage`, `submittedAt`, `submissionId`) is attached HERE,
 * server-side, so a caller cannot spoof the lead type or backdate a submission.
 */

// Node runtime: the forward call uses a service key that must never reach the
// browser, and this handler must not be statically optimised.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every log line carries this prefix so delivery failures are greppable. */
const LOG_PREFIX = '[lead-intake]';

export async function POST(request: Request): Promise<NextResponse> {
  const env = getServerEnv();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body could not be parsed.' } },
      { status: 400 }
    );
  }

  const parsed = LeadPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some details need correcting.',
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  // Log the ATTEMPT before the forward, not after. architecture.md requires
  // logging every submission attempt for delivery-reliability monitoring —
  // if the process dies mid-forward, a log line written afterwards would never
  // exist, and the lead would vanish with no trace that it was ever received.
  console.info(
    `${LOG_PREFIX} attempt`,
    JSON.stringify({
      submissionId: payload.submissionId,
      leadType: payload.leadType,
      sourcePage: payload.sourcePage,
      submittedAt: payload.submittedAt,
    })
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.leadIntakeTimeoutMs);

  try {
    const response = await fetch(env.leadIntakeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.leadIntakeApiKey ? { 'x-api-key': env.leadIntakeApiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await safeReadText(response);
      console.error(
        `${LOG_PREFIX} delivery_failed`,
        JSON.stringify({
          submissionId: payload.submissionId,
          leadType: payload.leadType,
          status: response.status,
          detail,
        })
      );

      return NextResponse.json(
        {
          error: {
            code: 'DELIVERY_FAILED',
            message: "We couldn't submit your details just now.",
          },
        },
        { status: 502 }
      );
    }

    console.info(
      `${LOG_PREFIX} delivered`,
      JSON.stringify({ submissionId: payload.submissionId, leadType: payload.leadType })
    );

    return NextResponse.json({ status: 'received', submissionId: payload.submissionId }, { status: 201 });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';

    console.error(
      `${LOG_PREFIX} delivery_error`,
      JSON.stringify({
        submissionId: payload.submissionId,
        leadType: payload.leadType,
        reason: aborted ? 'timeout' : 'network',
        message: error instanceof Error ? error.message : String(error),
      })
    );

    return NextResponse.json(
      {
        error: {
          code: aborted ? 'DELIVERY_TIMEOUT' : 'DELIVERY_ERROR',
          message: "We couldn't submit your details just now.",
        },
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Reads an error response body without letting a read failure mask the original error. */
async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}
