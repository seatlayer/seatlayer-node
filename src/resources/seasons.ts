import type { HttpClient, RequestOptions } from '../http.js';
import type { EventHostingRegion } from '../types.js';
import type { CancelOrderParams, RefundOrderParams, ResendOrderTicketsParams } from './orders.js';

export type SeasonStructureState = 'draft' | 'active' | 'closing' | 'closed' | 'archived';
export type SeasonSalesState = 'closed' | 'open' | 'paused' | 'ended';
export type SeasonPublicationState = 'draft' | 'published' | 'superseded';

export interface SeasonSourcePerformanceGroup {
  key: string;
  activationId: string;
  memberSetSha256: string;
  activationSpecSha256: string;
  eventKeys: string[];
}

export interface SeasonPlan {
  key: string;
  name: string;
  publicationState: SeasonPublicationState;
  publishedRevision: number | null;
  activationId: string | null;
  channelPolicy: 'exclude_restricted';
  eventKeys: string[];
  sourcePerformanceGroups: SeasonSourcePerformanceGroup[];
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

export interface Season {
  key: string;
  name: string;
  edition: string | null;
  workspaceId: string;
  mode: 'live' | 'test';
  environment: string | null;
  chartId: string;
  sourceChartKey: string;
  sourceChartSha256: string;
  currency: string;
  venue: string | null;
  timezone: string | null;
  /** `public` lists the season on your SeatLayer website. */
  audience: 'embed_only' | 'public';
  /** Who takes the money: `seatlayer` (SeatLayer checkout) or `server` (your own). Null until you choose. */
  checkoutMode: 'seatlayer' | 'server' | null;
  /** Hours before a date starts that its tickets stop being sent to others; null is until it starts. */
  transferCutoffHours: number | null;
  /** Hours before a date starts that a holder can no longer give a seat back on it; null is until it starts. */
  returnCutoffHours: number | null;
  revision: number;
  structureState: SeasonStructureState;
  salesState: SeasonSalesState;
  occurrenceCount: number;
  createdAt: number;
  updatedAt: number;
  activatedAt: number | null;
  closedAt: number | null;
  buyerRehearsalReady: boolean;
}

export interface SeasonDetail extends Season {
  plans: SeasonPlan[];
}

/** What opening sales answers: the season and anything advised but not required. */
export interface SeasonSalesOpenResult {
  season: SeasonDetail;
  warnings: Array<{ code: 'checkout_test_missing' | (string & {}); message: string; [key: string]: unknown }>;
}

export interface SeasonCompatibilityIssue {
  code: string;
  message: string;
  field?: string;
  eventId?: string;
  sourcePerformanceGroupKey?: string;
  expected?: unknown;
  actual?: unknown;
  remediation?: string;
  [key: string]: unknown;
}

export interface SeasonValidation {
  valid: boolean;
  mode: 'live' | 'test';
  eventKeys: string[];
  occurrenceCount: number;
  sourcePerformanceGroups: SeasonSourcePerformanceGroup[];
  issues: SeasonCompatibilityIssue[];
}

export interface SeasonLifecycleOperation {
  operationId: string;
  kind: 'ACTIVATION' | 'CLOSE' | 'ARCHIVE' | 'PLAN_PUBLICATION';
  phase: string;
  terminal: boolean;
}

export interface SeasonLifecycleResult {
  season: SeasonDetail;
  lifecycleOperation: SeasonLifecycleOperation;
  /** Final response metadata retained for safe, bounded polling. */
  location?: string;
  retryAfterSeconds?: number;
}

export interface SeasonPlanPublicationResult extends SeasonLifecycleResult {
  plan: SeasonPlan;
}

export interface SeasonListOptions {
  workspaceId?: string;
  structureState?: SeasonStructureState;
  limit?: number;
  cursor?: string;
}

export interface SeasonSelectionParams {
  eventKeys?: string[];
  sourcePerformanceGroupKeys?: string[];
}

export interface CreateSeasonParams extends SeasonSelectionParams {
  name: string;
  edition?: string | null;
}

export interface CreateSeasonPlanParams extends SeasonSelectionParams {
  name: string;
}

export interface SeasonBuyerAccessSession {
  sessionId: string; allowedOrigin: string; mode: 'live' | 'test'; environment: string | null;
  expiresAt: number; includePublic: boolean; maxQuantity: number | null; buyerRef: string | null;
  planActivationId: string; state: 'active' | 'revoked'; createdAt: number; revokedAt: number | null;
}

export interface SeasonBuyerAccessReveal extends SeasonBuyerAccessSession {
  token: string;
  seasonKey: string;
}

export interface SeasonHoldItem {
  label: string;
  objectId: string;
  objectType: string;
  categoryKey: string;
  tierId: string | null;
  quantity: number;
  /** The price type the seat is held as: `adult` unless the hold named another. */
  priceTypeKey: string;
}

export interface SeasonHoldAllocation {
  eventKey: string;
  labels: string[];
  items: SeasonHoldItem[];
}

export interface SeasonHold {
  operationId: string; seasonKey: string; holdId: string; state: string; bookingRef: string | null;
  expiresAt: number; policy: 'fixed_inclusion_same_seat';
  pricingAuthority: 'host'; authoritativeAmountIncluded: false;
  allocations: SeasonHoldAllocation[];
}

export interface SeasonBooking {
  actionId: string; operationId: string; bookingRef: string; planActivationId: string;
  state: 'book_pending' | 'booked' | 'book_failed' | 'partial_terminal' | 'cancelled';
  outcomes: Array<{ eventKey: string; state: string; code: string | null }>;
  lastError: string | null;
  cancellation: null | {
    cancelActionId: string; state: 'cancel_pending' | 'cancelled' | 'cancel_failed' | 'partial_terminal';
    rightDisposition: 'preserve' | 'release';
    outcomes: Array<{ eventKey: string; state: string; code: string | null }>;
    lastError: string | null;
  };
}

export interface SeasonBookingResult {
  booking: SeasonBooking;
  location?: string;
  retryAfterSeconds?: number;
}

export interface SeasonHolderImportRow {
  rowId: string;
  holderRef: string;
  priorPlanActivationId: string;
  priorContractRef: string;
  labels: string[];
  existingBookingRef?: string | null;
  /** Where the holder's renewal emails go. */
  holderEmail?: string | null;
  holderName?: string | null;
}

export interface SeasonHolderImport {
  importId: string;
  dryRun: boolean;
  state: 'dry_run' | 'committed' | 'rejected';
  successorPlanActivationId: string;
  acceptedCount: number;
  rejectedCount: number;
  rows: Array<SeasonHolderImportRow & {
    decision: 'accepted' | 'invalid' | 'conflict';
    errorCode: string | null;
    existingBookingRef: string | null;
    contractId: string | null;
    rightId: string | null;
  }>;
  createdAt: number;
  committedAt: number | null;
}

export interface SeasonRenewalOffer {
  offerId: string;
  contractId: string;
  rightId: string;
  holderRef: string;
  successorPlanActivationId: string;
  labels: string[];
  state: 'offered' | 'intent_received' | 'committing' | 'renewed'
    | 'declined' | 'lapsed' | 'released' | 'partial_terminal';
  deadlineAt: number;
  intentId: string | null;
  intentAt: number | null;
  commitActionId: string | null;
  orderRef: string | null;
  bookingRef: string | null;
  successorContractId: string | null;
  /** Why the holder declined, when a decline gave a reason. The first decline's reason stays. */
  declineReason: string | null;
  commitOutcomes: Array<{
    eventKey: string;
    state: 'pending' | 'committed' | 'failed';
    code: string | null;
  }>;
  /**
   * Each seat with the price type its renewal keeps (a child seat renews at the
   * child price). Sent by `retrieveSeasonRenewalOffer` and `inspectSeasonRenewalOffer`.
   */
  seats?: Array<{ label: string; priceTypeKey: string; [key: string]: unknown }>;
  createdAt: number;
  updatedAt: number;
}

export interface SeasonRenewalResult {
  offer: SeasonRenewalOffer;
  location?: string;
  retryAfterSeconds?: number;
}

/** Why SeatLayer checkout cannot take a renewal now. */
export type SeasonRenewalQuoteProblem =
  | 'offer_not_open' | 'checkout_mode_not_seatlayer' | 'sales_ended' | 'plan_not_published'
  | 'seats_changed' | 'prices_missing' | 'unsupported_currency' | 'gateway_not_connected'
  | 'gateway_currency_mismatch';

/** What renewing an offer costs, priced as the SeatLayer checkout will charge it. */
export interface SeasonRenewalQuote {
  offerId: string;
  state: string;
  /** Null when the seats cannot be priced (`prices_missing`, `seats_changed`). */
  totalMinor: number | null;
  currency: string;
  /** One line per seat, for the whole package. */
  lines: Array<{
    label: string; category: string | null; priceTypeKey: string; amountMinor: number;
    [key: string]: unknown;
  }>;
  performances: Array<{ eventKey: string; name: string; startsAt: number | null; [key: string]: unknown }>;
  /** Null when SeatLayer checkout can take the renewal now; otherwise why not. */
  problem: SeasonRenewalQuoteProblem | null;
  [key: string]: unknown;
}

export interface SeasonRenewalCheckoutParams {
  /**
   * Where the buyer comes back to, on one of the organization's allowed domains.
   * `seatlayer_checkout=success` or `cancelled` is added.
   */
  returnUrl: string;
  /** Where the tickets go when no email is on file for the holder; the one on file wins. */
  buyerEmail?: string;
  buyerName?: string;
  /** Which connected gateway to pay with, when the organization has more than one. */
  provider?: string;
}

/** An order waiting for payment: send the buyer to `payment.url`; paying renews the offer. */
export interface SeasonRenewalCheckoutStarted {
  orderId: string;
  totalMinor: number;
  currency: string;
  /** When the payment window closes; the offer is held for this order until then. */
  expiresAt: number;
  payment: { url: string | null; [key: string]: unknown };
  [key: string]: unknown;
}

export interface DeclineSeasonRenewalOfferParams {
  /** Why the holder declined, 1 to 200 characters, kept on the offer as `declineReason`. */
  reason?: string;
}

export interface SeasonBuyerRehearsalResult {
  season: SeasonDetail;
  rehearsal: {
    ready: true; holdOperationId: string; bookActionId: string; cancelActionId: string;
    subscriptionId: string; occurrenceIds: string[]; payloadSha256: string[]; verifiedAt: number;
  };
}

export interface SeasonOccurrence {
  eventKey: string; position: number; name: string; startsAt: number | null;
  venue: string | null; timezone: string | null;
  latestAmendment: { amendmentId: string; kind: string; classification: string } | null;
}

/** Amendment kinds you can ask for with `createSeasonAmendment`. */
export type SeasonAmendmentRequestKind = 'reschedule' | 'replace' | 'cancel_exception' | 'postpone' | 'cancel';

/**
 * Every amendment kind a read can return: the requestable kinds plus the
 * membership records a package's date changes write.
 */
export type SeasonAmendmentKind = SeasonAmendmentRequestKind
  | 'performance_added' | 'performance_removed' | 'performance_past';

export interface CreateSeasonAmendmentParams {
  eventKey: string;
  kind: SeasonAmendmentRequestKind;
  startsAt?: number;
  name?: string;
  /** With `cancel` only: refund the date's SeatLayer orders as a job. `none` (the default) refunds nothing. */
  /** Refund each holder for the cancelled date (`per_date`). A whole-order refund is the order refund. */
  refund?: 'none' | 'per_date';
  /** With a refund: kept on the job. */
  reason?: string;
}

export interface SeasonAmendment {
  amendmentId: string; revision: number; eventKey: string;
  kind: SeasonAmendmentKind;
  classification: 'identity_preserving' | 'exception';
  planActivationId: string | null; occurrenceSetSha256: string;
  before: Record<string, unknown>; after: Record<string, unknown>;
  state: 'applied' | 'exception';
  contractOutcomes: Array<{ contractId: string; outcome: 'unchanged' | 'operator_exception' }>;
  allocationOutcomes: Array<{
    allocationId: string; eventKey: string; outcome: 'unchanged' | 'operator_exception';
  }>;
  createdAt: number;
}

export interface SeasonReport {
  seasonKey: string; generatedAt: number;
  authorities: { live: 'season_do'; catalogue: 'd1' };
  inventory: { occurrenceCount: number; bookings: number; booked: number; cancelled: number };
  renewals: Record<string, number>; operations: Record<string, number>;
  allocations: { total: number; byState: Record<string, number>; bySource: Record<string, number> };
  stuckOperations: number;
  webhooks: {
    undelivered: number; delivered: number;
    deliveryDefinition: 'at_least_one_receiver_2xx';
    attempts: number; successfulAttempts: number; failedAttempts: number;
    lastEventName: string | null;
  };
}

export interface SeasonOperationSummary {
  operationId: string; kind: string; state: string; holdId: string;
  bookingRef: string | null; allocations: Array<{ eventId: string; state: string }>;
}

export interface SeasonSupportLookup {
  bookingRef: string | null; holderRef: string | null;
  bookings: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
}

export interface SeasonOutboxOccurrence {
  occurrenceId: string; eventName: string; payloadSha256: string;
  payload: Record<string, unknown>; createdAt: number; deliveredAt: number | null;
  replayedAt: number | null; replayCount: number;
}

export interface SeasonAuditEntry {
  id: number; action: string; actorKind: string; details: unknown; at: number;
}

export interface SeasonHolderImportFromSeason {
  sourceSeasonId: string;
  successorPlanActivationId: string;
  dryRun: boolean;
  holders: number;
  acceptedCount: number;
  alreadyImported: number;
  rejectedCount: number;
  withEmail: number;
  hosted: number;
  integrator: number;
  excluded: {
    refunded: number; rehearsal: number; tooManySeats: number; unusableRef: number;
    [key: string]: unknown;
  };
  importIds: string[];
  rejected: Array<{ holderRef: string; labels: string[]; errorCode: string | null; [key: string]: unknown }>;
  preview: Array<{
    holderRef: string; holderName: string | null; hasEmail: boolean; labels: string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** A package (Plan) as the performance views show it. */
export interface SeasonPackageSummary {
  planKey: string;
  name: string | null;
  published: boolean;
  performanceCount: number;
  [key: string]: unknown;
}

export interface SeasonPerformance {
  eventKey: string;
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  timezone: string | null;
  venue: string | null;
  status: string;
  salesState: string;
  mode: 'live' | 'test';
  past: boolean;
  packages: Array<{ planKey: string; name: string | null; published: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface SeasonPerformanceList {
  seasonKey: string;
  performances: SeasonPerformance[];
  packages: SeasonPackageSummary[];
  [key: string]: unknown;
}

export interface SeasonPerformanceCreateResult extends SeasonPerformanceList {
  created: Array<{ eventKey: string; name: string; startsAt: number; [key: string]: unknown }>;
}

export interface CreateSeasonPerformancesParams {
  /** Title for each performance; the API fills in the date. */
  titlePattern: string;
  firstStartsAt?: number;
  timezone: string;
  repeat: 'none' | 'daily' | 'weekly' | 'biweekly' | 'dates';
  count?: number;
  /** Start times in epoch milliseconds, for `repeat: 'dates'`. */
  dates?: number[];
  venue?: string | null;
  durationMinutes?: number | null;
  region?: EventHostingRegion;
  attachToPlanKeys?: string[];
}

export interface SeasonPackageResult extends SeasonPerformanceList {
  package: SeasonPackageSummary;
}

export interface SeasonPublishResult {
  season: {
    key: string; name: string; structureState: SeasonStructureState; salesState: SeasonSalesState;
    revision: number; [key: string]: unknown;
  };
  packages: Array<{
    planKey: string; name: string; published: true; activationId: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SeasonCheckoutTest {
  id: string;
  status: 'passed' | 'failed';
  startedAt: number;
  finishedAt: number;
  planKey: string;
  seats: string[];
  steps: Array<{
    step: 'session' | 'availability' | 'hold' | 'release';
    ok: boolean; durationMs: number; message?: string; detail?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** The kinds of seat a package can price a category for. A price without one is `adult`. */
export type SeasonPriceTypeKey = 'adult' | 'child' | 'concession' | 'senior' | 'student';

export interface SeasonPackagePrice {
  categoryKey: string;
  priceTypeKey: SeasonPriceTypeKey;
  /** The type's display name, such as `Child`. */
  priceTypeLabel: string;
  /** Minor units. */
  unitPrice: number;
  [key: string]: unknown;
}

/** One row of a `replaceSeasonPackagePrices` table. */
export interface SeasonPackagePriceInput {
  categoryKey: string;
  /** Leave out for `adult`. Each category takes each type once. */
  priceTypeKey?: SeasonPriceTypeKey;
  /** Minor units. */
  unitPrice: number;
}

export interface SeasonPackagePrices {
  planKey: string;
  currency: string;
  prices: SeasonPackagePrice[];
  [key: string]: unknown;
}

export interface SeasonPriceList {
  seasonKey: string;
  currency: string;
  packages: Array<{ planKey: string; name: string | null; prices: SeasonPackagePrice[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Background work started when a date is added to or removed from a published package. */
export interface SeasonDateJob {
  jobId: string;
  kind: 'date_added' | 'date_removed';
  state: 'planning' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  done: number;
  skipped: number;
  failed: number;
  pending: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  [key: string]: unknown;
}

export type SeasonBulkJobKind =
  | 'date_added' | 'date_removed' | 'renewal_run' | 'lapsed_release' | 'bulk_refund' | 'holder_import'
  | 'series_dates' | 'series_update';

export type SeasonBulkJobState = 'planning' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SeasonBulkJobCounts {
  total: number;
  done: number;
  skipped: number;
  failed: number;
  [key: string]: unknown;
}

/** Background work on a Season, such as the refund of a cancelled date. */
export interface SeasonBulkJob {
  jobId: string;
  kind: SeasonBulkJobKind;
  state: SeasonBulkJobState;
  counts: SeasonBulkJobCounts;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  [key: string]: unknown;
}

export interface SeasonBulkJobDetail extends SeasonBulkJob {
  /**
   * What the job ended with, empty until it completes. `holder_import`: the same counts as a
   * bring-across of 100 holders or fewer. `renewal_run`: `batchId`, `offered`, `skipped`, `failed`.
   */
  summary: Record<string, unknown>;
  /** At most 500. For a refund, `key` is the order id and `error` the provider's reason. */
  failedItems: Array<{ key: string; error: string | null; attempts: number; [key: string]: unknown }>;
}

/** The 202 answer of `createSeasonRenewalOffers` above 100 contracts: a `renewal_run` job makes them. */
export interface SeasonRenewalOfferJob {
  job: SeasonBulkJob;
  /** The batch the job is making offers for. Read them with `listSeasonRenewalOffers` once it completes. */
  batchId: string;
}

/** One page of a renewal offer list. Pass `cursor` from the previous page's `nextCursor`. */
export interface SeasonRenewalOfferPageOptions {
  cursor?: string;
  /**
   * Offers a page: 1-100 for `listSeasonRenewalOffers` (default 100), 1-500 for
   * `retrieveSeasonHostedRenewals` (default 500).
   */
  limit?: number;
}

/** The refund job a `cancel` amendment started when it asked for a refund. */
export interface SeasonRefundJobSummary {
  jobId: string;
  kind: 'bulk_refund';
  state: string;
  counts: SeasonBulkJobCounts;
  [key: string]: unknown;
}

export interface RefundSeasonPerformanceParams {
  /** `per_date`: the date's share of each order (rounded down). `full`: what is left of each order. */
  /** What is refunded: each holder's share for this date. `full` is refused (`422 date_refund_per_date_only`); refund a whole order with the order refund. */
  amount: 'per_date';
  /** Kept on the job. */
  reason?: string;
}

export interface UpdateSeasonParams {
  expectedRevision: number;
  name?: string;
  edition?: string | null;
  /** Who takes the money. It cannot go back to undecided, and it is fixed once a live booking exists. */
  checkoutMode?: 'seatlayer' | 'server';
  /** Hours before a date starts that its tickets stop being sent to others (0 to 720); `null` means until it starts. */
  transferCutoffHours?: number | null;
  /** Hours before a date starts that a holder can no longer give a seat back (0 to 720); `null` means until it starts. */
  returnCutoffHours?: number | null;
  /** `public` lists the season on your SeatLayer website; an ended season cannot become public (`409 sales_ended`). */
  audience?: 'embed_only' | 'public';
}

export interface SeasonStoppedOrder {
  orderId: string | null;
  bookingRef: string;
  holderRef: string | null;
  reason: string;
  [key: string]: unknown;
}

export interface SeasonPlanPerformanceAttachResult extends SeasonPerformanceList {
  extended: number;
  conflicts: Array<{
    label: string; bookingRef: string; holderRef?: string;
    reason: 'seat_taken' | 'seat_blocked' | 'seat_missing';
    [key: string]: unknown;
  }>;
  ticketsIssued: number;
  stopped: SeasonStoppedOrder[];
  stoppedTruncated?: boolean;
  job: SeasonDateJob | null;
}

export interface SeasonPlanPerformanceRemoveResult extends SeasonPerformanceList {
  released: number;
  stopped: SeasonStoppedOrder[];
  stoppedTruncated?: boolean;
  job: SeasonDateJob | null;
}

/** The booking or renewal offer the returned seats came from. */
export type SeasonOccurrenceInventorySource = { bookingActionId: string } | { renewalOfferId: string };

export interface SeasonOccurrenceInventoryAction {
  actionId: string;
  returnActionId: string;
  eventKey: string;
  planActivationId: string;
  state: 'returned' | 'reclaimed';
  labels: string[];
  [key: string]: unknown;
}

export interface SeasonHolder {
  id: string;
  kind: 'hosted' | 'integrator' | 'imported';
  bookingRef: string | null;
  orderId: string | null;
  orderNumber: string | null;
  holderName: string | null;
  holderEmail: string | null;
  holderRef: string | null;
  labels: string[];
  packageName: string | null;
  packageId: string | null;
  dates: Array<{ eventKey: string; state: 'active' | 'cancelled' | 'problem'; [key: string]: unknown }>;
  datesTotal: number;
  datesActive: number;
  datesCancelled: number;
  paid: { amountMinor: number; currency: string; refundedMinor: number; [key: string]: unknown } | null;
  soldAtCounter: boolean;
  orderStatus: string | null;
  status: 'active' | 'partly_cancelled' | 'cancelled' | 'needs_review'
    | 'reserved' | 'renewal_open' | 'renewed' | 'declined' | 'lapsed';
  renewal: { offerId: string; state: string; deadlineAt: number | null; [key: string]: unknown } | null;
  boughtAt: number | null;
  [key: string]: unknown;
}

export interface SeasonHolderPage {
  holders: SeasonHolder[];
  nextCursor: string | null;
  totals?: { holders: number; active: number; cancelled: number; imported: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface SeasonHolderFilter {
  /** Search by holder name, email, reference, order number or seat. */
  q?: string;
  status?: 'active' | 'cancelled' | 'renewal';
}

export interface SeasonHolderListOptions extends SeasonHolderFilter {
  cursor?: string;
  /** Page size. Defaults to 50 and is capped at 100. */
  limit?: number;
}

export interface SeasonOrderRefund {
  orderId: string;
  refundId: string | null;
  amountMinor: number | null;
  currency: string;
  state: 'succeeded' | 'pending' | 'unknown' | 'cancelled';
  [key: string]: unknown;
}

export interface SeasonOrderCancelReceipt {
  orderId: string;
  displayRef: string;
  status: 'refunded';
  currency: string;
  settledOutsideMinor: number;
  released: string[];
  seatsReleased: boolean;
  emailQueued: boolean;
  cancelledAt: number;
  [key: string]: unknown;
}

export interface SeasonOrderDateCancel {
  eventKey: string;
  ticketsVoided: number;
  labels: string[];
  state: 'returned' | 'pending';
  [key: string]: unknown;
}

export interface SeasonHostedRenewals {
  checkoutMode: 'seatlayer' | 'server' | null;
  transferCutoffHours?: number | null;
  readiness: {
    ready: boolean;
    problem: string | null;
    /** With `prices_missing`: the seat types holders renew as that their next package does not price. */
    missingPrices?: Array<{ packageId: string; categoryKey: string; priceTypeKey: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  holdersWithoutEmail: number;
  /** Pass back as `cursor` for the next page of offers; null on the last. */
  nextCursor: string | null;
  offers: Array<{
    offerId: string;
    holderName: string | null;
    holderEmail: string | null;
    linkActiveSince: number | null;
    paymentActive: boolean;
    notices: {
      invitedAt: number | null; lastReminderAt: number | null; nextNoticeAt: number | null;
      nextNoticeKind: string | null; problem: string | null; [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SeasonSeatCounts {
  sold: number;
  byPackage: Array<{
    packageId: string | null; packageName: string | null; seats: number; holders: number;
    [key: string]: unknown;
  }>;
  byDate: Array<{
    eventKey: string; name: string | null; startsAt: number | null; timezone: string | null; seats: number;
    byPackage: Array<{ packageId: string | null; seats: number; [key: string]: unknown }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SeasonSalesReport {
  season: {
    key: string; name: string; currency: string; mode: 'live' | 'test';
    checkoutMode: string | null; timezone: string | null; [key: string]: unknown;
  };
  generatedAt: number;
  ownCheckout: boolean;
  money: {
    rows: Array<{
      packageId: string | null; packageName: string | null; channel: 'online' | 'box_office';
      currency: string; orders: number; refundedOrders: number; seats: number; grossMinor: number;
      discountMinor: number; refundedMinor: number; netMinor: number; [key: string]: unknown;
    }>;
    [key: string]: unknown;
  } | null;
  seats: SeasonSeatCounts | null;
  holders: {
    total: number; active: number; cancelled: number; imported: number; importedRenewed: number;
    soldThroughSeatLayer: number; soldThroughYourCheckout: number;
    byStatus: { all: number; active: number; cancelled: number; renewal: number; [key: string]: unknown };
    [key: string]: unknown;
  } | null;
  renewals: {
    offered: number; renewed: number; declined: number; lapsed: number; open: number;
    needsReview: number; rate: number | null; [key: string]: unknown;
  } | null;
  downloadLimit: number;
  /** Sections the report could not compute this time; each is null above. */
  unavailable: Array<'seats' | 'holders' | 'renewals'>;
  [key: string]: unknown;
}

export interface SeasonSeatsReport {
  packages: Array<{
    packageId: string | null; packageName: string; datesLeft: number;
    state: 'ok' | 'no_dates_left' | 'chart_unavailable' | 'dates_differ';
    freeEveryDate: number | null; notEveryDate: number | null; renewalHeld: number | null;
    [key: string]: unknown;
  }>;
  dates: Array<{ eventKey: string; free: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface WaitForSeasonLifecycleOptions {
  /** Maximum elapsed wait. Default 30 seconds. */
  timeoutMs?: number;
  /** Cancels both waits and polling requests. */
  signal?: AbortSignal;
}

export class SeasonLifecycleTimeoutError extends Error {
  constructor(readonly operationId: string, readonly timeoutMs: number) {
    super(`Season lifecycle operation ${operationId} did not finish within ${timeoutMs}ms.`);
    this.name = 'SeasonLifecycleTimeoutError';
  }
}

export class SeasonBookingTimeoutError extends Error {
  constructor(readonly actionId: string, readonly timeoutMs: number) {
    super(`Season booking operation ${actionId} did not finish within ${timeoutMs}ms.`);
    this.name = 'SeasonBookingTimeoutError';
  }
}

export class SeasonRenewalTimeoutError extends Error {
  constructor(readonly offerId: string, readonly timeoutMs: number) {
    super(`Season renewal offer ${offerId} did not finish within ${timeoutMs}ms.`);
    this.name = 'SeasonRenewalTimeoutError';
  }
}

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Season lifecycle wait was aborted.'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Season lifecycle wait was aborted.'));
    }, { once: true });
  });
}

/** Fixed Renewable Season organizer operations for trusted Node.js backends. */
export class Seasons {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  listSeasons(options: SeasonListOptions = {}): Promise<{ seasons: Season[]; nextCursor: string | null }> {
    return this.#http.get('/v1/seasons', { query: {
      workspaceId: options.workspaceId,
      structureState: options.structureState,
      limit: options.limit,
      cursor: options.cursor,
    } });
  }

  /** Read-only preflight. It never creates or mutates a Season. */
  validateSeason(params: SeasonSelectionParams): Promise<SeasonValidation> {
    return this.#http.post('/v1/seasons/validate', { body: params });
  }

  createSeason(
    params: CreateSeasonParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ season: SeasonDetail }> {
    return this.#http.postWithHeaderReplay('/v1/seasons', {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  retrieveSeason(seasonKey: string): Promise<{ season: SeasonDetail }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}`);
  }

  updateSeason(
    seasonKey: string,
    params: UpdateSeasonParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ season: SeasonDetail }> {
    return this.#http.mutationWithHeaderReplay('PATCH', `/v1/seasons/${pathPart(seasonKey)}`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  deleteSeason(
    seasonKey: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.#http.mutationWithHeaderReplay('DELETE', `/v1/seasons/${pathPart(seasonKey)}`, {
      idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  activateSeason(seasonKey: string, expectedRevision: number): Promise<SeasonLifecycleResult> {
    return this.#lifecycle(`/v1/seasons/${pathPart(seasonKey)}/activate`, { expectedRevision });
  }

  closeSeason(seasonKey: string, expectedRevision: number): Promise<SeasonLifecycleResult> {
    return this.#lifecycle(`/v1/seasons/${pathPart(seasonKey)}/close`, { expectedRevision });
  }

  archiveSeason(seasonKey: string, expectedRevision: number): Promise<SeasonLifecycleResult> {
    return this.#lifecycle(`/v1/seasons/${pathPart(seasonKey)}/archive`, { expectedRevision });
  }

  retrieveSeasonLifecycle(seasonKey: string, operationId: string): Promise<SeasonLifecycleResult> {
    return this.#lifecycle(
      `/v1/seasons/${pathPart(seasonKey)}/lifecycle/${pathPart(operationId)}`,
      undefined,
      'GET',
    );
  }

  createSeasonPlan(
    seasonKey: string,
    params: CreateSeasonPlanParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ plan: SeasonPlan }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/plans`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  retrieveSeasonPlan(seasonKey: string, planKey: string): Promise<{ plan: SeasonPlan }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}`);
  }

  publishSeasonPlan(
    seasonKey: string,
    planKey: string,
    expectedRevision: number,
  ): Promise<SeasonPlanPublicationResult> {
    return this.#lifecycle(
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}/publish`,
      { expectedRevision },
    ) as Promise<SeasonPlanPublicationResult>;
  }

  supersedeSeasonPlan(
    seasonKey: string,
    planKey: string,
    expectedRevision: number,
  ): Promise<SeasonPlanPublicationResult> {
    return this.#http.post(
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}/supersede`,
      { body: { expectedRevision } },
    );
  }

  /**
   * Open sales. `warnings` says what is advised but not required, such as
   * `checkout_test_missing` until a checkout test or rehearsal has passed.
   */
  openSeasonSales(seasonKey: string, expectedRevision: number): Promise<SeasonSalesOpenResult> {
    return this.#sales(seasonKey, 'open', expectedRevision) as Promise<SeasonSalesOpenResult>;
  }

  pauseSeasonSales(seasonKey: string, expectedRevision: number): Promise<{ season: SeasonDetail }> {
    return this.#sales(seasonKey, 'pause', expectedRevision);
  }

  resumeSeasonSales(seasonKey: string, expectedRevision: number): Promise<{ season: SeasonDetail }> {
    return this.#sales(seasonKey, 'resume', expectedRevision);
  }

  endSeasonSales(seasonKey: string, expectedRevision: number): Promise<{ season: SeasonDetail }> {
    return this.#sales(seasonKey, 'end', expectedRevision);
  }

  duplicateSeasonToLive(
    seasonKey: string,
    params: { eventKeys: string[]; name?: string },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ season: SeasonDetail }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/duplicate-to-live`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  createSeasonBuyerAccessSession(seasonKey: string, params: {
    allowedOrigin: string; includePublic: boolean; expiresInSeconds?: number;
    maxQuantity?: number | null; buyerRef?: string | null;
  }): Promise<SeasonBuyerAccessReveal> {
    return this.#http.post(`/v1/seasons/${pathPart(seasonKey)}/buyer-access-sessions`, { body: params });
  }

  listSeasonBuyerAccessSessions(seasonKey: string, options: { limit?: number } = {}): Promise<{
    sessions: SeasonBuyerAccessSession[];
  }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/buyer-access-sessions`, {
      query: { limit: options.limit },
    });
  }

  revokeSeasonBuyerAccessSession(seasonKey: string, sessionId: string): Promise<{
    ok: true; sessionId: string;
  }> {
    return this.#http.delete(
      `/v1/seasons/${pathPart(seasonKey)}/buyer-access-sessions/${pathPart(sessionId)}`,
    );
  }

  retrieveSeasonHold(seasonKey: string, operationId: string): Promise<{ hold: SeasonHold }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/holds/${pathPart(operationId)}`);
  }

  bookSeasonHold(seasonKey: string, operationId: string, params: {
    bookActionId: string; bookingRef: string;
  }): Promise<SeasonBookingResult> {
    return this.#booking(`/v1/seasons/${pathPart(seasonKey)}/holds/${pathPart(operationId)}/book`, params);
  }

  retrieveSeasonBooking(seasonKey: string, actionId: string): Promise<SeasonBookingResult> {
    return this.#booking(`/v1/seasons/${pathPart(seasonKey)}/bookings/${pathPart(actionId)}`, undefined, 'GET');
  }

  cancelSeasonBooking(seasonKey: string, actionId: string, params: {
    cancelActionId: string; bookingRef: string; planActivationId: string;
    rightDisposition: 'preserve' | 'release';
  }): Promise<SeasonBookingResult> {
    return this.#booking(
      `/v1/seasons/${pathPart(seasonKey)}/bookings/${pathPart(actionId)}/cancel`, params,
    );
  }

  validateSeasonBuyerRehearsal(seasonKey: string): Promise<SeasonBuyerRehearsalResult> {
    return this.#http.post(`/v1/seasons/${pathPart(seasonKey)}/buyer-rehearsals/validate`);
  }

  createSeasonHolderImport(
    seasonKey: string,
    params: { successorPlanActivationId: string; dryRun?: boolean; rows: SeasonHolderImportRow[] },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ import: SeasonHolderImport }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/imports`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** @deprecated Use createSeasonHolderImport, which matches the public operation id. */
  importSeasonHolders(
    seasonKey: string,
    params: { successorPlanActivationId: string; dryRun?: boolean; rows: SeasonHolderImportRow[] },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ import: SeasonHolderImport }> {
    return this.createSeasonHolderImport(seasonKey, params, options);
  }

  retrieveSeasonHolderImport(seasonKey: string, importId: string): Promise<{ import: SeasonHolderImport }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/imports/${pathPart(importId)}`);
  }

  /**
   * Make one renewal offer per eligible prior Contract. 100 contracts or fewer answer
   * `{ offers }`; more answer 202 `{ job, batchId }`: a `renewal_run` job makes the offers.
   * Follow it with `retrieveSeasonBulkJob`, then page them with `listSeasonRenewalOffers`.
   * Retried safely with one Idempotency-Key, which answers the same offers or job.
   */
  createSeasonRenewalOffers(
    seasonKey: string,
    params: { successorPlanActivationId?: string; deadlineAt: number; contractIds?: string[] },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ offers: SeasonRenewalOffer[] } | SeasonRenewalOfferJob> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** One page of renewal offers, newest first. Pass `cursor` from the previous page's `nextCursor`. */
  listSeasonRenewalOffers(seasonKey: string, options: SeasonRenewalOfferPageOptions = {}): Promise<{
    offers: SeasonRenewalOffer[]; truncated: boolean; nextCursor: string | null;
  }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers`, { query: {
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  retrieveSeasonRenewalOffer(seasonKey: string, offerId: string): Promise<SeasonRenewalResult> {
    return this.#renewal(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}`, undefined, 'GET');
  }

  inspectSeasonRenewalOffer(seasonKey: string, offerId: string): Promise<SeasonRenewalResult> {
    return this.#renewal(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/inspect`, undefined, 'GET',
    );
  }

  extendSeasonRenewalOffer(seasonKey: string, offerId: string, deadlineAt: number): Promise<SeasonRenewalResult> {
    return this.#renewal(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/extend`, { deadlineAt },
    );
  }

  commitSeasonRenewalOffer(seasonKey: string, offerId: string, params: {
    commitActionId: string; orderRef: string; bookingRef: string; planActivationId: string;
  }): Promise<SeasonRenewalResult> {
    return this.#renewal(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/commit`, params,
    );
  }

  /** Decline an offer and release its seats at once, optionally with the holder's reason. */
  declineSeasonRenewalOffer(
    seasonKey: string,
    offerId: string,
    params: DeclineSeasonRenewalOfferParams = {},
  ): Promise<SeasonRenewalResult> {
    return this.#renewal(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/decline`, params,
    );
  }

  releaseSeasonRenewalOffer(seasonKey: string, offerId: string): Promise<SeasonRenewalResult> {
    return this.#renewal(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/release`, {},
    );
  }

  listSeasonOccurrences(seasonKey: string): Promise<{ occurrences: SeasonOccurrence[] }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/occurrences`);
  }

  createSeasonAmendment(
    seasonKey: string,
    params: CreateSeasonAmendmentParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ amendment: SeasonAmendment; refundJob?: SeasonRefundJobSummary }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/amendments`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  listSeasonAmendments(seasonKey: string): Promise<{ amendments: SeasonAmendment[]; truncated: boolean }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/amendments`);
  }

  retrieveSeasonAmendment(seasonKey: string, amendmentId: string): Promise<{ amendment: SeasonAmendment }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/amendments/${pathPart(amendmentId)}`);
  }

  retrieveSeasonReport(seasonKey: string): Promise<{ report: SeasonReport }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/reports`);
  }

  listSeasonOperations(seasonKey: string): Promise<{ operations: SeasonOperationSummary[]; truncated: boolean }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/operations`);
  }

  retrieveSeasonSupportLookup(
    seasonKey: string,
    query: { bookingRef?: string; holderRef?: string },
  ): Promise<{ requestId: string; lookup: SeasonSupportLookup }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/support-lookups`, { query });
  }

  listSeasonOutbox(seasonKey: string): Promise<{
    outbox: SeasonOutboxOccurrence[]; undelivered: number; truncated: boolean;
  }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/outbox`);
  }

  replaySeasonOutbox(seasonKey: string, occurrenceId: string): Promise<{ occurrence: SeasonOutboxOccurrence }> {
    return this.#http.post(
      `/v1/seasons/${pathPart(seasonKey)}/outbox/${pathPart(occurrenceId)}/replay`, { body: {} },
    );
  }

  listSeasonAudit(seasonKey: string): Promise<{
    requestId: string; audit: SeasonAuditEntry[]; truncated: boolean;
  }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/audit`);
  }

  exportSeasonSupportSnapshot(seasonKey: string): Promise<{
    requestId: string; export: Record<string, unknown>;
  }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/export`);
  }

  /**
   * Dry-run or commit renewal rights derived from a previous season's holders.
   * A commit of more than 100 holders answers 202 `{ job }`: a `holder_import` job brings them
   * across, and its `summary` has the same counts when it completes.
   * Retried safely with one Idempotency-Key, which answers the same import or job.
   */
  createSeasonHolderImportFromSeason(
    seasonKey: string,
    params: { sourceSeasonId: string; successorPlanActivationId: string; dryRun?: boolean },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ import: SeasonHolderImportFromSeason } | { job: SeasonBulkJob }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/imports/from-season`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** List a Season's performances and package membership, in every lifecycle state. */
  listSeasonPerformances(seasonKey: string): Promise<SeasonPerformanceList> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/performances`);
  }

  /** Create performances inside a draft Season from a repeat rule. Retried safely with one Idempotency-Key. */
  createSeasonPerformances(
    seasonKey: string,
    params: CreateSeasonPerformancesParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPerformanceCreateResult> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/performances`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** Attach existing Events to a draft Season and its packages. Retried safely with one Idempotency-Key. */
  attachSeasonPerformances(
    seasonKey: string,
    params: { eventKeys: string[]; attachToPlanKeys?: string[] },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPerformanceList> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/performances/attach`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** Remove a performance from a draft Season and every package. Retried safely with one Idempotency-Key. */
  deleteSeasonPerformance(
    seasonKey: string,
    eventKey: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPerformanceList> {
    return this.#http.mutationWithHeaderReplay(
      'DELETE',
      `/v1/seasons/${pathPart(seasonKey)}/performances/${pathPart(eventKey)}`,
      { idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** Rename a draft package or change the performances it covers. Retried safely with one Idempotency-Key. */
  updateSeasonPlan(
    seasonKey: string,
    planKey: string,
    params: { name?: string; eventKeys?: string[] },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPackageResult> {
    return this.#http.mutationWithHeaderReplay(
      'PATCH',
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Delete a draft package that is not the Season's last one. Resolves with
   * nothing (204). Retried safely with one Idempotency-Key.
   */
  deleteSeasonPlan(
    seasonKey: string,
    planKey: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.#http.mutationWithHeaderReplay(
      'DELETE',
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}`,
      { idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Activate the Season structure and publish every draft package in one call.
   * Retried safely with one Idempotency-Key.
   */
  publishSeason(
    seasonKey: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPublishResult> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/publish`, {
      idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /**
   * Run a server-side hold and release to prove the Season buyer path.
   * Retried safely with one Idempotency-Key.
   */
  createSeasonCheckoutTest(
    seasonKey: string,
    params?: { planKey?: string; quantity?: number },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ test: SeasonCheckoutTest }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/checkout-tests`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** List recent Season checkout tests, newest first. */
  listSeasonCheckoutTests(seasonKey: string): Promise<{ tests: SeasonCheckoutTest[] }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/checkout-tests`);
  }

  /**
   * Replace a package's price table, per chart category, in minor units.
   * Retried safely with one Idempotency-Key.
   */
  replaceSeasonPackagePrices(
    seasonKey: string,
    planKey: string,
    params: { prices: SeasonPackagePriceInput[]; currency?: string },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPackagePrices> {
    return this.#http.mutationWithHeaderReplay(
      'PUT',
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}/prices`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** List every package price table for a Season. */
  listSeasonPrices(seasonKey: string): Promise<SeasonPriceList> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/prices`);
  }

  /**
   * Add a performance to a published package and extend its holders' allocations.
   * Retried safely with one Idempotency-Key; a 202 carries the background `job`.
   */
  attachSeasonPlanPerformance(
    seasonKey: string,
    planKey: string,
    params: { eventKey: string },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPlanPerformanceAttachResult> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}/performances`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Remove a performance from a published package and release its allocations.
   * Retried safely with one Idempotency-Key; a 202 carries the background `job`.
   */
  deleteSeasonPlanPerformance(
    seasonKey: string,
    planKey: string,
    eventKey: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPlanPerformanceRemoveResult> {
    return this.#http.mutationWithHeaderReplay(
      'DELETE',
      `/v1/seasons/${pathPart(seasonKey)}/plans/${pathPart(planKey)}/performances/${pathPart(eventKey)}`,
      { idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Mark a performance past so it stops blocking new Season sales.
   * Retried safely with one Idempotency-Key.
   */
  markSeasonPerformancePast(
    seasonKey: string,
    eventKey: string,
    params: { force?: boolean },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonPerformanceList> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/performances/${pathPart(eventKey)}/past`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Return one occurrence's Season allocation to ordinary Event inventory.
   * Single-attempt: `actionId` is the domain identity to reuse after an unknown outcome.
   */
  returnSeasonOccurrenceInventory(seasonKey: string, eventKey: string, params: {
    actionId: string; bookingRef: string; planActivationId: string; labels: string[];
    source: SeasonOccurrenceInventorySource;
  }): Promise<{ occurrenceInventoryAction: SeasonOccurrenceInventoryAction }> {
    return this.#http.post(
      `/v1/seasons/${pathPart(seasonKey)}/occurrences/${pathPart(eventKey)}/returns`, { body: params },
    );
  }

  /**
   * Reclaim returned occurrence inventory while it is still free.
   * Single-attempt: `actionId` is the domain identity to reuse after an unknown outcome.
   */
  reclaimSeasonOccurrenceInventory(seasonKey: string, eventKey: string, params: {
    actionId: string; returnActionId: string; bookingRef: string; planActivationId: string;
    labels: string[]; source: SeasonOccurrenceInventorySource;
  }): Promise<{ occurrenceInventoryAction: SeasonOccurrenceInventoryAction }> {
    return this.#http.post(
      `/v1/seasons/${pathPart(seasonKey)}/occurrences/${pathPart(eventKey)}/reclaims`, { body: params },
    );
  }

  /** One page of season ticket holders. Pass `cursor` from the previous page's `nextCursor`. */
  listSeasonHolders(seasonKey: string, options: SeasonHolderListOptions = {}): Promise<SeasonHolderPage> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/holders`, { query: {
      q: options.q,
      status: options.status,
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  /**
   * Refund a season order in full or in part through its payment provider.
   * Retried safely with one Idempotency-Key; a 202 means the refund is still pending.
   */
  refundSeasonOrder(
    seasonKey: string,
    orderId: string,
    params?: RefundOrderParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonOrderRefund> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/orders/${pathPart(orderId)}/refund`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Cancel a season order without moving money, and release every date.
   * Retried safely with one Idempotency-Key.
   */
  cancelSeasonOrder(
    seasonKey: string,
    orderId: string,
    params: CancelOrderParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ receipt: SeasonOrderCancelReceipt }> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/orders/${pathPart(orderId)}/cancel`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Take back one date of a season order and put its seats back on sale.
   * Retried safely with one Idempotency-Key; a 202 means the return is still pending.
   */
  cancelSeasonOrderDate(
    seasonKey: string,
    orderId: string,
    eventKey: string,
    params?: { actionId?: string },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ dateCancel: SeasonOrderDateCancel }> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/orders/${pathPart(orderId)}/dates/${pathPart(eventKey)}/cancel`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** Email a season order's tickets again. Sent once: an unknown outcome is not retried. */
  resendSeasonOrderTickets(
    seasonKey: string,
    orderId: string,
    params?: ResendOrderTicketsParams,
  ): Promise<{ sentTo: string; [key: string]: unknown }> {
    return this.#http.post(
      `/v1/seasons/${pathPart(seasonKey)}/orders/${pathPart(orderId)}/resend`, { body: params },
    );
  }

  /**
   * Retrieve hosted renewal links, payments and emails for one page of offers, newest first.
   * Pass `cursor` from the previous page's `nextCursor`.
   */
  retrieveSeasonHostedRenewals(
    seasonKey: string,
    options: SeasonRenewalOfferPageOptions = {},
  ): Promise<SeasonHostedRenewals> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/renewal-hosted`, { query: {
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  /**
   * Make a new renewal link for one holder; the old link stops working. The
   * URL is shown once and the call is never retried, so a lost response means
   * rotating again.
   */
  rotateSeasonRenewalOfferLink(seasonKey: string, offerId: string): Promise<{ url: string; [key: string]: unknown }> {
    return this.#http.post(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/link`);
  }

  /** Set the name and email a renewal offer is sent to. Pass `null` to clear one. */
  updateSeasonRenewalOfferContact(seasonKey: string, offerId: string, params: {
    email?: string | null; name?: string | null;
  }): Promise<{ contact: { name: string | null; email: string | null; [key: string]: unknown } }> {
    return this.#http.post(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/contact`, { body: params },
    );
  }

  /**
   * Email renewal invitations now and schedule reminders before the deadline. Leave `offerIds`
   * out to email every open offer; more than 20,000 ids answers `422 too_many_offer_ids`.
   */
  createSeasonRenewalNotices(seasonKey: string, params?: { offerIds?: string[] }): Promise<{
    scheduled: number; withoutEmail: number; [key: string]: unknown;
  }> {
    return this.#http.post(`/v1/seasons/${pathPart(seasonKey)}/renewal-notices`, { body: params });
  }

  /** Send one holder a new renewal invitation. Sent once: an unknown outcome is not retried. */
  resendSeasonRenewalOffer(seasonKey: string, offerId: string): Promise<{ ok: true; [key: string]: unknown }> {
    return this.#http.post(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/resend`);
  }

  /** What renewing an offer costs, and whether SeatLayer checkout can take it now (`problem` is null). */
  retrieveSeasonRenewalQuote(seasonKey: string, offerId: string): Promise<SeasonRenewalQuote> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/quote`);
  }

  /**
   * Record that the holder means to renew, for a renewal taken by phone or at the
   * box office, so your own checkout can commit the offer. A repeat answers the same offer.
   */
  createSeasonRenewalIntent(seasonKey: string, offerId: string): Promise<SeasonRenewalResult> {
    return this.#renewal(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/intent`);
  }

  /**
   * Start a SeatLayer checkout that renews an offer, with no hosted page. Send the
   * buyer to `payment.url`. Retried safely with one Idempotency-Key, which answers the same order.
   */
  createSeasonRenewalCheckout(
    seasonKey: string,
    offerId: string,
    params: SeasonRenewalCheckoutParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonRenewalCheckoutStarted> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/checkout`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** Retrieve Season money, seats, holders and renewals as totals. */
  retrieveSeasonSalesReport(seasonKey: string): Promise<{ report: SeasonSalesReport }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/reports/sales`);
  }

  /** Retrieve seats still free per package and per date. */
  retrieveSeasonSeatsReport(seasonKey: string): Promise<{ seats: SeasonSeatsReport }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/reports/seats`);
  }

  /** Download every season ticket holder as CSV. Returns the CSV text unparsed. */
  exportSeasonHoldersCsv(seasonKey: string, options: SeasonHolderFilter = {}): Promise<string> {
    return this.#http.getText(`/v1/seasons/${pathPart(seasonKey)}/reports/holders.csv`, { query: {
      q: options.q,
      status: options.status,
    } });
  }

  /** Download every season order SeatLayer took as CSV. Returns the CSV text unparsed. */
  exportSeasonOrdersCsv(seasonKey: string): Promise<string> {
    return this.#http.getText(`/v1/seasons/${pathPart(seasonKey)}/reports/orders.csv`);
  }

  /** Retrieve Season seats sold per package and per date. */
  retrieveSeasonSeatCounts(seasonKey: string): Promise<{ seats: SeasonSeatCounts | null }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/seat-counts`);
  }

  /**
   * Refund every SeatLayer order holding a cancelled date, as a job. Follow it with
   * `retrieveSeasonBulkJob`. Retried safely with one Idempotency-Key, which replays the same job.
   */
  refundSeasonPerformance(
    seasonKey: string,
    eventKey: string,
    params: RefundSeasonPerformanceParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ job: SeasonBulkJob }> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/performances/${pathPart(eventKey)}/refunds`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Release the seats of every lapsed renewal offer, as a job. An offer extended before its
   * turn is skipped and keeps its seat. Follow it with `retrieveSeasonBulkJob`. Retried safely
   * with one Idempotency-Key, which replays the same job.
   */
  releaseSeasonLapsedOffers(
    seasonKey: string,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ job: SeasonBulkJob }> {
    return this.#http.postWithHeaderReplay(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/release-lapsed`,
      { idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** List a Season's bulk jobs, newest first (100 at most). */
  listSeasonBulkJobs(seasonKey: string): Promise<{ jobs: SeasonBulkJob[] }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/jobs`);
  }

  /** Retrieve one bulk job with its counts and up to 500 failed items. */
  retrieveSeasonBulkJob(seasonKey: string, jobId: string): Promise<{ job: SeasonBulkJobDetail }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/jobs/${pathPart(jobId)}`);
  }

  async waitForSeasonRenewal(
    seasonKey: string,
    initial: SeasonRenewalResult,
    options: WaitForSeasonLifecycleOptions = {},
  ): Promise<SeasonRenewalResult> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    let current = initial;
    while (current.offer.state === 'committing') {
      const delay = Math.max(0, (current.retryAfterSeconds ?? 1) * 1_000);
      if (Date.now() + delay > deadline) throw new SeasonRenewalTimeoutError(current.offer.offerId, timeoutMs);
      await wait(delay, options.signal);
      current = await this.retrieveSeasonRenewalOffer(seasonKey, current.offer.offerId);
    }
    return current;
  }

  async waitForSeasonBooking(
    seasonKey: string,
    initial: SeasonBookingResult,
    options: WaitForSeasonLifecycleOptions = {},
  ): Promise<SeasonBookingResult> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    let current = initial;
    while (current.booking.state === 'book_pending'
      || current.booking.cancellation?.state === 'cancel_pending') {
      const delay = Math.max(0, (current.retryAfterSeconds ?? 1) * 1_000);
      if (Date.now() + delay > deadline) throw new SeasonBookingTimeoutError(current.booking.actionId, timeoutMs);
      await wait(delay, options.signal);
      current = await this.retrieveSeasonBooking(seasonKey, current.booking.actionId);
    }
    return current;
  }

  /** Poll the exact Location/operation identity returned by a 202 response. */
  async waitForSeasonLifecycle<T extends SeasonLifecycleResult>(
    initial: T,
    options: WaitForSeasonLifecycleOptions = {},
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    let current: SeasonLifecycleResult = initial;
    while (!current.lifecycleOperation.terminal) {
      const delay = Math.max(0, (current.retryAfterSeconds ?? 1) * 1_000);
      if (Date.now() + delay > deadline) {
        throw new SeasonLifecycleTimeoutError(current.lifecycleOperation.operationId, timeoutMs);
      }
      await wait(delay, options.signal);
      let path = current.location;
      if (path?.startsWith(this.#http.baseUrl)) path = new URL(path).pathname;
      if (!path?.startsWith('/v1/seasons/')) {
        path = `/v1/seasons/${pathPart(current.season.key)}/lifecycle/${pathPart(current.lifecycleOperation.operationId)}`;
      }
      current = await this.#lifecycle(path, undefined, 'GET', options.signal);
    }
    return current as T;
  }

  #sales(seasonKey: string, action: 'open' | 'pause' | 'resume' | 'end', expectedRevision: number) {
    return this.#http.post<{ season: SeasonDetail }>(
      `/v1/seasons/${pathPart(seasonKey)}/sales/${action}`,
      { body: { expectedRevision } },
    );
  }

  #lifecycle(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
    signal?: AbortSignal,
  ): Promise<SeasonLifecycleResult> {
    let metadata: Pick<SeasonLifecycleResult, 'location' | 'retryAfterSeconds'> = {};
    const options: RequestOptions = {
      body,
      signal,
      onResponse(response) {
        metadata = {
          location: response.headers.get('location') ?? undefined,
          retryAfterSeconds: retryAfterSeconds(response),
        };
      },
    };
    const request = method === 'GET'
      ? this.#http.get<SeasonLifecycleResult>(path, { ...options, body: undefined })
      : this.#http.post<SeasonLifecycleResult>(path, options);
    return request.then((result) => ({ ...result, ...metadata }));
  }

  #booking(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<SeasonBookingResult> {
    let metadata: Pick<SeasonBookingResult, 'location' | 'retryAfterSeconds'> = {};
    const options: RequestOptions = {
      body,
      onResponse(response) {
        metadata = {
          location: response.headers.get('location') ?? undefined,
          retryAfterSeconds: retryAfterSeconds(response),
        };
      },
    };
    const request = method === 'GET'
      ? this.#http.get<SeasonBookingResult>(path, { ...options, body: undefined })
      : this.#http.post<SeasonBookingResult>(path, options);
    return request.then((result) => ({ ...result, ...metadata }));
  }

  #renewal(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<SeasonRenewalResult> {
    let metadata: Pick<SeasonRenewalResult, 'location' | 'retryAfterSeconds'> = {};
    const options: RequestOptions = {
      body,
      onResponse(response) {
        metadata = {
          location: response.headers.get('location') ?? undefined,
          retryAfterSeconds: retryAfterSeconds(response),
        };
      },
    };
    const request = method === 'GET'
      ? this.#http.get<SeasonRenewalResult>(path, { ...options, body: undefined })
      : this.#http.post<SeasonRenewalResult>(path, options);
    return request.then((result) => ({ ...result, ...metadata }));
  }
}
