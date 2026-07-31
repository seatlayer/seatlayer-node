/**
 * SeatLayer server SDK.
 *
 * Secret-key only. This package must never be bundled into a browser — see the
 * session-minting helpers for how browser surfaces get scoped tokens instead.
 */
import { HttpClient, type ClientOptions } from './http.js';
import { Charts } from './resources/charts.js';
import { Events } from './resources/events.js';
import { Inventory } from './resources/inventory.js';
import { Sessions } from './resources/sessions.js';
import { Webhooks } from './resources/webhooks.js';
import { Workspaces } from './resources/workspaces.js';

export class SeatLayer {
  readonly charts: Charts;
  readonly events: Events;
  readonly inventory: Inventory;
  readonly sessions: Sessions;
  readonly webhooks: Webhooks;
  readonly workspaces: Workspaces;

  /** `test` or `live`, derived from the key prefix. */
  readonly mode: 'live' | 'test' | 'unknown';

  #http: HttpClient;

  constructor(options: ClientOptions | string) {
    const resolved: ClientOptions = typeof options === 'string' ? { secretKey: options } : options;
    this.#http = new HttpClient(resolved);
    this.mode = this.#http.mode;

    this.charts = new Charts(this.#http);
    this.events = new Events(this.#http);
    this.inventory = new Inventory(this.#http);
    this.sessions = new Sessions(this.#http);
    this.webhooks = new Webhooks(this.#http);
    this.workspaces = new Workspaces(this.#http);
  }

  /** Dependency-aware readiness probe. Unauthenticated upstream. */
  ready(): Promise<{ ok: boolean; [key: string]: unknown }> {
    return this.#http.get('/health/ready');
  }

  /**
   * Escape hatch for surface this SDK does not wrap yet. Carries the same auth,
   * retry, idempotency and error mapping as everything else.
   */
  request<T>(method: string, path: string, options?: Parameters<HttpClient['request']>[2]): Promise<T> {
    return this.#http.request<T>(method, path, options);
  }
}

export { verifyWebhook, WebhookVerificationError, type VerifyWebhookOptions } from './webhooks-verify.js';
export {
  SeatLayerError,
  SeatLayerAuthError,
  SeatLayerConflictError,
  SeatLayerConnectionError,
  SeatLayerNotFoundError,
  SeatLayerRateLimitError,
  SeatLayerValidationError,
  type ApiErrorBody,
} from './errors.js';
export type { ClientOptions, RequestOptions } from './http.js';
export type * from './types.js';

export default SeatLayer;
