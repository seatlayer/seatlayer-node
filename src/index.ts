/**
 * SeatLayer server SDK.
 *
 * Secret-key only. This package must never be bundled into a browser — see the
 * session-minting helpers for how browser surfaces get scoped tokens instead.
 */
import { HttpClient, type ClientOptions } from './http.js';
import { Charts } from './resources/charts.js';
import { Channels } from './resources/channels.js';
import { Events } from './resources/events.js';
import { Inventory } from './resources/inventory.js';
import { PerformanceGroups } from './resources/performance-groups.js';
import { Sessions } from './resources/sessions.js';
import { Templates } from './resources/templates.js';
import { Webhooks } from './resources/webhooks.js';
import { Workspaces } from './resources/workspaces.js';
import type { ReadinessReport } from './types.js';

export class SeatLayer {
  readonly charts: Charts;
  readonly channels: Channels;
  readonly events: Events;
  readonly inventory: Inventory;
  readonly performanceGroups: PerformanceGroups;
  readonly sessions: Sessions;
  readonly templates: Templates;
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
    this.channels = new Channels(this.#http);
    this.events = new Events(this.#http);
    this.inventory = new Inventory(this.#http);
    this.performanceGroups = new PerformanceGroups(this.#http);
    this.sessions = new Sessions(this.#http);
    this.templates = new Templates(this.#http);
    this.webhooks = new Webhooks(this.#http);
    this.workspaces = new Workspaces(this.#http);
  }

  /** Dependency-aware readiness probe. Unauthenticated upstream. */
  ready(): Promise<ReadinessReport> {
    return this.#http.get('/health/ready');
  }

  /**
   * Escape hatch for surface this SDK does not wrap yet. Reads retain transient
   * retries; raw mutations are deliberately single-attempt because the SDK
   * cannot prove that an unknown operation supports exact replay.
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
export type {
  CreatePerformanceGroupBuyerAccessSessionParams,
  CreatePerformanceGroupParams,
  PerformanceGroup,
  PerformanceGroupBooking,
  PerformanceGroupBuyerAccessReveal,
  PerformanceGroupBuyerAccessSession,
  PerformanceGroupDetail,
  PerformanceGroupHold,
  PerformanceGroupLifecycleOperation,
  PerformanceGroupLifecycleResult,
  PerformanceGroupListOptions,
  PerformanceGroupPerformance,
} from './resources/performance-groups.js';
export type {
  AccessLink,
  AccessLinkReveal,
  AccessLinkRevokeResult,
  BuyerAccessSession,
  BuyerAccessSessionRecord,
  Channel,
  ChannelAccess,
  ChannelAccessPreview,
  ChannelAccessIntent,
  ChannelAssignmentBuckets,
  ChannelAssignmentResult,
  ChannelArchiveResult,
  ChannelAttribution,
  ChannelCounts,
  ChannelListResult,
  ChannelPreviewAudience,
  ChannelReport,
  ChannelReportEnvelope,
  ChannelReportResult,
  ChannelReportRow,
  ChannelState,
  ChannelWithCounts,
  CreateBuyerAccessSessionParams,
  PublicSaleChannel,
} from './resources/channels.js';
export { PUBLIC_CHANNEL_ID } from './resources/channels.js';
export type {
  EventChartUpdateResult,
  EventListOptions,
  EventPage,
  EventUpdateParams,
  PosterImage,
} from './resources/events.js';
export type { InstantiateTemplateOptions, InstantiateTemplateParams } from './resources/templates.js';
export type * from './types.js';

export default SeatLayer;
