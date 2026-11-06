/**
 * SeatLayer server SDK.
 *
 * Secret-key only. This package must never be bundled into a browser — see the
 * session-minting helpers for how browser surfaces get scoped tokens instead.
 */
import { HttpClient, type ClientOptions } from './http.js';
import { Charts } from './resources/charts.js';
import { Channels } from './resources/channels.js';
import { EventSeriesResource } from './resources/event-series.js';
import { Events } from './resources/events.js';
import { Holders } from './resources/holders.js';
import { Inventory } from './resources/inventory.js';
import { Orders } from './resources/orders.js';
import { PerformanceGroups } from './resources/performance-groups.js';
import { Sessions } from './resources/sessions.js';
import { Seasons } from './resources/seasons.js';
import { Templates } from './resources/templates.js';
import { Webhooks } from './resources/webhooks.js';
import { Workspaces } from './resources/workspaces.js';
import type { ReadinessReport } from './types.js';

export class SeatLayer {
  readonly charts: Charts;
  readonly channels: Channels;
  readonly events: Events;
  readonly eventSeries: EventSeriesResource;
  readonly holders: Holders;
  readonly inventory: Inventory;
  readonly orders: Orders;
  readonly performanceGroups: PerformanceGroups;
  readonly sessions: Sessions;
  readonly seasons: Seasons;
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
    this.eventSeries = new EventSeriesResource(this.#http);
    this.holders = new Holders(this.#http);
    this.inventory = new Inventory(this.#http);
    this.orders = new Orders(this.#http);
    this.performanceGroups = new PerformanceGroups(this.#http);
    this.sessions = new Sessions(this.#http);
    this.seasons = new Seasons(this.#http);
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
export {
  SeasonLifecycleTimeoutError,
  SeasonBookingTimeoutError,
  type CreateSeasonParams,
  type CreateSeasonPerformancesParams,
  type CreateSeasonPlanParams,
  type CreateSeasonAmendmentParams,
  type RefundSeasonPerformanceParams,
  type UpdateSeasonParams,
  type Season,
  type SeasonCompatibilityIssue,
  type SeasonBuyerAccessReveal,
  type SeasonBuyerAccessSession,
  type SeasonBuyerRehearsalResult,
  type SeasonBooking,
  type SeasonBookingResult,
  type SeasonDetail,
  type SeasonLifecycleOperation,
  type SeasonLifecycleResult,
  type SeasonListOptions,
  type SeasonPlan,
  type SeasonHold,
  type SeasonHoldAllocation,
  type SeasonHoldItem,
  type SeasonHolderImport,
  type SeasonHolderImportRow,
  type SeasonCheckoutTest,
  type SeasonDateJob,
  type SeasonBulkJob,
  type SeasonBulkJobCounts,
  type SeasonBulkJobDetail,
  type SeasonBulkJobKind,
  type SeasonBulkJobState,
  type SeasonRefundJobSummary,
  type SeasonHolder,
  type SeasonHolderFilter,
  type SeasonHolderImportFromSeason,
  type SeasonHolderListOptions,
  type SeasonHolderPage,
  type SeasonHostedRenewals,
  type SeasonOccurrenceInventoryAction,
  type SeasonOccurrenceInventorySource,
  type SeasonOrderCancelReceipt,
  type SeasonOrderDateCancel,
  type SeasonOrderRefund,
  type SeasonPackagePrice,
  type SeasonPackagePriceInput,
  type SeasonPriceTypeKey,
  type SeasonPackagePrices,
  type SeasonPackageResult,
  type SeasonPackageSummary,
  type SeasonPerformance,
  type SeasonPerformanceCreateResult,
  type SeasonPerformanceList,
  type SeasonPlanPerformanceAttachResult,
  type SeasonPlanPerformanceRemoveResult,
  type SeasonPriceList,
  type SeasonPublishResult,
  type SeasonSalesOpenResult,
  type SeasonResult,
  type SeasonSingleTicketDates,
  type SeasonSalesReport,
  type SeasonSeatCounts,
  type SeasonSeatsReport,
  type SeasonStoppedOrder,
  type SeasonPlanPublicationResult,
  type SeasonPublicationState,
  type SeasonSalesState,
  type SeasonSelectionParams,
  type SeasonSourcePerformanceGroup,
  type SeasonStructureState,
  type SeasonRenewalOffer,
  type SeasonRenewalOfferJob,
  type SeasonRenewalOfferPageOptions,
  type SeasonOccurrence,
  type SeasonAmendment,
  type SeasonAmendmentKind,
  type SeasonAmendmentRequestKind,
  type SeasonReport,
  type SeasonOperationSummary,
  type SeasonSupportLookup,
  type SeasonOutboxOccurrence,
  type SeasonAuditEntry,
  type SeasonRenewalResult,
  type SeasonRenewalQuote,
  type SeasonRenewalQuoteProblem,
  type SeasonRenewalCheckoutParams,
  type SeasonRenewalCheckoutStarted,
  type DeclineSeasonRenewalOfferParams,
  type SeasonValidation,
  type WaitForSeasonLifecycleOptions,
} from './resources/seasons.js';
export { SeasonRenewalTimeoutError } from './resources/seasons.js';
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
  CreateEventDiscountCodeParams,
  EventBookingFee,
  EventBuyerCheckout,
  EventBuyerCheckoutOption,
  EventBuyerCheckoutReplaceResult,
  EventBuyerCheckoutState,
  EventChartUpdateResult,
  EventDiscountCode,
  EventListOptions,
  EventPage,
  EventPaymentGatewayAssignment,
  EventPaymentGatewayOptions,
  EventSalesPreflightResult,
  EventSalesReadiness,
  EventSalesState,
  EventSalesTransitionResult,
  EventUpdateParams,
  PosterImage,
  UpdateEventDiscountCodeParams,
} from './resources/events.js';
export type {
  AddEventSeriesDatesParams,
  CreateEventSeriesParams,
  CreateEventSeriesFromPlanParams,
  CreateEventSeriesFromEventParams,
  EventSeries,
  EventSeriesCreated,
  EventSeriesDatesAdded,
  EventSeriesDetail,
  EventSeriesJobSummary,
  EventSeriesListOptions,
  EventSeriesPage,
  EventSeriesSchedule,
  EventSeriesUpdated,
  UpdateEventSeriesParams,
} from './resources/event-series.js';
export type {
  CreateHolderReturnParams,
  CreateHolderTransferParams,
  Customer,
  CustomerListOptions,
  CustomerPage,
  Holder,
  HolderReturn,
  HolderReturnTicket,
  HolderSeason,
  HolderTicket,
  HolderTicketDetail,
  HolderTicketListOptions,
  HolderTicketPage,
  TicketTransfer,
  UpdateHolderParams,
} from './resources/holders.js';
export type {
  CancelOrderParams,
  EventOrderCancelResult,
  EventOrderDetail,
  EventOrderExportOptions,
  EventOrderListOptions,
  EventOrderPage,
  EventOrderRefundResult,
  EventOrderResendResult,
  EventOrderStatus,
  EventOrderSummary,
  Order,
  OrderDetail,
  OrderLine,
  OrderListOptions,
  OrderPage,
  OrderStatus,
  OrderTicket,
  RefundOrderParams,
  ResendOrderTicketsParams,
} from './resources/orders.js';
export type { InstantiateTemplateOptions, InstantiateTemplateParams } from './resources/templates.js';
export type * from './types.js';

export default SeatLayer;
