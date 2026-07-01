/// Minimal unit test for ApiError, guarding against regressions in the
/// shape used throughout the admin dashboard's error handling (status code
/// + message + name discrimination).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api-client';

describe('ApiError', () => {
  it('carries the HTTP status code and message', () => {
    const err = new ApiError(404, 'Not found');

    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('sets its name to "ApiError" so callers can discriminate it from other Error types', () => {
    const err = new ApiError(500, 'Server error');

    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });
});
