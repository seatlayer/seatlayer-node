import type { HttpClient } from '../http.js';
import type { BookResult, HoldLineItem, HoldResult } from '../types.js';

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

  hold(eventKey: string, params: {
    labels?: string[];
    selections?: Array<{ label: string; tierId?: string | null; quantity?: number }>;
    /** Overrides the event's checkout window for this hold. */
    ttlMs?: number;
    replaceHoldId?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<HoldResult> {
    return this.#http.post(this.#path(eventKey, '/hold'), {
      body: params,
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
  holdBestAvailable(eventKey: string, params: {
    qty: number;
    categoryKey?: string;
    zoneId?: string;
    ttlMs?: number;
  }, options: { idempotencyKey?: string } = {}): Promise<HoldResult> {
    return this.#http.post(this.#path(eventKey, '/best-available'), {
      body: params,
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
  bookBestAvailable(eventKey: string, params: {
    qty: number;
    bookingRef: string;
    categoryKey?: string;
    zoneId?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<BookResult> {
    return this.#http.post(this.#path(eventKey, '/best-available-book'), {
      body: params,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Authoritative items and prices for a hold. Charge from this, not the browser. */
  retrieveHold(eventKey: string, holdId: string): Promise<{ items: HoldLineItem[]; expiresAt: number; currency: string }> {
    return this.#http.get(this.#path(eventKey, `/holds/${encodeURIComponent(holdId)}`));
  }

  /** Free a hold early. Requires both the labels and the hold id. */
  release(eventKey: string, params: { labels: string[]; holdId: string }): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/release'), { body: params });
  }

  book(eventKey: string, params: {
    /** Book a held selection… */
    holdId?: string;
    /** …or book labels outright, with no prior hold. */
    labels?: string[];
    bookingRef?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<BookResult> {
    return this.#http.post(this.#path(eventKey, '/book'), {
      body: params,
      idempotencyKey: options.idempotencyKey,
    });
  }

  boxOfficeBook(eventKey: string, params: {
    labels: string[];
    bookingRef: string;
  }, options: { idempotencyKey?: string } = {}): Promise<BookResult> {
    return this.#http.post(this.#path(eventKey, '/box-book'), {
      body: params,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Reverse a booking. Requires a key with cancel authority. */
  unbook(eventKey: string, params: { labels: string[] }): Promise<unknown> {
    return this.#http.post(this.#path(eventKey, '/unbook'), { body: params });
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
