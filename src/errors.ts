/**
 * Typed errors.
 *
 * The API answers failures with `{ error, code?, message? }` and a status. A
 * generated client would surface that as one opaque exception and leave every
 * caller string-matching on `error`. The cases below are the ones an
 * integration actually branches on — a sold-out seat is a business outcome that
 * belongs in an `if`, not in a `catch` that also swallows a bad key.
 */

/** Raw error envelope as the API sends it. */
export interface ApiErrorBody {
  error?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export class SeatLayerError extends Error {
  readonly status: number;
  /** Machine-readable code: `body.code ?? body.error`. */
  readonly code: string;
  readonly body: ApiErrorBody;
  /** Correlation id from `X-Request-ID`. Quote it in support requests. */
  readonly requestId: string | null;

  constructor(status: number, body: ApiErrorBody, requestId: string | null) {
    const code = body.code ?? body.error ?? 'unknown_error';
    super(body.message ?? `SeatLayer API error ${status} (${code})`);
    this.name = 'SeatLayerError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.requestId = requestId;
  }
}

/** 401/403 — bad key, revoked key, or a live key used against a test event. */
export class SeatLayerAuthError extends SeatLayerError {
  constructor(status: number, body: ApiErrorBody, requestId: string | null) {
    super(status, body, requestId);
    this.name = 'SeatLayerAuthError';
  }

  /**
   * True when the key's mode and the event's mode disagree — the most common
   * cause of a "works locally, 403s in production" report.
   */
  get isModeMismatch(): boolean {
    return this.code === 'mode_mismatch';
  }
}

export class SeatLayerNotFoundError extends SeatLayerError {
  constructor(status: number, body: ApiErrorBody, requestId: string | null) {
    super(status, body, requestId);
    this.name = 'SeatLayerNotFoundError';
  }
}

/**
 * 409 — the seats moved under you. This is a normal outcome in ticketing, not
 * an exceptional one: two buyers wanted the same seat and one lost.
 */
export class SeatLayerConflictError extends SeatLayerError {
  /** Per-object conflicts, when the endpoint reports them. */
  readonly conflicts: Array<{ label: string; status: string }>;

  constructor(status: number, body: ApiErrorBody, requestId: string | null) {
    super(status, body, requestId);
    this.name = 'SeatLayerConflictError';
    this.conflicts = Array.isArray(body.conflicts)
      ? (body.conflicts as Array<{ label: string; status: string }>)
      : [];
  }

  /** True when best-available could not find enough free inventory. */
  get isSoldOut(): boolean {
    return this.body.reason === 'sold_out' || this.body.reason === 'not_enough_together';
  }
}

/** 422 — the request was understood and rejected. */
export class SeatLayerValidationError extends SeatLayerError {
  constructor(status: number, body: ApiErrorBody, requestId: string | null) {
    super(status, body, requestId);
    this.name = 'SeatLayerValidationError';
  }
}

/**
 * 429. `retryAfterSeconds` comes from the `Retry-After` header when present and
 * falls back to the JSON field, so callers get a real number either way.
 */
export class SeatLayerRateLimitError extends SeatLayerError {
  readonly retryAfterSeconds: number;

  constructor(
    status: number,
    body: ApiErrorBody,
    requestId: string | null,
    retryAfterSeconds: number,
  ) {
    super(status, body, requestId);
    this.name = 'SeatLayerRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The request never got an answer: DNS, TLS, socket, or an abort. */
export class SeatLayerConnectionError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'SeatLayerConnectionError';
    this.cause = cause;
  }
}

export function errorFromResponse(
  status: number,
  body: ApiErrorBody,
  requestId: string | null,
  retryAfterSeconds: number,
): SeatLayerError {
  if (status === 401 || status === 403) return new SeatLayerAuthError(status, body, requestId);
  if (status === 404) return new SeatLayerNotFoundError(status, body, requestId);
  if (status === 409) return new SeatLayerConflictError(status, body, requestId);
  if (status === 422) return new SeatLayerValidationError(status, body, requestId);
  if (status === 429) {
    return new SeatLayerRateLimitError(status, body, requestId, retryAfterSeconds);
  }
  return new SeatLayerError(status, body, requestId);
}
