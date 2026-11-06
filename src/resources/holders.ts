import type { HttpClient } from '../http.js';
import type { KeyMode } from '../types.js';
import type {
  DeclineSeasonRenewalOfferParams,
  SeasonRenewalCheckoutParams,
  SeasonRenewalCheckoutStarted,
  SeasonRenewalOffer,
} from './seasons.js';

export interface Customer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: 'active' | 'disabled';
  mode: KeyMode;
  createdAt: number;
  holderRefs: string[];
  [key: string]: unknown;
}

export interface CustomerPage {
  customers: Customer[];
  nextCursor: string | null;
  [key: string]: unknown;
}

export interface CustomerListOptions {
  /** Only the customer with this email. */
  email?: string;
  /** Only the customer linked to this holder reference. */
  holderRef?: string;
  cursor?: string;
  /** Page size. Defaults to 50 and is capped at 100. */
  limit?: number;
}

export interface Holder {
  holderRef: string;
  customerId: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  status: 'active' | 'disabled' | 'pending';
  [key: string]: unknown;
}

export interface UpdateHolderParams {
  email?: string;
  name?: string | null;
  phone?: string | null;
}

export interface HolderSeason {
  seasonKey: string;
  name: string;
  package: { planActivationId: string; name: string | null; [key: string]: unknown } | null;
  seats: string[];
  status: 'active' | 'reserved' | 'offered' | 'renewed' | 'released' | 'cancelled';
  dates: Array<{
    eventKey: string;
    name: string;
    startsAt: number | null;
    state: 'booked' | 'cancelled' | 'renewed' | 'failed' | 'partial_terminal';
    seats: string[];
    [key: string]: unknown;
  }>;
  renewalOffer: { offerId: string; state: string; deadlineAt: number | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface HolderTicket {
  ticketId: string;
  orderId: string;
  eventKey: string;
  eventName: string;
  startsAt: number | null;
  label: string;
  status: 'issued' | 'checked_in' | 'void';
  seasonKey: string | null;
  [key: string]: unknown;
}

export interface HolderTicketDetail extends HolderTicket {
  qrUrl: string;
  scanUrl: string;
}

export interface HolderTicketPage {
  tickets: HolderTicket[];
  nextCursor: string | null;
  [key: string]: unknown;
}

export interface HolderTicketListOptions {
  /** Only tickets of this season. */
  seasonKey?: string;
  /** Only dates starting at or after this time, in epoch milliseconds. */
  from?: number;
  /** Only dates starting before this time, in epoch milliseconds. */
  to?: number;
  cursor?: string;
  /** Page size. Defaults to 50 and is capped at 100. */
  limit?: number;
}

export interface TicketTransfer {
  transferId: string;
  state: 'sent' | 'accepted' | 'cancelled' | 'expired';
  seasonKey: string | null;
  tickets: string[];
  fromHolderRef: string | null;
  toEmail: string;
  toHolderRef: string | null;
  expiresAt: number;
  createdAt: number;
  acceptedAt: number | null;
  cancelledAt: number | null;
  [key: string]: unknown;
}

export interface CreateHolderTransferParams {
  ticketIds: string[];
  toEmail: string;
}

export interface HolderReturnTicket {
  ticketId: string;
  eventKey: string;
  label: string;
  state: 'pending' | 'returned' | 'failed';
  /** Why this seat could not be given back, when `state` is `failed`. */
  error: string | null;
  [key: string]: unknown;
}

export interface HolderReturn {
  returnId: string;
  /** `pending` while a seat is still being released; it finishes on its own. */
  state: 'pending' | 'returned' | 'failed';
  seasonKey: string;
  tickets: HolderReturnTicket[];
  createdAt: number;
  [key: string]: unknown;
}

export interface CreateHolderReturnParams {
  /** 1 to 20 ticket ids, all of one season. Each ticket is one seat on one date. */
  ticketIds: string[];
}

/**
 * Season ticket holders, their customers, tickets, ticket transfers, returns, and renewals.
 * `holderRef` is your own holder reference, as your imports and bookings carry
 * it; a hosted season purchase uses its order id.
 */
export class Holders {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** List customers, or find one by email or holder reference. */
  listCustomers(options: CustomerListOptions = {}): Promise<CustomerPage> {
    return this.#http.get('/v1/customers', { query: {
      email: options.email,
      holderRef: options.holderRef,
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  /** Retrieve the customer behind a holder reference. */
  retrieveHolder(holderRef: string): Promise<{ holder: Holder }> {
    return this.#http.get(`/v1/holders/${encodeURIComponent(holderRef)}`);
  }

  /** Set a holder's email, name or phone. Retried safely with one Idempotency-Key. */
  updateHolder(
    holderRef: string,
    params: UpdateHolderParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ holder: Holder }> {
    return this.#http.mutationWithHeaderReplay('PATCH', `/v1/holders/${encodeURIComponent(holderRef)}`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** Sign a holder's customer out of the ticket site: every session, or the one named. */
  revokeHolderSessions(holderRef: string, params?: { sessionId?: string }): Promise<{
    revoked: number; [key: string]: unknown;
  }> {
    return this.#http.post(`/v1/holders/${encodeURIComponent(holderRef)}/sessions/revoke`, {
      body: params,
    });
  }

  /** List the seasons a holder holds seats in. */
  listHolderSeasons(holderRef: string): Promise<{ seasons: HolderSeason[] }> {
    return this.#http.get(`/v1/holders/${encodeURIComponent(holderRef)}/seasons`);
  }

  /** One page of a holder's tickets, date by date. */
  listHolderTickets(holderRef: string, options: HolderTicketListOptions = {}): Promise<HolderTicketPage> {
    return this.#http.get(`/v1/holders/${encodeURIComponent(holderRef)}/tickets`, { query: {
      seasonKey: options.seasonKey,
      from: options.from,
      to: options.to,
      cursor: options.cursor,
      limit: options.limit,
    } });
  }

  /** Retrieve one of a holder's tickets with its QR and scan links. */
  retrieveHolderTicket(holderRef: string, ticketId: string): Promise<{ ticket: HolderTicketDetail }> {
    return this.#http.get(
      `/v1/holders/${encodeURIComponent(holderRef)}/tickets/${encodeURIComponent(ticketId)}`,
    );
  }

  /**
   * Send some of a holder's season tickets to an email. Retried safely with one Idempotency-Key.
   * Turning customer sends off in Settings › Ticket site doesn't stop your server; cut-offs still apply.
   */
  createHolderTransfer(
    holderRef: string,
    params: CreateHolderTransferParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ transfer: TicketTransfer }> {
    return this.#http.postWithHeaderReplay(`/v1/holders/${encodeURIComponent(holderRef)}/transfers`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** List transfers a holder sent or was sent. */
  listHolderTransfers(holderRef: string): Promise<{ transfers: TicketTransfer[] }> {
    return this.#http.get(`/v1/holders/${encodeURIComponent(holderRef)}/transfers`);
  }

  /** Cancel a transfer that has not been accepted yet. */
  cancelHolderTransfer(holderRef: string, transferId: string): Promise<{ transfer: TicketTransfer }> {
    return this.#http.post(
      `/v1/holders/${encodeURIComponent(holderRef)}/transfers/${encodeURIComponent(transferId)}/cancel`,
    );
  }

  /** Accept a transfer on behalf of the recipient holder. */
  acceptHolderTransfer(holderRef: string, transferId: string): Promise<{ transfer: TicketTransfer }> {
    return this.#http.post(
      `/v1/holders/${encodeURIComponent(holderRef)}/transfers/${encodeURIComponent(transferId)}/accept`,
    );
  }

  /**
   * Give back a holder's seat on one date, one per ticket. Retried safely with one Idempotency-Key.
   * Turning give-backs off in Settings › Ticket site doesn't stop your server; cut-offs still apply.
   */
  createHolderReturn(
    holderRef: string,
    params: CreateHolderReturnParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ return: HolderReturn }> {
    return this.#http.postWithHeaderReplay(`/v1/holders/${encodeURIComponent(holderRef)}/returns`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /**
   * Start a SeatLayer checkout that renews one of a holder's offers (`renewalOffer` on
   * `listHolderSeasons`). Send the buyer to `payment.url`. Retried safely with one
   * Idempotency-Key, which answers the same order.
   */
  createHolderRenewalCheckout(
    holderRef: string,
    offerId: string,
    params: SeasonRenewalCheckoutParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<SeasonRenewalCheckoutStarted> {
    return this.#http.postWithHeaderReplay(
      `/v1/holders/${encodeURIComponent(holderRef)}/renewal-offers/${encodeURIComponent(offerId)}/checkout`,
      { body: params, idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
  }

  /**
   * Decline one of a holder's renewal offers and release its seats, optionally with the
   * holder's reason. Declining again answers the same offer, with the first reason.
   */
  declineHolderRenewalOffer(
    holderRef: string,
    offerId: string,
    params?: DeclineSeasonRenewalOfferParams,
  ): Promise<{ offer: SeasonRenewalOffer }> {
    return this.#http.post(
      `/v1/holders/${encodeURIComponent(holderRef)}/renewal-offers/${encodeURIComponent(offerId)}/decline`,
      { body: params },
    );
  }
}
