import type { HttpClient, RequestOptions } from '../http.js';

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
  audience: 'embed_only';
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

export interface SeasonHold {
  operationId: string; seasonKey: string; holdId: string; state: string; bookingRef: string | null;
  expiresAt: number; policy: 'fixed_inclusion_same_seat';
  allocations: Array<{ eventKey: string; labels: string[]; items: Array<Record<string, unknown>> }>;
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
  commitOutcomes: Array<{
    eventKey: string;
    state: 'pending' | 'committed' | 'failed';
    code: string | null;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface SeasonRenewalResult {
  offer: SeasonRenewalOffer;
  location?: string;
  retryAfterSeconds?: number;
}

export interface SeasonBuyerRehearsalResult {
  season: SeasonDetail;
  rehearsal: {
    ready: true; holdOperationId: string; bookActionId: string; cancelActionId: string;
    subscriptionId: string; occurrenceIds: string[]; payloadSha256: string[];
  };
}

export interface SeasonOccurrence {
  eventKey: string; position: number; name: string; startsAt: number | null;
  venue: string | null; timezone: string | null;
  latestAmendment: { amendmentId: string; kind: string; classification: string } | null;
}

export interface SeasonAmendment {
  amendmentId: string; revision: number; eventKey: string;
  kind: 'reschedule' | 'replace' | 'cancel_exception';
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
    params: { expectedRevision: number; name?: string; edition?: string | null },
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

  openSeasonSales(seasonKey: string, expectedRevision: number): Promise<{ season: SeasonDetail }> {
    return this.#sales(seasonKey, 'open', expectedRevision);
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

  validateSeasonBuyerRehearsal(seasonKey: string, params: {
    holdOperationId: string; bookActionId: string; cancelActionId: string; subscriptionId: string;
  }): Promise<SeasonBuyerRehearsalResult> {
    return this.#http.post(`/v1/seasons/${pathPart(seasonKey)}/buyer-rehearsals/validate`, { body: params });
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

  createSeasonRenewalOffers(
    seasonKey: string,
    params: { successorPlanActivationId?: string; deadlineAt: number; contractIds?: string[] },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ offers: SeasonRenewalOffer[] }> {
    return this.#http.postWithHeaderReplay(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  listSeasonRenewalOffers(seasonKey: string): Promise<{ offers: SeasonRenewalOffer[]; truncated: boolean }> {
    return this.#http.get(`/v1/seasons/${pathPart(seasonKey)}/renewal-offers`);
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

  declineSeasonRenewalOffer(seasonKey: string, offerId: string): Promise<SeasonRenewalResult> {
    return this.#renewal(
      `/v1/seasons/${pathPart(seasonKey)}/renewal-offers/${pathPart(offerId)}/decline`, {},
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
    params: {
      eventKey: string; kind: 'reschedule' | 'replace' | 'cancel_exception';
      startsAt?: number; name?: string;
    },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<{ amendment: SeasonAmendment }> {
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
