/** Shared shapes. Kept hand-written so the names read like the docs. */

export type KeyMode = 'live' | 'test';

export interface ChartMeta {
  id: string;
  name: string;
  status: string;
  workspaceId?: string;
  externalRef?: string | null;
  updatedAt: number;
  createdAt: number;
  [key: string]: unknown;
}

export interface Chart {
  meta: ChartMeta;
  /** The chart document. Authored in the Designer; opaque to most backends. */
  doc?: Record<string, unknown>;
}

export interface EventMeta {
  key: string;
  id: string;
  chartId: string;
  name?: string;
  slug?: string | null;
  startsAt?: number | null;
  venue?: string | null;
  currency?: string | null;
  externalRef?: string | null;
  [key: string]: unknown;
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
  capacity?: number;
}

/** Trusted allocation scope for a Platform inventory mutation. */
export interface InventoryAccessScope {
  /** Private channel allocations this server-side operation may use. */
  channelIds?: string[];
  /** Audited staff override. Prefer an explicit channel scope whenever possible. */
  ignoreChannelRestrictions?: boolean;
  /** Human-readable audit reason when using a trusted override. */
  reason?: string;
}

export interface HoldSelection {
  label: string;
  tierId?: string | null;
  quantity?: number;
}

export interface HoldParams extends InventoryAccessScope {
  labels?: string[];
  selections?: HoldSelection[];
  /** Overrides the event's configured hold window, within server limits. */
  ttlMs?: number;
  replaceHoldId?: string;
}

export interface HoldBestAvailableParams extends InventoryAccessScope {
  qty: number;
  categoryKey?: string;
  zoneId?: string;
  ttlMs?: number;
}

export interface HoldResult {
  ok: true;
  holdId: string;
  /** Epoch ms. The hold is gone after this unless booked or extended. */
  expiresAt: number;
  items: HoldLineItem[];
  labels?: string[];
  zoneId?: string;
}

export interface RetrieveHoldResult {
  items: HoldLineItem[];
  expiresAt: number;
  currency: string;
}

export type BookParams = InventoryAccessScope & {
  /** Caller-owned stable reference used to reconcile this inventory booking. */
  bookingRef: string;
} & (
  | { holdId: string; labels?: string[] }
  | { labels: string[]; holdId?: never }
);

export interface BookResult {
  ok: true;
  /** Newly booked labels. Empty on an idempotent replay. */
  booked: string[];
  /** The normalized caller-owned reference supplied to the operation. */
  bookingRef: string;
}

export interface BookBestAvailableParams extends InventoryAccessScope {
  qty: number;
  bookingRef: string;
  categoryKey?: string;
  zoneId?: string;
}

export interface BookBestAvailableResult {
  ok: true;
  labels: string[];
  items: HoldLineItem[];
  bookingRef: string;
  zoneId?: string;
}

export interface UnbookParams {
  labels: string[];
  /** Must match the stable reference that booked these labels. */
  bookingRef: string;
}

export interface UnbookResult {
  ok: true;
  unbooked: string[];
  /** The normalized caller-owned reference supplied to the operation. */
  bookingRef: string;
}

/** Platform/SDK inventory history. This is not a commercial order. */
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
  /** Event-configured price snapshot; not evidence of money collected. */
  unitPrice: number;
  configuredValue: number;
  currency: string;
  channelId: string | null;
  channelExternalRef: string | null;
  source: string;
  state: 'booked' | 'cancelled';
  bookedAt: number;
  cancelledAt: number | null;
}

export interface InventoryBooking {
  eventKey: string;
  eventMode: 'live' | 'test';
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
}

export interface InventoryBookingsQuery {
  q?: string;
  state?: InventoryBookingState;
  cursor?: string;
  limit?: number;
}

export interface InventoryBookingsPage {
  bookings: InventoryBooking[];
  nextCursor: string | null;
}

export interface InventoryBookingActivity {
  id: number;
  action: 'book' | 'replay' | 'partial_cancel' | 'cancel' | 'reconcile';
  at: number;
  labels: string[];
  actor: string | null;
  source: string;
}

export interface InventoryBookingDetail {
  booking: InventoryBooking;
  activity: InventoryBookingActivity[];
  activityTruncated: boolean;
}

export interface ReportByStatus {
  free: number;
  held: number;
  booked: number;
  not_for_sale: number;
}

export interface ReportCategoryRow extends ReportByStatus {
  category: string;
  total: number;
  /** Configured-price snapshot for booked inventory; not payment revenue. */
  bookedValue: number;
  /** @deprecated Use `bookedValue`. */
  bookedRevenue: number;
}

export interface ReportSectionRow extends ReportByStatus {
  sectionId: string;
  sectionLabel: string;
  zoneId: string | null;
  total: number;
  bookedValue: number;
  /** @deprecated Use `bookedValue`. */
  bookedRevenue: number;
}

export interface ReportAccessibilityRow extends ReportByStatus {
  type: string;
  label: string;
  total: number;
}

export interface ReportWheelchairProvisionRow extends ReportByStatus {
  type: 'seat-present' | 'no-seat';
  label: string;
  total: number;
}

export interface ReportCategoryMeta {
  key: string;
  label: string;
  color: string;
  price: number;
}

export interface EventReportResult {
  report: {
    byStatus: ReportByStatus;
    byCategory: ReportCategoryRow[];
    bySection: ReportSectionRow[];
    byAccessibility: ReportAccessibilityRow[];
    byWheelchairProvision: ReportWheelchairProvisionRow[];
  };
  event: EventMeta;
  categories: ReportCategoryMeta[];
}

export interface Workspace {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  isDefault: boolean;
  externalRef?: string | null;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status?: string;
  [key: string]: unknown;
}

/**
 * What a manage-session token is allowed to do in the browser.
 *
 * `event:cancel` releases booked inventory. It is separated from `event:block`
 * deliberately: an operational view that only holds inventory back should not
 * also be able to cancel a caller-owned booking reference.
 */
export type ManageCapability =
  | 'event:view'
  | 'event:block'
  | 'event:cancel'
  | 'event:reports'
  | 'event:channels:view'
  | 'event:channels:manage';

export interface ManageSession {
  token: string;
  expiresAt: number;
  capabilities: ManageCapability[];
  [key: string]: unknown;
}

export interface DesignerSession {
  token: string;
  expiresAt: number;
  [key: string]: unknown;
}
