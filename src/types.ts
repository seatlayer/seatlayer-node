/** Shared shapes. Kept hand-written so the names read like the docs. */

export type KeyMode = 'live' | 'test';

export type ReadinessState = 'healthy' | 'degraded' | 'unavailable';

export interface ReadinessReport {
  state: ReadinessState;
  version: string;
  checkedAt: string;
  dependencies: Array<{
    name: string;
    state: ReadinessState;
    latencyMs: number;
    reason?: string;
  }>;
}

export interface ChartMeta {
  id: string;
  name: string;
  status: string;
  seats: number;
  updatedAt: number;
  hasThumbnail: boolean;
  issues?: number;
  archivedAt: number | null;
  externalRef?: string;
  workspaceId: string;
  publicationPolicy: 'legacy' | 'review-required';
  sourceTemplate?: {
    id: string;
    version: number;
    sha256: string | null;
  };
  [key: string]: unknown;
}

export interface Chart {
  meta: ChartMeta;
  /** The chart document. Authored in the Designer; opaque to most backends. */
  doc: Record<string, unknown> | null;
  /** Derived sellable capacity by category when a document exists. */
  categorySeats?: Record<string, number>;
}

export interface EventMeta {
  key: string;
  chartId: string;
  name: string;
  status: string;
  salesState: string;
  salesRevision: number;
  salesPauseReason: string | null;
  seatTotal: number;
  createdAt: number;
  startsAt: number | null;
  venue: string | null;
  mode: KeyMode;
  externalRef?: string;
  workspaceId: string;
  currency?: string;
  inventoryModelVersion?: number;
  paymentGateway?: unknown | null;
  buyerCheckout?: unknown;
  buyerCheckoutRevision?: number;
  buyerSurface?: unknown;
  buyerSurfaceRevision?: number;
  description: string | null;
  endsAt: number | null;
  timezone: string | null;
  locale: string | null;
  posterPath: string | null;
  [key: string]: unknown;
}

export interface EventCounts {
  free: number;
  held: number;
  booked: number;
  blocked: number;
}

export type EventSectionState = 'open' | 'closed' | 'hidden';

export interface EventSectionStates {
  hidden: string[];
  closed: string[];
  states: Record<string, EventSectionState>;
}

export interface EventEnvelope {
  meta: EventMeta;
  sectionStates?: EventSectionStates;
}

export interface EventDetail {
  meta: EventMeta & { sold: number };
  counts: EventCounts;
  /** `null` means the event is using the workspace default. */
  holdTtlMs: number | null;
  chartUpdate?: {
    behind: boolean;
    canAutoUpdate: boolean;
  };
}

/** Exact immutable Event configuration version. */
export interface EventConfigurationRef {
  id: string;
  version: number;
}

/** One append-only Event configuration binding transition. */
export interface EventConfigurationBindingAudit {
  id: string;
  from: EventConfigurationRef | null;
  to: EventConfigurationRef | null;
  revision: number;
  actor: string;
  createdAt: number;
}

/** Current exact Event configuration binding and its complete audit history. */
export interface EventConfigurationBinding {
  configuration: EventConfigurationRef | null;
  revision: number;
  changedBy: string | null;
  changedAt: number | null;
  audit: EventConfigurationBindingAudit[];
}

/** Compare-and-set input for binding or detaching an exact configuration version. */
export interface EventConfigurationBindingUpdateParams {
  expectedRevision: number;
  configuration: EventConfigurationRef | null;
}

export interface SalesAliasResult {
  status: string;
  state: string;
  revision: number;
  changed: boolean;
}

export interface ArchiveEventResult {
  status: 'archived';
}

/** A live ticket release, including server-computed quota consumption. */
export interface TicketRelease {
  id: string;
  position: number;
  name: string;
  categoryKey: string | null;
  price: number;
  previousPrice: number | null;
  quota: number | null;
  startsAt: number | null;
  endsAt: number | null;
  action: 'buy' | 'apply' | 'invoice';
  actionUrl: string | null;
  soldOutAt: number | null;
  consumed?: number;
  remaining?: number | null;
}

/** Input for whole-list release replacement; consumption is response-only. */
export interface TicketReleaseReplaceInput {
  /** Omit or set null for a release the API should create. */
  id?: string | null;
  name: string;
  categoryKey?: string | null;
  price: number;
  previousPrice?: number | null;
  quota?: number | null;
  startsAt?: number | null;
  endsAt?: number | null;
  action?: 'buy' | 'apply' | 'invoice';
  actionUrl?: string | null;
}

export interface TicketReleaseList {
  releases: TicketRelease[];
}

/** A priced line item. `unitPrice` is in `currency`, not in minor units. */
export interface HoldLineItem {
  label: string;
  objectId: string;
  objectType: 'seat' | 'booth' | 'ga' | 'table';
  categoryKey: string;
  tierId: string | null;
  unitPrice: number;
  currency: string;
  quantity?: number;
  bookingMode?: 'individual' | 'whole' | 'variable';
  capacity?: number;
  minOccupancy?: number;
  maxOccupancy?: number;
  /** Private allocation this item came from; `null` means Public sale. */
  channelId?: string | null;
  accessSource?: AccessSource;
  releaseId?: string | null;
}

export interface HoldResult {
  ok: true;
  holdId: string;
  /** Epoch ms. The hold is gone after this unless booked or extended. */
  expiresAt: number;
  items: HoldLineItem[];
  labels?: string[];
}

export interface ExtendHoldResult {
  ok: true;
  holdId: string;
  expiresAt: number;
  /** Number of successful extensions used by this hold. */
  extends: number;
}

export type AccessSource =
  | 'public'
  | 'promoter'
  | 'partner'
  | 'hosted_link'
  | 'staff_override';

/** Authoritative server-side view of a hold. No bearer token is returned. */
export interface HoldInspection {
  holdId: string;
  status: 'active' | 'booked' | 'released' | 'expired';
  expiresAt: number;
  bookingRef: string | null;
  eventKey: string | null;
  mode: KeyMode;
  externalRef: string | null;
  workspaceId: string | null;
  items: HoldLineItem[];
  accessSessionId?: string | null;
  accessSource?: AccessSource;
  buyerRef?: string | null;
  partnerRef?: string | null;
}

/** Optional private-allocation authority for trusted server inventory calls. */
export interface TrustedInventoryAccess {
  channelIds?: string[];
  /** Explicit audited bypass across every channel allocation. */
  ignoreChannelRestrictions?: boolean;
  reason?: string;
}

/** @deprecated Use `TrustedInventoryAccess`. */
export interface InventoryAccessScope extends TrustedInventoryAccess {}

export interface HoldSelection {
  label: string;
  tierId?: string | null;
  quantity?: number;
}

export interface HoldParams extends TrustedInventoryAccess {
  labels?: string[];
  selections?: HoldSelection[];
  ttlMs?: number;
  replaceHoldId?: string;
}

export interface HoldBestAvailableParams extends TrustedInventoryAccess {
  qty: number;
  categoryKey?: string;
  zoneId?: string;
  ttlMs?: number;
}

/** @deprecated Use `HoldInspection`. */
export type RetrieveHoldResult = HoldInspection;

export type BookParams = TrustedInventoryAccess & {
  bookingRef: string;
} & (
  | { holdId: string; labels?: string[] }
  | { labels: string[]; holdId?: never }
);

export interface BookBestAvailableParams extends TrustedInventoryAccess {
  qty: number;
  bookingRef: string;
  categoryKey?: string;
  zoneId?: string;
}

export interface UnbookParams {
  labels: string[];
  bookingRef: string;
}

export type AvailabilityRule =
  | { mode: 'hidden' | 'closed'; labels?: string[] }
  | { mode: 'timed'; revealAt: number; labels?: string[] }
  | { mode: 'threshold'; thresholdPct: number; labels?: string[] };

export type InventoryBookingState = 'booked' | 'partially_cancelled' | 'cancelled';

export interface InventoryBookingObject {
  label: string;
  objectId: string;
  objectType: 'seat' | 'booth' | 'ga' | 'table';
  categoryKey: string;
  sectionId: string | null;
  sectionLabel: string | null;
  zoneId: string | null;
  tierId: string | null;
  releaseId: string | null;
  bookingMode: 'individual' | 'whole' | 'variable';
  quantity: number;
  unitPrice: number;
  configuredValue: number;
  currency: string;
  channelId: string | null;
  channelExternalRef: string | null;
  source: string;
  state: 'booked' | 'cancelled';
  bookedAt: number;
  cancelledAt: number | null;
  [key: string]: unknown;
}

export interface InventoryBookingRecord {
  eventKey: string;
  eventMode: KeyMode;
  bookingRef: string;
  state: InventoryBookingState;
  bookedAt: number;
  updatedAt: number;
  cancelledAt: number | null;
  source: string;
  bookedBy: string | null;
  lastActor: string | null;
  lastSource: string;
  labels: string[];
  objects: InventoryBookingObject[];
  quantity: number;
  activeQuantity: number;
  configuredValue: number;
  activeConfiguredValue: number;
  currency: string | null;
  [key: string]: unknown;
}

/** @deprecated Use `InventoryBookingRecord`. */
export type InventoryBooking = InventoryBookingRecord;

export interface InventoryBookingActivity {
  id: number;
  action: 'book' | 'replay' | 'partial_cancel' | 'cancel' | 'reconcile';
  at: number;
  labels: string[];
  actor: string | null;
  source: string;
  [key: string]: unknown;
}

export interface InventoryBookingPage {
  bookings: InventoryBookingRecord[];
  nextCursor: string | null;
}

export interface InventoryBookingsQuery {
  q?: string;
  state?: InventoryBookingState;
  cursor?: string;
  limit?: number;
}

/** @deprecated Use `InventoryBookingPage`. */
export type InventoryBookingsPage = InventoryBookingPage;

export interface InventoryBookingDetail {
  booking: InventoryBookingRecord;
  activity: InventoryBookingActivity[];
  activityTruncated: boolean;
}

export interface ReportStatusCounts {
  free: number;
  held: number;
  booked: number;
  not_for_sale: number;
}

export interface EventReportCategory extends ReportStatusCounts {
  category: string;
  total: number;
  bookedValue: number;
  bookedRevenue: number;
}

export interface EventReportSection extends ReportStatusCounts {
  sectionId: string;
  sectionLabel: string;
  zoneId: string | null;
  total: number;
  bookedValue: number;
  bookedRevenue: number;
}

export interface EventReportAccessibility extends ReportStatusCounts {
  type:
    | 'wheelchair'
    | 'companion'
    | 'semi-ambulatory'
    | 'hearing'
    | 'cart'
    | 'sign-language'
    | 'plus-size'
    | 'lift-armrest';
  label: string;
  total: number;
}

export interface EventReportWheelchairProvision extends ReportStatusCounts {
  type: 'seat-present' | 'no-seat';
  label: string;
  total: number;
}

export interface EventReport {
  byStatus: ReportStatusCounts;
  byCategory: EventReportCategory[];
  bySection: EventReportSection[];
  byAccessibility: EventReportAccessibility[];
  byWheelchairProvision: EventReportWheelchairProvision[];
  [key: string]: unknown;
}

export interface EventReportEnvelope {
  report: EventReport;
  event: EventMeta;
  categories: Array<{ key: string; label: string; color: string; price: number }>;
}

/** Compatibility names retained from 0.2.0. */
export interface ReportByStatus extends ReportStatusCounts {}
export interface ReportCategoryRow extends EventReportCategory {}
export interface ReportSectionRow extends EventReportSection {}
export interface ReportAccessibilityRow extends EventReportAccessibility {}
export interface ReportWheelchairProvisionRow extends EventReportWheelchairProvision {}
export interface ReportCategoryMeta {
  key: string;
  label: string;
  color: string;
  price: number;
}
export interface EventReportResult extends EventReportEnvelope {}

export interface EventLogEntry {
  id: number;
  at: number;
  action: string;
  labels: string[];
  ref: string | null;
  [key: string]: unknown;
}

export interface EventLogPage {
  entries: EventLogEntry[];
  nextBefore: number | null;
}

export interface BookResult {
  ok: true;
  booked: string[];
  /** Normalized caller-owned reference echoed by the SDK. */
  bookingRef: string;
}

export interface BestAvailableHoldResult extends HoldResult {
  labels: string[];
  zoneId?: string;
}

export interface BestAvailableBookResult {
  ok: true;
  labels: string[];
  items: HoldLineItem[];
  bookingRef: string;
  zoneId?: string;
}

/** @deprecated Use `BestAvailableBookResult`. */
export type BookBestAvailableResult = BestAvailableBookResult;

export interface UnbookResult {
  ok: true;
  unbooked: string[];
  conflicts: unknown[];
  /** Normalized caller-owned reference echoed by the SDK. */
  bookingRef: string;
}

export interface Workspace {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  isDefault: boolean;
  externalRef?: string | null;
}

export type WebhookEventName =
  | 'seat.booked'
  | 'seat.released'
  | 'seat.blocked'
  | 'hold.expired'
  | 'hold.created'
  | 'hold.extended'
  | 'event.created'
  | 'event.soldout';

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEventName[];
  disabled: boolean;
  lastStatus: string | null;
  lastAt: number | null;
  createdAt: number;
  mode: KeyMode | null;
  environment: string | null;
  /** Successful delivery percentage over the trailing seven days. */
  uptime7d: number | null;
  [key: string]: unknown;
}

export interface WebhookDelivery {
  id: string;
  at: number;
  event: WebhookEventName;
  ref: string | null;
  /** Receiver HTTP status; zero represents a transport failure. */
  status: number;
  attempt: number;
  maxAttempts: number;
  willRetry: boolean;
  occurrenceId: string | null;
  payload: string | null;
  responseBody: string | null;
  errorMessage: string | null;
}

/**
 * What a manage-session token is allowed to do in the browser.
 *
 * `event:cancel` un-books paid inventory. It is separated from `event:block`
 * deliberately — a box-office view that only needs to hold seats back should
 * never be able to cancel a sale.
 */
export type ManageCapability =
  | 'event:view'
  | 'event:block'
  | 'event:cancel'
  | 'event:reports'
  | 'event:orders:read'
  | 'event:refund'
  | 'event:tickets:send'
  | 'event:door:view'
  | 'event:door:checkin'
  | 'event:boxoffice'
  | 'event:channels:view'
  | 'event:channels:manage';

export interface ManageSession {
  id: string;
  token: string;
  expiresAt: number;
  eventKey: string;
  allowedOrigin: string;
  capabilities: ManageCapability[];
  [key: string]: unknown;
}

export interface DesignerSession {
  id: string;
  token: string;
  workspaceId: string;
  chartId: string;
  allowedOrigin: string;
  authority: 'read-only' | 'edit' | 'publish';
  canEdit: boolean;
  canPublish: boolean;
  mode: 'normal' | 'safe';
  safeModeOptions: {
    allowDeletingObjects: boolean;
    allowEditingAreaCapacity: boolean;
  };
  featurePolicy: Record<string, unknown>;
  expiresAt: number;
  designerUrl: string;
  [key: string]: unknown;
}
