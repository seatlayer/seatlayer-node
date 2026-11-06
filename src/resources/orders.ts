import type { HttpClient } from '../http.js';
import type { KeyMode } from '../types.js';

export type OrderStatus =
  | 'pending'
  | 'authorized'
  | 'inventory_committed'
  | 'confirmed'
  | 'compensating'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'partially_refunded';

/** Event order filters also accept orders where only some seats were cancelled. */
export type EventOrderStatus = OrderStatus | 'partially_cancelled';

export interface Order {
  orderId: string;
  displayRef: string;
  status: OrderStatus;
  kind: 'event' | 'season' | 'renewal' | 'box_office';
  eventKey: string | null;
  seasonKey: string | null;
  /** A season order's own id, or the reference a renewal was offered to; null for event and box office orders. */
  holderRef: string | null;
  /** The customer the order belongs to once its buyer has signed in; otherwise null. */
  customerId: string | null;
  /** `email` is null for a box office sale taken without one. */
  buyer: { name: string | null; email: string | null; [key: string]: unknown };
  amounts: {
    currency: string;
    subtotalMinor: number;
    bookingFeeMinor: number;
    totalMinor: number;
    refundedMinor: number;
    [key: string]: unknown;
  };
  mode: KeyMode;
  createdAt: number;
  confirmedAt: number | null;
  [key: string]: unknown;
}

export interface OrderLine {
  label: string;
  category: string | null;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  [key: string]: unknown;
}

export interface OrderDetail extends Order {
  lines: OrderLine[];
}

export interface OrderPage {
  orders: Order[];
  nextCursor: string | null;
  [key: string]: unknown;
}

export interface OrderListOptions {
  /** Only this event's orders (not season orders). */
  eventKey?: string;
  /** Only this season's orders, renewals included. */
  seasonKey?: string;
  /** Only this holder's orders: the season order with this id and renewals offered to this reference. */
  holderRef?: string;
  status?: OrderStatus;
  /** Created at or after, in epoch milliseconds. */
  from?: number;
  /** Created before, in epoch milliseconds. */
  to?: number;
  cursor?: string;
  /** Page size. Defaults to 50 and is capped at 100. */
  limit?: number;
}

export interface OrderTicket {
  ticketId: string;
  eventKey: string;
  eventName: string;
  startsAt: number | null;
  label: string;
  status: 'issued' | 'checked_in' | 'void';
  scanUrl: string;
  [key: string]: unknown;
}

export interface EventOrderListOptions {
  /** Search by buyer name, email, order number or seat. */
  q?: string;
  status?: EventOrderStatus;
  /** Only orders paid this way. */
  paidBy?: string;
  /** Paid at or after, in epoch milliseconds. */
  from?: number;
  /** Paid before, in epoch milliseconds. */
  to?: number;
  cursor?: string;
  /** Page size. Defaults to 25 and is capped at 100. */
  limit?: number;
}

/** The CSV export takes the list filters, without paging. */
export type EventOrderExportOptions = Omit<EventOrderListOptions, 'cursor' | 'limit'>;

export interface EventOrderSummary {
  orderId: string;
  displayRef: string;
  status: OrderStatus;
  [key: string]: unknown;
}

export interface EventOrderPage {
  orders: EventOrderSummary[];
  matchedCount: number;
  nextCursor: string | null;
  pageSize: number;
  totals: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EventOrderDetail {
  orderId: string;
  displayRef: string;
  tickets: Array<Record<string, unknown>>;
  lines: Array<{ label: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface EventOrderRefundResult {
  orderId: string;
  operationId: string;
  refundId?: string | null;
  amountMinor?: number | null;
  refundedMinor?: number;
  status?: OrderStatus;
  refundStatus?: string;
  [key: string]: unknown;
}

export interface EventOrderCancelResult {
  receipt?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EventOrderResendResult {
  orderId: string;
  displayRef: string;
  sentTo: string;
  addressCorrected: boolean;
  resentAt: number;
  ticketCount: number;
  [key: string]: unknown;
}

export interface RefundOrderParams {
  /** Partial refund in minor units. Leave out for a full refund. */
  amountMinor?: number;
}

/** Cancelling an order moves no money: record why, and confirm any refund was settled. */
export interface CancelOrderParams {
  reason: 'lost_dispute' | 'refunded_elsewhere' | 'other';
  note?: string;
  refundConfirmed?: boolean;
  usedTicketsAcknowledged?: boolean;
  notifyBuyer?: boolean;
}

export interface ResendOrderTicketsParams {
  /** Send to this address instead of the buyer's. */
  email?: string;
}

/** Orders across events and seasons, plus one event's orders, refunds and resends. */
export class Orders {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** One page of orders across events and seasons. Pass `cursor` from the previous page. */
  listOrders(options: OrderListOptions = {}): Promise<OrderPage> {
    return this.#http.get('/v1/orders', { query: {
      eventKey: options.eventKey,
      seasonKey: options.seasonKey,
      holderRef: options.holderRef,
      status: options.status,
      from: options.from,
      to: options.to,
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  /** Retrieve an order and its lines. */
  retrieveOrder(orderId: string): Promise<{ order: OrderDetail }> {
    return this.#http.get(`/v1/orders/${encodeURIComponent(orderId)}`);
  }

  /** List an order's tickets with their scan links. */
  listOrderTickets(orderId: string): Promise<{ tickets: OrderTicket[] }> {
    return this.#http.get(`/v1/orders/${encodeURIComponent(orderId)}/tickets`);
  }

  /** One page of a single event's orders, with totals for the filter. */
  listEventOrders(eventKey: string, options: EventOrderListOptions = {}): Promise<EventOrderPage> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/orders`, { query: {
      q: options.q,
      status: options.status,
      paidBy: options.paidBy,
      from: options.from,
      to: options.to,
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  /** Retrieve one event order with its guests and tickets. */
  retrieveEventOrder(eventKey: string, orderId: string): Promise<EventOrderDetail> {
    return this.#http.get(
      `/v1/events/${encodeURIComponent(eventKey)}/orders/${encodeURIComponent(orderId)}`,
    );
  }

  /** Download one event's orders as CSV. Returns the CSV text unparsed. */
  exportEventOrdersCsv(eventKey: string, options: EventOrderExportOptions = {}): Promise<string> {
    return this.#http.getText(`/v1/events/${encodeURIComponent(eventKey)}/orders.csv`, { query: {
      q: options.q,
      status: options.status,
      paidBy: options.paidBy,
      from: options.from,
      to: options.to,
    } });
  }

  /**
   * Refund an event order through its payment provider, in full or in part.
   * Retried safely with one Idempotency-Key; a 202 means the refund is still pending.
   */
  refundEventOrder(
    eventKey: string,
    orderId: string,
    params?: RefundOrderParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<EventOrderRefundResult> {
    return this.#http.postWithHeaderReplay(
      `/v1/events/${encodeURIComponent(eventKey)}/orders/${encodeURIComponent(orderId)}/refund`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** Cancel an event order without moving money. Retried safely with one Idempotency-Key. */
  cancelEventOrder(
    eventKey: string,
    orderId: string,
    params: CancelOrderParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<EventOrderCancelResult> {
    return this.#http.postWithHeaderReplay(
      `/v1/events/${encodeURIComponent(eventKey)}/orders/${encodeURIComponent(orderId)}/cancel`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /** Email an event order's tickets again. Sent once: an unknown outcome is not retried. */
  resendEventOrderTickets(
    eventKey: string,
    orderId: string,
    params?: ResendOrderTicketsParams,
  ): Promise<EventOrderResendResult> {
    return this.#http.post(
      `/v1/events/${encodeURIComponent(eventKey)}/orders/${encodeURIComponent(orderId)}/resend`,
      { body: params },
    );
  }
}
