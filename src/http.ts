/**
 * The transport: auth, idempotency, retry, and error mapping.
 *
 * This is the layer that decides how the SDK behaves when the network or the
 * API misbehaves, which is most of what separates a usable client from a thin
 * `fetch` wrapper.
 */
import {
  errorFromResponse,
  SeatLayerConnectionError,
  SeatLayerRateLimitError,
  type ApiErrorBody,
} from './errors.js';

export interface ClientOptions {
  /** `sk_live_…` or `sk_test_…`. Never expose this to a browser. */
  secretKey: string;
  /** Override for self-hosted or staging. Defaults to the public API. */
  baseUrl?: string;
  /** Total attempts for retryable failures. Default 3 (two retries). */
  maxRetries?: number;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Injectable for tests and for runtimes with a non-global fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON request body. Mutually exclusive with `rawBody`. */
  body?: unknown;
  /** Raw request body for binary endpoints such as event posters. */
  rawBody?: NonNullable<RequestInit['body']>;
  /** Content type for `rawBody`. Defaults to application/octet-stream. */
  contentType?: string;
  /**
   * Explicit Idempotency-Key. This never makes an otherwise unsupported
   * mutation retryable; only typed header-replay operations retry mutations.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Observe the final HTTP response without consuming its body. */
  onResponse?: (response: Response) => void;
}

const DEFAULT_BASE_URL = 'https://api.seatlayer.io';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

/** The API's own charset for Idempotency-Key: ^[A-Za-z0-9._:-]{1,128}$ */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function assertValidIdempotencyKey(key: string): void {
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new TypeError(
      `Invalid Idempotency-Key ${JSON.stringify(key)}: allowed characters are A-Z a-z 0-9 . _ : - and the length must be 1-128.`,
    );
  }
}

/**
 * Retry only what is safe to retry.
 *
 * 429 and 5xx are transient by definition. A 4xx is the API telling you the
 * request itself is wrong — retrying it just burns rate-limit budget and delays
 * the error the caller needs to see.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

function backoffMs(attempt: number, retryAfterSeconds: number | null): number {
  // Server's instruction wins — it knows when the window actually rolls over.
  if (retryAfterSeconds !== null) return retryAfterSeconds * 1000;
  // Otherwise exponential with full jitter, so a fleet of workers that all got
  // limited at once does not retry in lockstep and re-limit itself.
  const ceiling = Math.min(8_000, 250 * 2 ** attempt);
  return Math.random() * ceiling;
}

function parseRetryAfter(response: Response, body: ApiErrorBody): number {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  // Fall back to the JSON field for routes that predate the headers.
  const field = body.retryAfterSeconds;
  if (typeof field === 'number' && Number.isFinite(field)) return field;
  return 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpClient {
  readonly baseUrl: string;
  /** Whether this client is pointed at test-mode or live-mode data. */
  readonly mode: 'live' | 'test' | 'unknown';

  #secretKey: string;
  #maxRetries: number;
  #timeoutMs: number;
  #fetch: typeof globalThis.fetch;

  constructor(options: ClientOptions) {
    if (!options.secretKey) {
      throw new TypeError('A SeatLayer secret key is required.');
    }
    // Caught here rather than as a 401 three network round-trips later. The
    // pk_ case is worth its own message: it is the one people paste by mistake.
    if (options.secretKey.startsWith('pk_')) {
      throw new TypeError(
        'That is a publishable key. The server SDK needs a secret key (sk_live_… or sk_test_…).',
      );
    }
    if (!options.secretKey.startsWith('sk_')) {
      throw new TypeError('A SeatLayer secret key starts with sk_live_ or sk_test_.');
    }

    this.#secretKey = options.secretKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.mode = options.secretKey.startsWith('sk_test_')
      ? 'test'
      : options.secretKey.startsWith('sk_live_')
        ? 'live'
        : 'unknown';
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.#request<T>(method, path, options, false);
  }

  /** Internal typed-operation path for mutations backed by exact HTTP replay. */
  postWithHeaderReplay<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.#request<T>('POST', path, options, true);
  }

  /** Internal typed-operation path for any mutation backed by exact header replay. */
  mutationWithHeaderReplay<T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.#request<T>(method, path, options, true);
  }

  async #request<T>(
    method: string,
    path: string,
    options: RequestOptions,
    headerReplay: boolean,
  ): Promise<T> {
    method = method.toUpperCase();
    if (options.body !== undefined && options.rawBody !== undefined) {
      throw new TypeError('RequestOptions body and rawBody are mutually exclusive.');
    }
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#secretKey}`,
      Accept: 'application/json',
      'User-Agent': '@seatlayer/server',
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.rawBody !== undefined) {
      headers['Content-Type'] = options.contentType ?? 'application/octet-stream';
    }

    const isRead = method === 'GET' || method === 'HEAD';
    if (headerReplay || (!isRead && options.idempotencyKey !== undefined)) {
      const key = options.idempotencyKey ?? crypto.randomUUID();
      assertValidIdempotencyKey(key);
      // Generated once before the loop, so every safe retry reuses one key.
      headers['Idempotency-Key'] = key;
    }

    // Reads are safe by HTTP semantics. Mutations are single-attempt unless a
    // typed resource opted into the server's exact header-replay contract.
    const totalAttempts = isRead || headerReplay ? this.#maxRetries : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      const timeout = AbortSignal.timeout(this.#timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;

      let response: Response;
      try {
        response = await this.#fetch(url, {
          method,
          headers,
          signal,
          ...(options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : options.rawBody !== undefined
              ? { body: options.rawBody }
              : {}),
        });
      } catch (cause) {
        // A caller-initiated abort is a decision, not a failure to retry.
        if (options.signal?.aborted) throw cause;
        lastError = new SeatLayerConnectionError(
          `Request to ${method} ${path} failed: ${(cause as Error)?.message ?? 'unknown error'}`,
          cause,
        );
        if (attempt < totalAttempts - 1) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        throw lastError;
      }

      const requestId = response.headers.get('x-request-id');

      if (response.ok) {
        options.onResponse?.(response);
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      const retryAfter = parseRetryAfter(response, body);

      if (isRetryableStatus(response.status) && attempt < totalAttempts - 1) {
        await sleep(backoffMs(attempt, response.status === 429 ? retryAfter : null));
        continue;
      }

      options.onResponse?.(response);
      throw errorFromResponse(response.status, body, requestId, retryAfter);
    }

    // Only reachable if maxRetries is 0.
    throw lastError ?? new SeatLayerConnectionError('Request failed with no attempts made.', null);
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}

export { SeatLayerRateLimitError };
