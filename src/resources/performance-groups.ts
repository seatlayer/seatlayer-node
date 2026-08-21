import type { HttpClient } from '../http.js';
import type { HoldLineItem, KeyMode } from '../types.js';

/** A fixed run of two to eight compatible assigned-seat performances. */
export interface PerformanceGroup {
  key: string;
  kind: 'performance_run';
  name: string;
  externalRef: string | null;
  state: 'draft' | 'active' | 'closing' | 'closed' | 'archived';
  revision: number;
  workspaceId: string;
  mode: KeyMode;
  environment: string | null;
  chartId: string;
  sourceChartKey: string;
  inventoryModelVersion: number;
  currency: string;
  venue: string | null;
  timezone: string | null;
  performanceCount: number;
  firstStartsAt: number;
  lastStartsAt: number;
  createdAt: number;
  updatedAt: number;
  activatedAt: number | null;
  closedAt: number | null;
}

export interface PerformanceGroupPerformance {
  position: number;
  eventKey: string;
  name: string;
  startsAt: number;
  endsAt: number | null;
  venue: string | null;
  timezone: string | null;
  externalRef: string | null;
  salesState: string;
  status: string;
}

export interface PerformanceGroupDetail extends PerformanceGroup {
  performances: PerformanceGroupPerformance[];
}

export interface PerformanceGroupLifecycleOperation {
  operationId: string;
  kind: 'ACTIVATION' | 'CLOSE';
  phase:
    | 'activation_locking' | 'activation_registry' | 'activation_aborting' | 'active' | 'activation_failed'
    | 'close_registry' | 'close_draining' | 'close_finalize' | 'close_unlocking' | 'close_failed' | 'closed';
  terminal: boolean;
  totalLocks: number;
  ackedLocks: number;
  remainingOperations: number | null;
  code: string | null;
}

export interface PerformanceGroupLifecycleResult {
  performanceGroup: PerformanceGroupDetail;
  lifecycleOperation: PerformanceGroupLifecycleOperation;
  /** Present while SeatLayer is still coordinating the lifecycle transition. */
  message?: string;
}

export interface PerformanceGroupBuyerAccessSession {
  sessionId: string;
  allowedOrigin: string;
  expiresAt: number;
  includePublic: boolean;
  maxQuantity: number | null;
  buyerRef: string | null;
  partnerRef: string | null;
  accessSource: 'promoter' | 'partner';
  state: 'active' | 'revoked';
  createdAt: number;
  revokedAt: number | null;
}

/** One-time reveal. Store the token securely and pass it only to the browser picker. */
export interface PerformanceGroupBuyerAccessReveal extends PerformanceGroupBuyerAccessSession {
  token: string;
  performanceGroupKey: string;
}

export interface PerformanceGroupHold {
  operationId: string;
  state: 'preparing' | 'commit_pending' | 'committed' | 'expire_pending' | 'expired' | 'booked' | 'abort_pending' | 'aborted';
  currency: string;
  groupRevision: number;
  allocations: Array<{
    eventKey: string;
    name: string;
    startsAt: number;
    endsAt: number | null;
    configuredValue: number;
    items: HoldLineItem[];
  }>;
  [key: string]: unknown;
}

export interface PerformanceGroupBooking {
  bookActionId: string;
  operationId: string;
  groupId: string;
  bookingRef: string;
  state: 'book_pending' | 'booked' | 'book_failed';
  createdAt: number;
  bookedAt: number | null;
  totalPerformances: number;
  bookedPerformances: number;
  nextRetryAt: number | null;
  attempts: number;
  lastError: string | null;
}

export interface PerformanceGroupListOptions {
  workspaceId?: string;
  externalRef?: string;
  state?: PerformanceGroup['state'];
  limit?: number;
  cursor?: string;
}

export interface CreatePerformanceGroupParams {
  name: string;
  eventKeys: string[];
  externalRef?: string | null;
}

export interface CreatePerformanceGroupBuyerAccessSessionParams {
  allowedOrigin: string;
  includePublic: boolean;
  channelIdsByEvent?: Record<string, string[]>;
  expiresInSeconds?: number;
  maxQuantity?: number | null;
  buyerRef?: string;
  partnerRef?: string;
}

/**
 * Fixed-run lifecycle, trusted hold inspection, and host-authorized booking.
 *
 * The browser uses `@seatlayer/js`'s PerformanceGroupPicker with the one-time
 * bearer minted here. Keep this secret-key resource on the host server.
 */
export class PerformanceGroups {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  listPerformanceGroups(options: PerformanceGroupListOptions = {}): Promise<{
    performanceGroups: PerformanceGroup[];
    nextCursor: string | null;
  }> {
    return this.#http.get('/v1/performance-groups', {
      query: {
        workspaceId: options.workspaceId,
        externalRef: options.externalRef,
        state: options.state,
        limit: options.limit,
        cursor: options.cursor,
      },
    });
  }

  /** Create a draft run. Repeating the same idempotency key safely replays it. */
  createPerformanceGroup(
    params: CreatePerformanceGroupParams,
    options: { idempotencyKey?: string } = {},
  ): Promise<{ performanceGroup: PerformanceGroupDetail }> {
    return this.#http.postWithHeaderReplay('/v1/performance-groups', {
      body: params,
      idempotencyKey: options.idempotencyKey,
    });
  }

  retrievePerformanceGroup(performanceGroupKey: string): Promise<{ performanceGroup: PerformanceGroupDetail }> {
    return this.#http.get(`/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}`);
  }

  /** Delete only a draft group. Active and closed runs retain their audit identity. */
  deletePerformanceGroup(performanceGroupKey: string): Promise<void> {
    return this.#http.delete(`/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}`);
  }

  /**
   * Start activation. If `lifecycleOperation.terminal` is false, poll with
   * retrievePerformanceGroupLifecycle using its operationId.
   */
  activatePerformanceGroup(performanceGroupKey: string, expectedRevision: number): Promise<PerformanceGroupLifecycleResult> {
    return this.#http.post(`/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/activate`, {
      body: { expectedRevision },
    });
  }

  /**
   * Stop new group sales and complete closure after active group holds drain.
   * If it is still pending, poll the lifecycle operation returned in the body.
   */
  closePerformanceGroup(performanceGroupKey: string, expectedRevision: number): Promise<PerformanceGroupLifecycleResult> {
    return this.#http.post(`/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/close`, {
      body: { expectedRevision },
    });
  }

  retrievePerformanceGroupLifecycle(
    performanceGroupKey: string,
    operationId: string,
  ): Promise<PerformanceGroupLifecycleResult> {
    return this.#http.get(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/lifecycle/${encodeURIComponent(operationId)}`,
    );
  }

  /**
   * Mint a one-time browser bearer for PerformanceGroupPicker. This operation
   * is deliberately single-attempt: a network retry could reveal two secrets.
   */
  createPerformanceGroupBuyerAccessSession(
    performanceGroupKey: string,
    params: CreatePerformanceGroupBuyerAccessSessionParams,
  ): Promise<PerformanceGroupBuyerAccessReveal> {
    return this.#http.post(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/buyer-access-sessions`,
      { body: params },
    );
  }

  listPerformanceGroupBuyerAccessSessions(performanceGroupKey: string, options: { limit?: number } = {}): Promise<{
    sessions: PerformanceGroupBuyerAccessSession[];
  }> {
    return this.#http.get(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/buyer-access-sessions`,
      { query: { limit: options.limit } },
    );
  }

  revokePerformanceGroupBuyerAccessSession(performanceGroupKey: string, sessionId: string): Promise<{
    ok: true;
    sessionId: string;
  }> {
    return this.#http.delete(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/buyer-access-sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  retrievePerformanceGroupHold(performanceGroupKey: string, operationId: string): Promise<{
    hold: PerformanceGroupHold;
  }> {
    return this.#http.get(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/holds/${encodeURIComponent(operationId)}`,
    );
  }

  /**
   * Confirm payment on a committed group hold. Keep bookActionId and bookingRef
   * stable across a retry, then poll retrievePerformanceGroupBooking while the
   * returned booking is in `book_pending` state.
   */
  bookPerformanceGroupHold(
    performanceGroupKey: string,
    operationId: string,
    params: { bookActionId: string; bookingRef: string },
  ): Promise<{ booking: PerformanceGroupBooking }> {
    return this.#http.post(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/holds/${encodeURIComponent(operationId)}/book`,
      { body: params },
    );
  }

  retrievePerformanceGroupBooking(performanceGroupKey: string, actionId: string): Promise<{
    booking: PerformanceGroupBooking;
  }> {
    return this.#http.get(
      `/v1/performance-groups/${encodeURIComponent(performanceGroupKey)}/bookings/${encodeURIComponent(actionId)}`,
    );
  }
}
