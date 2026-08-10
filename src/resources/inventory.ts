import type { HttpClient } from '../http.js';
import type {
  BookBestAvailableParams,
  BookBestAvailableResult,
  BookParams,
  BookResult,
  HoldBestAvailableParams,
  HoldParams,
  HoldResult,
  InventoryBookingDetail,
  InventoryBookingsPage,
  InventoryBookingsQuery,
  RetrieveHoldResult,
  UnbookParams,
  UnbookResult,
} from '../types.js';

function normalizedBookingRef(value: string): string {
  const bookingRef = value.trim();
  if (!bookingRef) {
    throw new TypeError('bookingRef is required and must be a non-empty stable reference.');
  }
  return bookingRef;
}

/**
 * Holds, booking, blocking, availability.
 *
 * Two complete flows, both first-class:
 *
 *   browser holds → `retrieveHold` for authoritative pricing → charge → `book({holdId})`
 *   backend books labels directly — box office, phone sales, comps
 *
 * Never price from what the browser tells you. `retrieveHold` is the
 * authoritative answer, which is why it exists as a separate call.
 */
export class Inventory {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  #path(eventKey: string, suffix: string): string {
    return `/v1/events/${encodeURIComponent(eventKey)}${suffix}`;
  }

  hold(eventKey: string, params: HoldParams, options: { idempotencyKey?: string } = {}): Promise<HoldResult> {
    return this.#http.post(this.#path(eventKey, '/hold'), {
      body: {
        labels: params.labels,
        selections: params.selections,
        ttlMs: params.ttlMs,
        replaceHoldId: params.replaceHoldId,
        channelIds: params.channelIds,
        ignoreChannelRestrictions: params.ignoreChannelRestrictions,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
  }

  /**
   * Ask us to pick the best free objects and hold them.
   *
   * The picker is the same one the browser widget uses, so backend and browser
   * selection get the same answer for the same inventory. `qty` above the
   * server cap is clamped, not rejected.
   */
  holdBestAvailable(
    eventKey: string,
    params: HoldBestAvailableParams,
    options: { idempotencyKey?: string } = {},
  ): Promise<HoldResult> {
    return this.#http.post(this.#path(eventKey, '/best-available'), {
      body: {
        qty: params.qty,
        categoryKey: params.categoryKey,
        zoneId: params.zoneId,
        ttlMs: params.ttlMs,
        channelIds: params.channelIds,
        ignoreChannelRestrictions: params.ignoreChannelRestrictions,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
  }

  /**
   * Pick and book in one call for a caller-owned commerce flow that is ready to
   * commit inventory and has no browser hold to confirm.
   *
   * Prefer this over holdBestAvailable-then-book for that case: a failure
   * between the two calls would strand inventory until the TTL expired.
   */
  async bookBestAvailable(
    eventKey: string,
    params: BookBestAvailableParams,
    options: { idempotencyKey?: string } = {},
  ): Promise<BookBestAvailableResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<BookBestAvailableResult>(this.#path(eventKey, '/best-available-book'), {
      body: {
        qty: params.qty,
        bookingRef,
        categoryKey: params.categoryKey,
        zoneId: params.zoneId,
        channelIds: params.channelIds,
        ignoreChannelRestrictions: params.ignoreChannelRestrictions,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
    return { ...result, bookingRef };
  }

  /**
   * Push an active hold's expiry out by a fresh window before it lapses.
   *
   * Use this rather than release-and-re-hold when the caller's checkout is
   * taking longer than the hold window. Releasing first hands the inventory to
   * whoever is racing for it in between. The server
   * clamps the window and the DO caps how many times one hold can be renewed;
   * a hold that is gone, expired, or at its cap answers 409 `cannot_extend`.
   */
  extendHold(eventKey: string, params: {
    holdId: string;
    ttlMs?: number;
  }): Promise<HoldResult> {
    return this.#http.post(this.#path(eventKey, '/extend'), { body: params });
  }

  /** Authoritative items and prices for a hold. Charge from this, not the browser. */
  retrieveHold(eventKey: string, holdId: string): Promise<RetrieveHoldResult> {
    return this.#http.get(this.#path(eventKey, `/holds/${encodeURIComponent(holdId)}`));
  }

  /** Free a hold early. Requires both the labels and the hold id. */
  release(eventKey: string, params: { labels: string[]; holdId: string }): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/release'), {
      body: { labels: params.labels, holdId: params.holdId },
    });
  }

  async book(
    eventKey: string,
    params: BookParams,
    options: { idempotencyKey?: string } = {},
  ): Promise<BookResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<Omit<BookResult, 'bookingRef'>>(this.#path(eventKey, '/book'), {
      body: {
        labels: params.labels,
        holdId: params.holdId,
        bookingRef,
        channelIds: params.channelIds,
        ignoreChannelRestrictions: params.ignoreChannelRestrictions,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
    return { ...result, bookingRef };
  }

  /** @deprecated Prefer `book({ labels, bookingRef })`; this is the legacy Platform direct-book route. */
  async boxOfficeBook(
    eventKey: string,
    params: { labels: string[]; bookingRef: string },
    options: { idempotencyKey?: string } = {},
  ): Promise<BookResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<Omit<BookResult, 'bookingRef'>>(this.#path(eventKey, '/box-book'), {
      body: { labels: params.labels, bookingRef },
      idempotencyKey: options.idempotencyKey,
    });
    return { ...result, bookingRef };
  }

  /** Release booked inventory. The caller remains responsible for any refund or fulfilment change. */
  async unbook(eventKey: string, params: UnbookParams): Promise<UnbookResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<Omit<UnbookResult, 'bookingRef'>>(this.#path(eventKey, '/unbook'), {
      body: { labels: params.labels, bookingRef },
    });
    return { ...result, bookingRef };
  }

  /** One page of Platform inventory bookings, newest first. Not commercial Orders. */
  listBookings(eventKey: string, query: InventoryBookingsQuery = {}): Promise<InventoryBookingsPage> {
    return this.#http.get(this.#path(eventKey, '/bookings'), {
      query: {
        q: query.q,
        state: query.state,
        cursor: query.cursor,
        limit: query.limit,
      },
    });
  }

  /** One booking-reference-safe lifecycle with configured-value snapshots only. */
  retrieveBooking(eventKey: string, bookingRef: string): Promise<InventoryBookingDetail> {
    return this.#http.get(this.#path(eventKey, `/bookings/${encodeURIComponent(normalizedBookingRef(bookingRef))}`));
  }

  /** Public-manifest operation-id alias for `listBookings`. */
  listInventoryBookings(eventKey: string, query: InventoryBookingsQuery = {}): Promise<InventoryBookingsPage> {
    return this.listBookings(eventKey, query);
  }

  /** Public-manifest operation-id alias for `retrieveBooking`. */
  retrieveInventoryBooking(eventKey: string, bookingRef: string): Promise<InventoryBookingDetail> {
    return this.retrieveBooking(eventKey, bookingRef);
  }

  /** Hold inventory back from sale (house seats, holds for production). */
  block(eventKey: string, params: { labels: string[] }): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/block'), { body: params });
  }

  unblock(eventKey: string, params: { labels: string[] }): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/unblock'), { body: params });
  }

  unblockAll(eventKey: string): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/unblock-all'));
  }

  retrieveAvailability(eventKey: string): Promise<unknown> {
    return this.#http.get(this.#path(eventKey, '/availability'));
  }

  updateAvailability(eventKey: string, params: Record<string, unknown>): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/availability'), { body: params });
  }
}
