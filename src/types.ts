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

export interface HoldResult {
  ok: true;
  holdId: string;
  /** Epoch ms. The hold is gone after this unless booked or extended. */
  expiresAt: number;
  items: HoldLineItem[];
  labels?: string[];
}

export interface BookResult {
  ok: true;
  labels?: string[];
  items?: HoldLineItem[];
  bookingRef?: string;
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
 * `event:cancel` un-books paid inventory. It is separated from `event:block`
 * deliberately — a box-office view that only needs to hold seats back should
 * never be able to cancel a sale.
 */
export type ManageCapability =
  | 'event:view'
  | 'event:block'
  | 'event:cancel'
  | 'event:reports';

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
