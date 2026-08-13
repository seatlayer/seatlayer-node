import type { HttpClient } from '../http.js';
import type {
  BestAvailableBookResult,
  BestAvailableHoldResult,
  BookResult,
  AvailabilityRule,
  ExtendHoldResult,
  HoldInspection,
  HoldResult,
  InventoryBookingDetail,
  InventoryBookingPage,
  InventoryBookingState,
  TrustedInventoryAccess,
  UnbookResult,
} from '../types.js';

function normalizedBookingRef(value: string): string {
  const bookingRef = typeof value === 'string' ? value.trim() : '';
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

  hold(eventKey: string, params: TrustedInventoryAccess & {
    labels?: string[];
    selections?: Array<{ label: string; tierId?: string | null; quantity?: number }>;
    /** Overrides the event's checkout window for this hold. */
    ttlMs?: number;
    replaceHoldId?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<HoldResult> {
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
   * The picker is the same one the buyer widget uses, so a phone order and a
   * web order get the same answer for the same inventory. `qty` above the
   * server cap is clamped, not rejected.
   */
  holdBestAvailable(eventKey: string, params: TrustedInventoryAccess & {
    qty: number;
    categoryKey?: string;
    zoneId?: string;
    ttlMs?: number;
  }, options: { idempotencyKey?: string } = {}): Promise<BestAvailableHoldResult> {
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
   * Pick and book in one call — the box-office shape, where payment is already
   * taken and there is no buyer session to hold against.
   *
   * Prefer this over holdBestAvailable-then-book for that case: a failure
   * between the two calls would strand inventory until the TTL expired.
   */
  async bookBestAvailable(eventKey: string, params: TrustedInventoryAccess & {
    qty: number;
    bookingRef: string;
    categoryKey?: string;
    zoneId?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<BestAvailableBookResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<Omit<BestAvailableBookResult, 'bookingRef'>>(
      this.#path(eventKey, '/best-available-book'), {
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
   * Use this rather than release-and-re-hold when an order is taking longer
   * than the checkout window — invoiced sales, a phone order on hold. Releasing
   * first hands the seats to whoever is racing for them in between. The server
   * clamps the window and the DO caps how many times one hold can be renewed;
   * a hold that is gone, expired, or at its cap answers 409 `cannot_extend`.
   */
  extendHold(eventKey: string, params: TrustedInventoryAccess & {
    holdId: string;
    ttlMs?: number;
  }): Promise<ExtendHoldResult> {
    return this.#http.post(this.#path(eventKey, '/extend'), {
      body: {
        holdId: params.holdId,
        ttlMs: params.ttlMs,
        channelIds: params.channelIds,
        ignoreChannelRestrictions: params.ignoreChannelRestrictions,
        reason: params.reason,
      },
    });
  }

  /** Authoritative items and prices for a hold. Charge from this, not the browser. */
  retrieveHold(eventKey: string, holdId: string): Promise<HoldInspection> {
    return this.#http.get(this.#path(eventKey, `/holds/${encodeURIComponent(holdId)}`));
  }

  /** Free a hold early. Requires both the labels and the hold id. */
  release(eventKey: string, params: { labels: string[]; holdId: string }): Promise<{
    ok: true;
    released: string[];
  }> {
    return this.#http.post(this.#path(eventKey, '/release'), {
      body: { labels: params.labels, holdId: params.holdId },
    });
  }

  async book(eventKey: string, params: TrustedInventoryAccess & {
    /** Book a held selection… */
    holdId?: string;
    /** …or book labels outright, with no prior hold. */
    labels?: string[];
    /** Stable order reference used to reconcile and safely repeat the booking. */
    bookingRef: string;
  }, options: { idempotencyKey?: string } = {}): Promise<BookResult> {
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

  /** @deprecated Prefer `book({ labels, bookingRef })`; this is the legacy Platform route. */
  async boxOfficeBook(eventKey: string, params: {
    labels: string[];
    bookingRef: string;
  }, options: { idempotencyKey?: string } = {}): Promise<BookResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<Omit<BookResult, 'bookingRef'>>(this.#path(eventKey, '/box-book'), {
      body: { labels: params.labels, bookingRef },
      idempotencyKey: options.idempotencyKey,
    });
    return { ...result, bookingRef };
  }

  /** Reverse a booking. Requires a key with cancel authority. */
  async unbook(eventKey: string, params: { labels: string[]; bookingRef: string }): Promise<UnbookResult> {
    const bookingRef = normalizedBookingRef(params.bookingRef);
    const result = await this.#http.post<Omit<UnbookResult, 'bookingRef'>>(this.#path(eventKey, '/unbook'), {
      body: { labels: params.labels, bookingRef },
    });
    return { ...result, bookingRef };
  }

  /** Hold inventory back from sale (house seats, holds for production). */
  block(eventKey: string, params: { labels: string[]; releaseAt?: number | null }): Promise<{
    ok: true;
    blocked: string[];
  }> {
    return this.#http.post(this.#path(eventKey, '/block'), {
      body: { labels: params.labels, releaseAt: params.releaseAt },
    });
  }

  unblock(eventKey: string, params: { labels: string[] }): Promise<{ ok: true; unblocked: string[] }> {
    return this.#http.post(this.#path(eventKey, '/unblock'), { body: params });
  }

  unblockAll(eventKey: string): Promise<{ ok: true; freed: number }> {
    return this.#http.post(this.#path(eventKey, '/unblock-all'));
  }

  retrieveAvailability(eventKey: string): Promise<{ rules: Record<string, AvailabilityRule> }> {
    return this.#http.get(this.#path(eventKey, '/availability'));
  }

  updateAvailability(eventKey: string, params: {
    rules: Record<string, AvailabilityRule>;
  }): Promise<{ ok: true; hidden: string[]; rules: Record<string, AvailabilityRule> }> {
    return this.#http.post(this.#path(eventKey, '/availability'), { body: { rules: params.rules } });
  }

  /** Page stable booking-reference history for reconciliation and support. */
  listBookings(eventKey: string, options: {
    q?: string;
    state?: InventoryBookingState;
    limit?: number;
    cursor?: string;
  } = {}): Promise<InventoryBookingPage> {
    return this.#http.get(this.#path(eventKey, '/bookings'), { query: options });
  }

  /** Retrieve one booking plus its bounded lifecycle audit trail. */
  async retrieveBooking(eventKey: string, bookingRef: string): Promise<InventoryBookingDetail> {
    return this.#http.get(
      this.#path(eventKey, `/bookings/${encodeURIComponent(normalizedBookingRef(bookingRef))}`),
    );
  }

  /** Public-manifest operation-id alias for `listBookings`. */
  listInventoryBookings(eventKey: string, options: {
    q?: string;
    state?: InventoryBookingState;
    limit?: number;
    cursor?: string;
  } = {}): Promise<InventoryBookingPage> {
    return this.listBookings(eventKey, options);
  }

  /** Public-manifest operation-id alias for `retrieveBooking`. */
  retrieveInventoryBooking(eventKey: string, bookingRef: string): Promise<InventoryBookingDetail> {
    return this.retrieveBooking(eventKey, bookingRef);
  }
}
