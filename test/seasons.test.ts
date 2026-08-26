import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  SeatLayer,
  SeatLayerRateLimitError,
  type SeasonValidation,
} from '../src/index.js';

function stubFetch(responses: Array<{
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('stubFetch: more requests than queued responses');
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, responses };
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
      { status: 200, body: { hold: { operationId: 'sop/1', allocations: [] } } },
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
        },
      } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });

    await sdk.seasons.createSeasonBuyerAccessSession('sea_a/b', {
      allowedOrigin: 'https://tickets.example', includePublic: true, maxQuantity: 2,
    });
    await sdk.seasons.listSeasonBuyerAccessSessions('sea_a/b', { limit: 10 });
    await sdk.seasons.revokeSeasonBuyerAccessSession('sea_a/b', 'sbs/1');
    await sdk.seasons.retrieveSeasonHold('sea_a/b', 'sop/1');
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
    await sdk.seasons.validateSeasonBuyerRehearsal('sea_a/b', {
      holdOperationId: 'sop/1', bookActionId: 'sba_1', cancelActionId: 'sca_1', subscriptionId: 'wh_1',
    });

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

    await sdk.seasons.importSeasonHolders('sea_a/b', {
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
});
