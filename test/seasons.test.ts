import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  SeatLayer,
  SeatLayerError,
  SeatLayerRateLimitError,
  type SeasonAmendment,
  type SeasonBulkJobDetail,
  type SeasonHold,
  type SeasonPackagePrice,
  type SeasonPriceList,
  type SeasonPriceTypeKey,
  type SeasonRenewalOffer,
  type SeasonValidation,
} from '../src/index.js';

type StubResponse = {
  status: number;
  body?: unknown;
  /** Sent as-is instead of JSON, for CSV downloads. */
  rawBody?: string;
  headers?: Record<string, string>;
};

function stubFetch(responses: StubResponse[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('stubFetch: more requests than queued responses');
    return new Response(next.rawBody ?? (next.body === undefined ? null : JSON.stringify(next.body)), {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, responses };
}

const GENERATED_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One operation in a table: the call, the request it must send, and what it returns. */
interface OperationCase {
  name: string;
  run: (sdk: SeatLayer) => Promise<unknown>;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path plus query string, exactly as sent. */
  path: string;
  /** Parsed JSON body; leave out when no body may be sent. */
  body?: unknown;
  /** A caller key, 'generated' for a header-replay call without one, or absent for no header. */
  idempotencyKey?: string;
  response?: StubResponse;
  /** When present, the resolved value must equal this. */
  returns?: unknown;
}

/** Runs every case against one queued stub, then checks each request and that the queue drained. */
async function expectOperations(cases: OperationCase[]) {
  const stub = stubFetch(cases.map((entry) => entry.response ?? { status: 200, body: { ok: true } }));
  const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });
  const results: unknown[] = [];
  for (const entry of cases) results.push(await entry.run(sdk));

  expect(stub.calls).toHaveLength(cases.length);
  cases.forEach((entry, index) => {
    const call = stub.calls[index]!;
    const url = new URL(call.url);
    const headers = call.init.headers as Record<string, string>;
    expect(`${entry.name}: ${call.init.method} ${url.pathname}${url.search}`)
      .toBe(`${entry.name}: ${entry.method} ${entry.path}`);
    const sent = call.init.body === undefined ? undefined : JSON.parse(call.init.body as string);
    expect(sent, `${entry.name} body`).toEqual(entry.body);
    if (entry.idempotencyKey === undefined) {
      expect(headers['Idempotency-Key'], `${entry.name} sends no Idempotency-Key`).toBeUndefined();
    } else if (entry.idempotencyKey === 'generated') {
      expect(headers['Idempotency-Key'], `${entry.name} generates a key`).toMatch(GENERATED_KEY);
    } else {
      expect(headers['Idempotency-Key'], `${entry.name} sends the caller key`).toBe(entry.idempotencyKey);
    }
    if ('returns' in entry) expect(results[index], `${entry.name} result`).toEqual(entry.returns);
  });
  expect(stub.responses).toHaveLength(0);
}

function lifecycle(terminal: boolean, kind: 'ACTIVATION' | 'CLOSE' | 'ARCHIVE' | 'PLAN_PUBLICATION' = 'ACTIVATION') {
  return {
    season: { key: 'sea_a/b', plans: [] },
    lifecycleOperation: {
      operationId: kind === 'PLAN_PUBLICATION' ? 'spo_1' : kind === 'CLOSE' ? 'spc_1' : kind === 'ARCHIVE' ? 'sar_1' : 'spa_1',
      kind,
      phase: terminal ? kind === 'PLAN_PUBLICATION' ? 'published' : kind === 'CLOSE' ? 'closed' : kind === 'ARCHIVE' ? 'archived' : 'active' : 'decided',
      terminal,
    },
  };
}

describe('Season organizer resource', () => {
  it('maps every S03 operation id, encoding, replay class, and 202 polling header', async () => {
    const stub = stubFetch([
      { status: 200, body: { seasons: [], nextCursor: null } },
      { status: 200, body: { valid: true, mode: 'test', eventKeys: ['ev_1', 'ev_2'], occurrenceCount: 2, sourcePerformanceGroups: [], issues: [] } },
      { status: 201, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 200, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 200, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 204 },
      { status: 202, body: lifecycle(false), headers: {
        location: '/v1/seasons/sea_a%2Fb/lifecycle/spa_1', 'retry-after': '0',
      } },
      { status: 200, body: lifecycle(true) },
      { status: 200, body: lifecycle(true, 'CLOSE') },
      { status: 200, body: lifecycle(true) },
      { status: 201, body: { plan: { key: 'spl_a/b' } } },
      { status: 200, body: { plan: { key: 'spl_a/b' } } },
      { status: 200, body: { ...lifecycle(true, 'PLAN_PUBLICATION'), plan: { key: 'spl_a/b' } } },
      { status: 200, body: { ...lifecycle(true, 'PLAN_PUBLICATION'), plan: { key: 'spl_a/b' } } },
      { status: 200, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 200, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 200, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 200, body: { season: { key: 'sea_a/b', plans: [] } } },
      { status: 201, body: { season: { key: 'sea_live', plans: [] } } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch });

    await sdk.seasons.listSeasons({ workspaceId: 'ws 1', structureState: 'draft', limit: 20, cursor: 'c/1' });
    const validation = await sdk.seasons.validateSeason({ sourcePerformanceGroupKeys: ['pg_1'] });
    expectTypeOf(validation).toEqualTypeOf<SeasonValidation>();
    await sdk.seasons.createSeason(
      { name: 'Series', sourcePerformanceGroupKeys: ['pg_1'] },
      { idempotencyKey: 'season-create-1' },
    );
    await sdk.seasons.retrieveSeason('sea_a/b');
    await sdk.seasons.updateSeason('sea_a/b', { expectedRevision: 1, name: 'Series 2' }, {
      idempotencyKey: 'season-update-1',
    });
    await sdk.seasons.deleteSeason('sea_a/b', { idempotencyKey: 'season-delete-1' });
    const accepted = await sdk.seasons.activateSeason('sea_a/b', 1);
    expect(accepted).toMatchObject({
      location: '/v1/seasons/sea_a%2Fb/lifecycle/spa_1', retryAfterSeconds: 0,
    });
    await expect(sdk.seasons.waitForSeasonLifecycle(accepted)).resolves.toMatchObject({
      lifecycleOperation: { terminal: true },
    });
    await sdk.seasons.closeSeason('sea_a/b', 2);
    await sdk.seasons.retrieveSeasonLifecycle('sea_a/b', 'spa/1');
    await sdk.seasons.createSeasonPlan('sea_a/b', {
      name: 'Premium', eventKeys: ['ev_1', 'ev_2'],
    }, { idempotencyKey: 'season-plan-1' });
    await sdk.seasons.retrieveSeasonPlan('sea_a/b', 'spl_a/b');
    await sdk.seasons.publishSeasonPlan('sea_a/b', 'spl_a/b', 2);
    await sdk.seasons.supersedeSeasonPlan('sea_a/b', 'spl_a/b', 3);
    await sdk.seasons.openSeasonSales('sea_a/b', 3);
    await sdk.seasons.pauseSeasonSales('sea_a/b', 4);
    await sdk.seasons.resumeSeasonSales('sea_a/b', 5);
    await sdk.seasons.endSeasonSales('sea_a/b', 6);
    await sdk.seasons.duplicateSeasonToLive('sea_a/b', { eventKeys: ['ev_l1', 'ev_l2'] }, {
      idempotencyKey: 'season-live-1',
    });

    const paths = stub.calls.map((call) => new URL(call.url).pathname);
    expect(stub.calls[0]!.url).toBe(
      'https://api.seatlayer.io/v1/seasons?workspaceId=ws+1&structureState=draft&limit=20&cursor=c%2F1',
    );
    expect(paths).toEqual([
      '/v1/seasons',
      '/v1/seasons/validate',
      '/v1/seasons',
      '/v1/seasons/sea_a%2Fb',
      '/v1/seasons/sea_a%2Fb',
      '/v1/seasons/sea_a%2Fb',
      '/v1/seasons/sea_a%2Fb/activate',
      '/v1/seasons/sea_a%2Fb/lifecycle/spa_1',
      '/v1/seasons/sea_a%2Fb/close',
      '/v1/seasons/sea_a%2Fb/lifecycle/spa%2F1',
      '/v1/seasons/sea_a%2Fb/plans',
      '/v1/seasons/sea_a%2Fb/plans/spl_a%2Fb',
      '/v1/seasons/sea_a%2Fb/plans/spl_a%2Fb/publish',
      '/v1/seasons/sea_a%2Fb/plans/spl_a%2Fb/supersede',
      '/v1/seasons/sea_a%2Fb/sales/open',
      '/v1/seasons/sea_a%2Fb/sales/pause',
      '/v1/seasons/sea_a%2Fb/sales/resume',
      '/v1/seasons/sea_a%2Fb/sales/end',
      '/v1/seasons/sea_a%2Fb/duplicate-to-live',
    ]);
    const header = (index: number) => (stub.calls[index]!.init.headers as Record<string, string>)['Idempotency-Key'];
    expect([header(2), header(4), header(5), header(10), header(18)]).toEqual([
      'season-create-1', 'season-update-1', 'season-delete-1', 'season-plan-1', 'season-live-1',
    ]);
    for (const index of [1, 6, 8, 12, 13, 14, 15, 16, 17]) expect(header(index)).toBeUndefined();
    expect(stub.responses).toHaveLength(0);
  });

  it('retries header-replay PATCH with the same key but never retries domain-exact activation', async () => {
    const stub = stubFetch([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 200, body: { season: { key: 'sea_1', plans: [] } } },
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 2 });

    await sdk.seasons.updateSeason('sea_1', { expectedRevision: 1, name: 'Replay' }, {
      idempotencyKey: 'stable-update',
    });
    await expect(sdk.seasons.activateSeason('sea_1', 2)).rejects.toBeInstanceOf(SeatLayerRateLimitError);

    expect(stub.calls).toHaveLength(3);
    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(headers[0]!['Idempotency-Key']).toBe('stable-update');
    expect(headers[1]!['Idempotency-Key']).toBe('stable-update');
    expect(headers[2]!['Idempotency-Key']).toBeUndefined();
  });

  it('maps archiveSeason as a single-attempt domain-exact lifecycle operation', async () => {
    const stub = stubFetch([{ status: 200, body: lifecycle(true, 'ARCHIVE') }]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });

    const archived = await sdk.seasons.archiveSeason('sea_a/b', 4);

    expect(archived.lifecycleOperation).toMatchObject({ kind: 'ARCHIVE', phase: 'archived', terminal: true });
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.url).toBe('https://api.seatlayer.io/v1/seasons/sea_a%2Fb/archive');
    expect((stub.calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined();
  });

  it('maps the S04 trusted handoff, recovery, cancellation, and rehearsal paths', async () => {
    const pending = {
      booking: {
        actionId: 'sba_1', operationId: 'sop/1', bookingRef: 'order_1',
        planActivationId: 'spa_1', state: 'book_pending', outcomes: [], lastError: null,
        cancellation: null,
      },
    };
    const booked = { booking: { ...pending.booking, state: 'booked' } };
    const cancelled = {
      booking: {
        ...booked.booking, state: 'cancelled',
        cancellation: {
          cancelActionId: 'sca_1', state: 'cancelled', rightDisposition: 'release',
          outcomes: [], lastError: null,
        },
      },
    };
    const stub = stubFetch([
      { status: 201, body: { sessionId: 'sbs_1', token: 'bss_secret', seasonKey: 'sea_a/b' } },
      { status: 200, body: { sessions: [] } },
      { status: 200, body: { ok: true, sessionId: 'sbs_1' } },
      { status: 200, body: { hold: {
        operationId: 'sop/1', seasonKey: 'sea_a/b', holdId: 'shh_1', state: 'committed',
        bookingRef: null, expiresAt: Date.now() + 60_000, policy: 'fixed_inclusion_same_seat',
        pricingAuthority: 'host', authoritativeAmountIncluded: false, allocations: [],
      } } },
      { status: 202, body: pending, headers: {
        location: '/v1/seasons/sea_a%2Fb/bookings/sba_1', 'retry-after': '0',
      } },
      { status: 200, body: booked },
      { status: 200, body: cancelled },
      { status: 200, body: {
        season: { key: 'sea_a/b', plans: [] },
        rehearsal: {
          ready: true, holdOperationId: 'sop/1', bookActionId: 'sba_1',
          cancelActionId: 'sca_1', subscriptionId: 'wh_1', occurrenceIds: ['1', '2', '3'],
          payloadSha256: ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)],
          verifiedAt: 1_800_000_000_000,
        },
      } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });

    await sdk.seasons.createSeasonBuyerAccessSession('sea_a/b', {
      allowedOrigin: 'https://tickets.example', includePublic: true, maxQuantity: 2,
    });
    await sdk.seasons.listSeasonBuyerAccessSessions('sea_a/b', { limit: 10 });
    await sdk.seasons.revokeSeasonBuyerAccessSession('sea_a/b', 'sbs/1');
    const inspected = await sdk.seasons.retrieveSeasonHold('sea_a/b', 'sop/1');
    expectTypeOf(inspected.hold).toEqualTypeOf<SeasonHold>();
    expect(inspected.hold).toMatchObject({
      pricingAuthority: 'host', authoritativeAmountIncluded: false, allocations: [],
    });
    const accepted = await sdk.seasons.bookSeasonHold('sea_a/b', 'sop/1', {
      bookActionId: 'sba_1', bookingRef: 'order_1',
    });
    expect(accepted).toMatchObject({ retryAfterSeconds: 0, booking: { state: 'book_pending' } });
    await expect(sdk.seasons.waitForSeasonBooking('sea_a/b', accepted)).resolves.toMatchObject({
      booking: { state: 'booked' },
    });
    await sdk.seasons.cancelSeasonBooking('sea_a/b', 'sba/1', {
      cancelActionId: 'sca_1', bookingRef: 'order_1', planActivationId: 'spa_1',
      rightDisposition: 'release',
    });
    await sdk.seasons.validateSeasonBuyerRehearsal('sea_a/b');

    expect(stub.calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/v1/seasons/sea_a%2Fb/buyer-access-sessions',
      '/v1/seasons/sea_a%2Fb/buyer-access-sessions',
      '/v1/seasons/sea_a%2Fb/buyer-access-sessions/sbs%2F1',
      '/v1/seasons/sea_a%2Fb/holds/sop%2F1',
      '/v1/seasons/sea_a%2Fb/holds/sop%2F1/book',
      '/v1/seasons/sea_a%2Fb/bookings/sba_1',
      '/v1/seasons/sea_a%2Fb/bookings/sba%2F1/cancel',
      '/v1/seasons/sea_a%2Fb/buyer-rehearsals/validate',
    ]);
    expect(stub.calls[7]!.init.body).toBeUndefined();
    expect(stub.calls.every((call) =>
      !(call.init.headers as Record<string, string>)['Idempotency-Key'])).toBe(true);
    expect(stub.responses).toHaveLength(0);
  });

  it('never invisibly retries a show-once Season buyer-session mint', async () => {
    const stub = stubFetch([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });
    await expect(sdk.seasons.createSeasonBuyerAccessSession('sea_1', {
      allowedOrigin: 'https://tickets.example', includePublic: true,
    })).rejects.toBeInstanceOf(SeatLayerRateLimitError);
    expect(stub.calls).toHaveLength(1);
  });

  it('maps the S05 incumbent import and recoverable renewal resources without retrying domain-exact commits', async () => {
    const offer = (state: 'offered' | 'committing' | 'renewed' | 'declined' | 'released') => ({
      offerId: 'sro_a/b', contractId: 'sco_1', rightId: 'ssr_1', holderRef: 'holder_1',
      successorPlanActivationId: 'spa_1', labels: ['A-1'], state,
      deadlineAt: Date.now() + 60_000, intentId: 'sri_1', intentAt: Date.now(),
      commitActionId: state === 'offered' ? null : 'sba_1', orderRef: null, bookingRef: null,
      successorContractId: state === 'renewed' ? 'sco_2' : null, commitOutcomes: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    const imported = {
      import: {
        importId: 'shi_a/b', dryRun: false, state: 'committed', successorPlanActivationId: 'spa_1',
        acceptedCount: 1, rejectedCount: 0, rows: [{
          rowId: 'row_1', holderRef: 'holder_1', priorPlanActivationId: 'spa_prior',
          priorContractRef: 'contract_prior', labels: ['A-1'], existingBookingRef: 'book_prior',
          decision: 'accepted', errorCode: null, contractId: 'sco_1', rightId: 'ssr_1',
        }], createdAt: Date.now(), committedAt: Date.now(),
      },
    };
    const stub = stubFetch([
      { status: 201, body: imported },
      { status: 200, body: imported },
      { status: 201, body: { offers: [offer('offered')] } },
      { status: 200, body: { offers: [offer('offered')] } },
      { status: 200, body: { offer: offer('offered') } },
      { status: 200, body: { offer: offer('offered') } },
      { status: 200, body: { offer: offer('offered') } },
      { status: 202, body: { offer: offer('committing') }, headers: {
        location: '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb', 'retry-after': '0',
      } },
      { status: 200, body: { offer: offer('renewed') } },
      { status: 200, body: { offer: offer('declined') } },
      { status: 200, body: { offer: offer('released') } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });

    await sdk.seasons.createSeasonHolderImport('sea_a/b', {
      successorPlanActivationId: 'spa_1', rows: imported.import.rows,
    }, { idempotencyKey: 'import-1' });
    await sdk.seasons.retrieveSeasonHolderImport('sea_a/b', 'shi_a/b');
    await sdk.seasons.createSeasonRenewalOffers('sea_a/b', {
      successorPlanActivationId: 'spa_1', deadlineAt: Date.now() + 60_000,
    }, { idempotencyKey: 'offers-1' });
    await sdk.seasons.listSeasonRenewalOffers('sea_a/b');
    await sdk.seasons.retrieveSeasonRenewalOffer('sea_a/b', 'sro_a/b');
    await sdk.seasons.inspectSeasonRenewalOffer('sea_a/b', 'sro_a/b');
    await sdk.seasons.extendSeasonRenewalOffer('sea_a/b', 'sro_a/b', Date.now() + 120_000);
    const accepted = await sdk.seasons.commitSeasonRenewalOffer('sea_a/b', 'sro_a/b', {
      commitActionId: 'sba_1', orderRef: 'ord_1', bookingRef: 'book_1', planActivationId: 'spa_1',
    });
    expect(accepted).toMatchObject({ offer: { state: 'committing' }, retryAfterSeconds: 0 });
    await expect(sdk.seasons.waitForSeasonRenewal('sea_a/b', accepted)).resolves.toMatchObject({
      offer: { state: 'renewed' },
    });
    await sdk.seasons.declineSeasonRenewalOffer('sea_a/b', 'sro_a/b');
    await sdk.seasons.releaseSeasonRenewalOffer('sea_a/b', 'sro_a/b');

    expect(stub.calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/v1/seasons/sea_a%2Fb/imports',
      '/v1/seasons/sea_a%2Fb/imports/shi_a%2Fb',
      '/v1/seasons/sea_a%2Fb/renewal-offers',
      '/v1/seasons/sea_a%2Fb/renewal-offers',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb/inspect',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb/extend',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb/commit',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb/decline',
      '/v1/seasons/sea_a%2Fb/renewal-offers/sro_a%2Fb/release',
    ]);
    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(headers[0]!['Idempotency-Key']).toBe('import-1');
    expect(headers[2]!['Idempotency-Key']).toBe('offers-1');
    for (const index of [1, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(headers[index]!['Idempotency-Key']).toBeUndefined();
    }
    expect(stub.responses).toHaveLength(0);
  });

  it('keeps the pre-freeze importSeasonHolders alias source-compatible', async () => {
    const stub = stubFetch([{ status: 201, body: { import: { importId: 'shi_1' } } }]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch });

    await sdk.seasons.importSeasonHolders('sea_1', {
      successorPlanActivationId: 'spa_1', rows: [],
    }, { idempotencyKey: 'legacy-import-1' });

    expect(new URL(stub.calls[0]!.url).pathname).toBe('/v1/seasons/sea_1/imports');
    expect((stub.calls[0]!.init.headers as Record<string, string>)['Idempotency-Key'])
      .toBe('legacy-import-1');
  });

  it('maps S06 amendments, operations, support, replay, audit, and export without widening retry authority', async () => {
    const amendment = {
      amendmentId: 'sam_a/b', revision: 1, eventKey: 'ev_a/b', kind: 'reschedule',
      classification: 'identity_preserving', planActivationId: 'spa_1',
      occurrenceSetSha256: 'a'.repeat(64), before: {}, after: {}, state: 'applied',
      contractOutcomes: [], allocationOutcomes: [], createdAt: Date.now(),
    };
    const stub = stubFetch([
      { status: 200, body: { occurrences: [] } },
      { status: 201, body: { amendment } },
      { status: 200, body: { amendments: [amendment] } },
      { status: 200, body: { amendment } },
      { status: 200, body: { report: {} } },
      { status: 200, body: { operations: [] } },
      { status: 200, body: { requestId: 'req_1', lookup: { bookings: [], offers: [], contracts: [] } } },
      { status: 200, body: { outbox: [], undelivered: 0 } },
      { status: 200, body: { occurrence: { occurrenceId: 'occ_a/b' } } },
      { status: 200, body: { requestId: 'req_2', audit: [], truncated: false } },
      { status: 200, body: { requestId: 'req_3', export: { version: 'season-support-export.v1' } } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });

    await sdk.seasons.listSeasonOccurrences('sea_a/b');
    await sdk.seasons.createSeasonAmendment('sea_a/b', {
      eventKey: 'ev_a/b', kind: 'reschedule', startsAt: Date.now(),
    }, { idempotencyKey: 'amendment-1' });
    await sdk.seasons.listSeasonAmendments('sea_a/b');
    await sdk.seasons.retrieveSeasonAmendment('sea_a/b', 'sam_a/b');
    await sdk.seasons.retrieveSeasonReport('sea_a/b');
    await sdk.seasons.listSeasonOperations('sea_a/b');
    await sdk.seasons.retrieveSeasonSupportLookup('sea_a/b', { holderRef: 'holder a/b' });
    await sdk.seasons.listSeasonOutbox('sea_a/b');
    await sdk.seasons.replaySeasonOutbox('sea_a/b', 'occ_a/b');
    await sdk.seasons.listSeasonAudit('sea_a/b');
    await sdk.seasons.exportSeasonSupportSnapshot('sea_a/b');

    expect(stub.calls.map((call) => `${new URL(call.url).pathname}${new URL(call.url).search}`)).toEqual([
      '/v1/seasons/sea_a%2Fb/occurrences',
      '/v1/seasons/sea_a%2Fb/amendments',
      '/v1/seasons/sea_a%2Fb/amendments',
      '/v1/seasons/sea_a%2Fb/amendments/sam_a%2Fb',
      '/v1/seasons/sea_a%2Fb/reports',
      '/v1/seasons/sea_a%2Fb/operations',
      '/v1/seasons/sea_a%2Fb/support-lookups?holderRef=holder+a%2Fb',
      '/v1/seasons/sea_a%2Fb/outbox',
      '/v1/seasons/sea_a%2Fb/outbox/occ_a%2Fb/replay',
      '/v1/seasons/sea_a%2Fb/audit',
      '/v1/seasons/sea_a%2Fb/export',
    ]);
    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(headers[1]!['Idempotency-Key']).toBe('amendment-1');
    for (const index of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(headers[index]!['Idempotency-Key']).toBeUndefined();
    }
    expect(stub.responses).toHaveLength(0);
  });

  it('maps the 32 season 2a operations: verb, escaped path, query, body, and replay class', async () => {
    const csvHolders = 'holderRef,holderName\nholder_1,"Smith, A"\n';
    const csvOrders = 'orderId,displayRef\nord_1,SL-1\n';
    const source = { bookingActionId: 'sba_1' };
    await expectOperations([
      {
        name: 'createSeasonHolderImportFromSeason',
        run: (sdk) => sdk.seasons.createSeasonHolderImportFromSeason('sea_a/b', {
          sourceSeasonId: 'sea_prev', successorPlanActivationId: 'spa_1', dryRun: true,
        }, { idempotencyKey: 'from-season-1' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/imports/from-season',
        body: { sourceSeasonId: 'sea_prev', successorPlanActivationId: 'spa_1', dryRun: true },
        idempotencyKey: 'from-season-1', response: { status: 201, body: { import: { holders: 2 } } },
      },
      {
        name: 'listSeasonPerformances',
        run: (sdk) => sdk.seasons.listSeasonPerformances('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/performances',
      },
      {
        name: 'createSeasonPerformances',
        run: (sdk) => sdk.seasons.createSeasonPerformances('sea_a/b', {
          titlePattern: 'Home game', timezone: 'Europe/London', repeat: 'weekly', count: 3,
          firstStartsAt: 1_800_000_000_000, region: 'western-europe', attachToPlanKeys: ['spl/1'],
        }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/performances',
        body: {
          titlePattern: 'Home game', timezone: 'Europe/London', repeat: 'weekly', count: 3,
          firstStartsAt: 1_800_000_000_000, region: 'western-europe', attachToPlanKeys: ['spl/1'],
        },
        idempotencyKey: 'generated', response: { status: 201, body: { created: [] } },
      },
      {
        name: 'attachSeasonPerformances',
        run: (sdk) => sdk.seasons.attachSeasonPerformances('sea_a/b', {
          eventKeys: ['ev a/b'], attachToPlanKeys: ['spl/1'],
        }, { idempotencyKey: 'attach-1' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/performances/attach',
        body: { eventKeys: ['ev a/b'], attachToPlanKeys: ['spl/1'] }, idempotencyKey: 'attach-1',
      },
      {
        name: 'deleteSeasonPerformance',
        run: (sdk) => sdk.seasons.deleteSeasonPerformance('sea_a/b', 'ev a/b'),
        method: 'DELETE', path: '/v1/seasons/sea_a%2Fb/performances/ev%20a%2Fb', idempotencyKey: 'generated',
      },
      {
        name: 'updateSeasonPlan',
        run: (sdk) => sdk.seasons.updateSeasonPlan('sea_a/b', 'spl/1', {
          name: 'Gold', eventKeys: ['ev_1'],
        }, { idempotencyKey: 'plan-update-1' }),
        method: 'PATCH', path: '/v1/seasons/sea_a%2Fb/plans/spl%2F1',
        body: { name: 'Gold', eventKeys: ['ev_1'] }, idempotencyKey: 'plan-update-1',
      },
      {
        name: 'deleteSeasonPlan',
        run: (sdk) => sdk.seasons.deleteSeasonPlan('sea_a/b', 'spl/1'),
        method: 'DELETE', path: '/v1/seasons/sea_a%2Fb/plans/spl%2F1', idempotencyKey: 'generated',
        response: { status: 204 }, returns: undefined,
      },
      {
        name: 'publishSeason',
        run: (sdk) => sdk.seasons.publishSeason('sea_a/b', { idempotencyKey: 'publish-1' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/publish', idempotencyKey: 'publish-1',
      },
      {
        name: 'createSeasonCheckoutTest',
        run: (sdk) => sdk.seasons.createSeasonCheckoutTest('sea_a/b', { planKey: 'spl/1', quantity: 2 }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/checkout-tests',
        body: { planKey: 'spl/1', quantity: 2 }, idempotencyKey: 'generated',
      },
      {
        name: 'listSeasonCheckoutTests',
        run: (sdk) => sdk.seasons.listSeasonCheckoutTests('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/checkout-tests',
      },
      {
        name: 'replaceSeasonPackagePrices',
        run: (sdk) => sdk.seasons.replaceSeasonPackagePrices('sea_a/b', 'spl/1', {
          prices: [{ categoryKey: 'A', unitPrice: 12_000 }], currency: 'GBP',
        }, { idempotencyKey: 'prices-1' }),
        method: 'PUT', path: '/v1/seasons/sea_a%2Fb/plans/spl%2F1/prices',
        body: { prices: [{ categoryKey: 'A', unitPrice: 12_000 }], currency: 'GBP' }, idempotencyKey: 'prices-1',
      },
      {
        name: 'listSeasonPrices',
        run: (sdk) => sdk.seasons.listSeasonPrices('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/prices',
      },
      {
        name: 'attachSeasonPlanPerformance',
        run: (sdk) => sdk.seasons.attachSeasonPlanPerformance('sea_a/b', 'spl/1', { eventKey: 'ev a/b' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/plans/spl%2F1/performances',
        body: { eventKey: 'ev a/b' }, idempotencyKey: 'generated',
        response: { status: 202, body: { extended: 0, job: { jobId: 'sdj_1' } } },
      },
      {
        name: 'deleteSeasonPlanPerformance',
        run: (sdk) => sdk.seasons.deleteSeasonPlanPerformance('sea_a/b', 'spl/1', 'ev a/b'),
        method: 'DELETE', path: '/v1/seasons/sea_a%2Fb/plans/spl%2F1/performances/ev%20a%2Fb',
        idempotencyKey: 'generated',
      },
      {
        name: 'markSeasonPerformancePast',
        run: (sdk) => sdk.seasons.markSeasonPerformancePast('sea_a/b', 'ev a/b', { force: true }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/performances/ev%20a%2Fb/past',
        body: { force: true }, idempotencyKey: 'generated',
      },
      {
        name: 'returnSeasonOccurrenceInventory',
        run: (sdk) => sdk.seasons.returnSeasonOccurrenceInventory('sea_a/b', 'ev a/b', {
          actionId: 'sra_1', bookingRef: 'order_1', planActivationId: 'spa_1', labels: ['A-1'], source,
        }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/occurrences/ev%20a%2Fb/returns',
        body: { actionId: 'sra_1', bookingRef: 'order_1', planActivationId: 'spa_1', labels: ['A-1'], source },
      },
      {
        name: 'reclaimSeasonOccurrenceInventory',
        run: (sdk) => sdk.seasons.reclaimSeasonOccurrenceInventory('sea_a/b', 'ev a/b', {
          actionId: 'src_1', returnActionId: 'sra_1', bookingRef: 'order_1', planActivationId: 'spa_1',
          labels: ['A-1'], source: { renewalOfferId: 'sro_1' },
        }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/occurrences/ev%20a%2Fb/reclaims',
        body: {
          actionId: 'src_1', returnActionId: 'sra_1', bookingRef: 'order_1', planActivationId: 'spa_1',
          labels: ['A-1'], source: { renewalOfferId: 'sro_1' },
        },
      },
      {
        name: 'listSeasonHolders',
        run: (sdk) => sdk.seasons.listSeasonHolders('sea_a/b', {
          q: 'smith a/b', status: 'active', cursor: 'c/1', limit: 25,
        }),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/holders?q=smith+a%2Fb&status=active&cursor=c%2F1&limit=25',
      },
      {
        name: 'refundSeasonOrder',
        run: (sdk) => sdk.seasons.refundSeasonOrder('sea_a/b', 'ord_1/2', { amountMinor: 500 }, {
          idempotencyKey: 'refund-1',
        }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/orders/ord_1%2F2/refund',
        body: { amountMinor: 500 }, idempotencyKey: 'refund-1',
        response: { status: 202, body: { orderId: 'ord_1/2', state: 'pending' } },
      },
      {
        name: 'cancelSeasonOrder',
        run: (sdk) => sdk.seasons.cancelSeasonOrder('sea_a/b', 'ord_1/2', {
          reason: 'refunded_elsewhere', note: 'paid back', refundConfirmed: true,
        }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/orders/ord_1%2F2/cancel',
        body: { reason: 'refunded_elsewhere', note: 'paid back', refundConfirmed: true },
        idempotencyKey: 'generated',
      },
      {
        name: 'cancelSeasonOrderDate',
        run: (sdk) => sdk.seasons.cancelSeasonOrderDate('sea_a/b', 'ord_1/2', 'ev a/b', { actionId: 'sda_1' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/orders/ord_1%2F2/dates/ev%20a%2Fb/cancel',
        body: { actionId: 'sda_1' }, idempotencyKey: 'generated',
      },
      {
        name: 'resendSeasonOrderTickets',
        run: (sdk) => sdk.seasons.resendSeasonOrderTickets('sea_a/b', 'ord_1/2', { email: 'fan@example.com' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/orders/ord_1%2F2/resend', body: { email: 'fan@example.com' },
      },
      {
        name: 'retrieveSeasonHostedRenewals',
        run: (sdk) => sdk.seasons.retrieveSeasonHostedRenewals('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/renewal-hosted',
      },
      {
        name: 'rotateSeasonRenewalOfferLink',
        run: (sdk) => sdk.seasons.rotateSeasonRenewalOfferLink('sea_a/b', 'sro/1'),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/renewal-offers/sro%2F1/link',
        response: { status: 201, body: { url: 'https://renew.example/r/once' } },
        returns: { url: 'https://renew.example/r/once' },
      },
      {
        name: 'updateSeasonRenewalOfferContact',
        run: (sdk) => sdk.seasons.updateSeasonRenewalOfferContact('sea_a/b', 'sro/1', {
          email: 'fan@example.com', name: null,
        }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/renewal-offers/sro%2F1/contact',
        body: { email: 'fan@example.com', name: null },
      },
      {
        name: 'createSeasonRenewalNotices',
        run: (sdk) => sdk.seasons.createSeasonRenewalNotices('sea_a/b', { offerIds: ['sro/1'] }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/renewal-notices', body: { offerIds: ['sro/1'] },
      },
      {
        name: 'resendSeasonRenewalOffer',
        run: (sdk) => sdk.seasons.resendSeasonRenewalOffer('sea_a/b', 'sro/1'),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/renewal-offers/sro%2F1/resend',
        response: { status: 202, body: { ok: true } },
      },
      {
        name: 'retrieveSeasonSalesReport',
        run: (sdk) => sdk.seasons.retrieveSeasonSalesReport('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/reports/sales',
      },
      {
        name: 'retrieveSeasonSeatsReport',
        run: (sdk) => sdk.seasons.retrieveSeasonSeatsReport('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/reports/seats',
      },
      {
        name: 'exportSeasonHoldersCsv',
        run: (sdk) => sdk.seasons.exportSeasonHoldersCsv('sea_a/b', { q: 'a/b', status: 'renewal' }),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/reports/holders.csv?q=a%2Fb&status=renewal',
        response: { status: 200, rawBody: csvHolders, headers: { 'content-type': 'text/csv; charset=utf-8' } },
        returns: csvHolders,
      },
      {
        name: 'exportSeasonOrdersCsv',
        run: (sdk) => sdk.seasons.exportSeasonOrdersCsv('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/reports/orders.csv',
        response: { status: 200, rawBody: csvOrders, headers: { 'content-type': 'text/csv; charset=utf-8' } },
        returns: csvOrders,
      },
      {
        name: 'retrieveSeasonSeatCounts',
        run: (sdk) => sdk.seasons.retrieveSeasonSeatCounts('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/seat-counts',
      },
    ]);
  });

  it('maps the bulk refund of a cancelled date and the job reads', async () => {
    const job = {
      jobId: 'sbj_1', kind: 'bulk_refund', state: 'planning',
      counts: { total: 0, done: 0, skipped: 0, failed: 0 }, createdAt: 1, updatedAt: 1, completedAt: null,
    };
    await expectOperations([
      {
        name: 'refundSeasonPerformance',
        run: (sdk) => sdk.seasons.refundSeasonPerformance('sea_a/b', 'ev a/b', {
          amount: 'per_date', reason: 'Storm',
        }, { idempotencyKey: 'refund-date-1' }),
        method: 'POST', path: '/v1/seasons/sea_a%2Fb/performances/ev%20a%2Fb/refunds',
        body: { amount: 'per_date', reason: 'Storm' }, idempotencyKey: 'refund-date-1',
        response: { status: 202, body: { job } }, returns: { job },
      },
      {
        name: 'refundSeasonPerformance without a key',
        run: (sdk) => sdk.seasons.refundSeasonPerformance('sea_1', 'ev_1', { amount: 'full' }),
        method: 'POST', path: '/v1/seasons/sea_1/performances/ev_1/refunds',
        body: { amount: 'full' }, idempotencyKey: 'generated', response: { status: 202, body: { job } },
      },
      {
        name: 'listSeasonBulkJobs',
        run: (sdk) => sdk.seasons.listSeasonBulkJobs('sea_a/b'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/jobs',
        response: { status: 200, body: { jobs: [job] } }, returns: { jobs: [job] },
      },
      {
        name: 'retrieveSeasonBulkJob',
        run: (sdk) => sdk.seasons.retrieveSeasonBulkJob('sea_a/b', 'sbj/1'),
        method: 'GET', path: '/v1/seasons/sea_a%2Fb/jobs/sbj%2F1',
        response: { status: 200, body: { job: { ...job, failedItems: [] } } },
      },
    ]);
  });

  it('retries a bulk refund with one key', async () => {
    const stub = stubFetch([
      { status: 503, body: { error: 'unavailable' } },
      { status: 202, body: { job: { jobId: 'sbj_1' } } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 2 });
    await sdk.seasons.refundSeasonPerformance('sea_1', 'ev_1', { amount: 'full' });
    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(headers[0]!['Idempotency-Key']).toMatch(GENERATED_KEY);
    expect(headers[1]!['Idempotency-Key']).toBe(headers[0]!['Idempotency-Key']);
  });

  it('sends price types, season sale settings, holder contacts, and date cancels', async () => {
    await expectOperations([
      {
        name: 'replaceSeasonPackagePrices with a child price',
        run: (sdk) => sdk.seasons.replaceSeasonPackagePrices('sea_1', 'spl_1', {
          prices: [
            { categoryKey: 'stalls', unitPrice: 18_000 },
            { categoryKey: 'stalls', priceTypeKey: 'child', unitPrice: 9_000 },
          ],
        }, { idempotencyKey: 'prices-2' }),
        method: 'PUT', path: '/v1/seasons/sea_1/plans/spl_1/prices',
        body: { prices: [
          { categoryKey: 'stalls', unitPrice: 18_000 },
          { categoryKey: 'stalls', priceTypeKey: 'child', unitPrice: 9_000 },
        ] },
        idempotencyKey: 'prices-2',
      },
      {
        name: 'updateSeason with checkout mode and cutoffs',
        run: (sdk) => sdk.seasons.updateSeason('sea_1', {
          expectedRevision: 3, checkoutMode: 'seatlayer', transferCutoffHours: 24, returnCutoffHours: null,
        }, { idempotencyKey: 'sell-1' }),
        method: 'PATCH', path: '/v1/seasons/sea_1',
        body: { expectedRevision: 3, checkoutMode: 'seatlayer', transferCutoffHours: 24, returnCutoffHours: null },
        idempotencyKey: 'sell-1',
      },
      {
        name: 'createSeasonHolderImport with holder contacts',
        run: (sdk) => sdk.seasons.createSeasonHolderImport('sea_1', {
          successorPlanActivationId: 'spa_1',
          rows: [{
            rowId: 'r1', holderRef: 'h1', priorPlanActivationId: 'spa_0', priorContractRef: 'c1', labels: ['A-1'],
            holderEmail: 'ana@example.com', holderName: 'Ana Silva',
          }],
        }, { idempotencyKey: 'import-2' }),
        method: 'POST', path: '/v1/seasons/sea_1/imports',
        body: {
          successorPlanActivationId: 'spa_1',
          rows: [{
            rowId: 'r1', holderRef: 'h1', priorPlanActivationId: 'spa_0', priorContractRef: 'c1', labels: ['A-1'],
            holderEmail: 'ana@example.com', holderName: 'Ana Silva',
          }],
        },
        idempotencyKey: 'import-2', response: { status: 201, body: { import: { importId: 'sim_1' } } },
      },
      {
        name: 'createSeasonAmendment cancel with a refund',
        run: (sdk) => sdk.seasons.createSeasonAmendment('sea_1', {
          eventKey: 'ev_night_3', kind: 'cancel', refund: 'per_date', reason: 'Storm',
        }, { idempotencyKey: 'night-3-storm' }),
        method: 'POST', path: '/v1/seasons/sea_1/amendments',
        body: { eventKey: 'ev_night_3', kind: 'cancel', refund: 'per_date', reason: 'Storm' },
        idempotencyKey: 'night-3-storm',
        response: { status: 201, body: { amendment: { kind: 'cancel' }, refundJob: { jobId: 'sbj_1', kind: 'bulk_refund' } } },
      },
      {
        name: 'createSeasonAmendment postpone',
        run: (sdk) => sdk.seasons.createSeasonAmendment('sea_1', { eventKey: 'ev_1', kind: 'postpone' }),
        method: 'POST', path: '/v1/seasons/sea_1/amendments',
        body: { eventKey: 'ev_1', kind: 'postpone' }, idempotencyKey: 'generated',
        response: { status: 201, body: { amendment: { kind: 'postpone' } } },
      },
    ]);
  });

  it('types price types on prices, holds, and renewal seats, and the new amendment kinds', () => {
    expectTypeOf<SeasonPackagePrice['priceTypeKey']>().toEqualTypeOf<SeasonPriceTypeKey>();
    expectTypeOf<SeasonPackagePrice['priceTypeLabel']>().toEqualTypeOf<string>();
    expectTypeOf<SeasonPriceList['packages'][number]['prices'][number]>().toEqualTypeOf<SeasonPackagePrice>();
    expectTypeOf<SeasonHold['allocations'][number]['items'][number]['priceTypeKey']>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<SeasonRenewalOffer['seats']>[number]['priceTypeKey']>().toEqualTypeOf<string>();
    expectTypeOf<'performance_added'>().toMatchTypeOf<SeasonAmendment['kind']>();
    expectTypeOf<'performance_removed'>().toMatchTypeOf<SeasonAmendment['kind']>();
    expectTypeOf<'cancel'>().toMatchTypeOf<SeasonAmendment['kind']>();
    expectTypeOf<SeasonBulkJobDetail['failedItems'][number]['error']>().toEqualTypeOf<string | null>();
  });

  it('exposes exactly 83 season operations, plus the polling helpers and the import alias', () => {
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stubFetch([]).fetch });
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.seasons))
      .filter((name) => name !== 'constructor');
    const helpers = methods.filter((name) => name.startsWith('waitFor') || name === 'importSeasonHolders');
    expect(helpers.sort()).toEqual([
      'importSeasonHolders', 'waitForSeasonBooking', 'waitForSeasonLifecycle', 'waitForSeasonRenewal',
    ]);
    expect(methods.length - helpers.length).toBe(83);
  });

  it('types CSV exports as text and the 204 plan delete as void', () => {
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stubFetch([]).fetch });
    expectTypeOf(sdk.seasons.exportSeasonHoldersCsv).returns.resolves.toEqualTypeOf<string>();
    expectTypeOf(sdk.seasons.exportSeasonOrdersCsv).returns.resolves.toEqualTypeOf<string>();
    expectTypeOf(sdk.seasons.deleteSeasonPlan).returns.resolves.toEqualTypeOf<void>();
  });

  it('asks for CSV and still maps an export failure to the typed error', async () => {
    const stub = stubFetch([
      { status: 200, rawBody: 'a,b\n', headers: { 'content-type': 'text/csv' } },
      { status: 404, body: { error: 'not_found', message: 'No such Season.' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch });
    await expect(sdk.seasons.exportSeasonOrdersCsv('sea_1')).resolves.toBe('a,b\n');
    await expect(sdk.seasons.exportSeasonOrdersCsv('sea_missing')).rejects.toBeInstanceOf(SeatLayerError);
    expect((stub.calls[0]!.init.headers as Record<string, string>).Accept).toContain('text/csv');
  });

  it('sends no body when an optional season body is left out', async () => {
    await expectOperations([
      {
        name: 'createSeasonCheckoutTest without params',
        run: (sdk) => sdk.seasons.createSeasonCheckoutTest('sea_1'),
        method: 'POST', path: '/v1/seasons/sea_1/checkout-tests', idempotencyKey: 'generated',
      },
      {
        name: 'refundSeasonOrder in full',
        run: (sdk) => sdk.seasons.refundSeasonOrder('sea_1', 'ord_1'),
        method: 'POST', path: '/v1/seasons/sea_1/orders/ord_1/refund', idempotencyKey: 'generated',
      },
      {
        name: 'createSeasonRenewalNotices for every offer',
        run: (sdk) => sdk.seasons.createSeasonRenewalNotices('sea_1'),
        method: 'POST', path: '/v1/seasons/sea_1/renewal-notices',
      },
    ]);
  });

  it('retries a header-replay price PUT with one key, but never retries unsupported or one-time-secret calls', async () => {
    const stub = stubFetch([
      { status: 503, body: { error: 'unavailable' } },
      { status: 200, body: { planKey: 'spl_1', currency: 'GBP', prices: [] } },
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 200, body: { holders: [], nextCursor: null } },
      { status: 503, body: { error: 'unavailable' } },
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 503, body: { error: 'unavailable' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 2 });

    await sdk.seasons.replaceSeasonPackagePrices('sea_1', 'spl_1', { prices: [] });
    await sdk.seasons.createSeasonHolderImportFromSeason('sea_1', {
      sourceSeasonId: 'sea_0', successorPlanActivationId: 'spa_1',
    });
    await expect(sdk.seasons.resendSeasonOrderTickets('sea_1', 'ord_1')).rejects.toBeInstanceOf(SeatLayerError);
    await expect(sdk.seasons.rotateSeasonRenewalOfferLink('sea_1', 'sro_1'))
      .rejects.toBeInstanceOf(SeatLayerRateLimitError);
    await expect(sdk.seasons.returnSeasonOccurrenceInventory('sea_1', 'ev_1', {
      actionId: 'sra_1', bookingRef: 'order_1', planActivationId: 'spa_1', labels: ['A-1'],
      source: { bookingActionId: 'sba_1' },
    })).rejects.toBeInstanceOf(SeatLayerError);

    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(stub.calls.map((call) => call.init.method)).toEqual(['PUT', 'PUT', 'POST', 'POST', 'POST', 'POST', 'POST']);
    expect(headers[0]!['Idempotency-Key']).toMatch(GENERATED_KEY);
    expect(headers[1]!['Idempotency-Key']).toBe(headers[0]!['Idempotency-Key']);
    expect(headers[3]!['Idempotency-Key']).toBe(headers[2]!['Idempotency-Key']);
    for (const index of [4, 5, 6]) expect(headers[index]!['Idempotency-Key']).toBeUndefined();
    expect(stub.responses).toHaveLength(0);
  });
});
