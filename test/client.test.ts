import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  SeatLayer,
  SeatLayerAuthError,
  SeatLayerConflictError,
  SeatLayerError,
  SeatLayerRateLimitError,
  SeatLayerValidationError,
  type Chart,
  type ChartMeta,
  type ChannelAccessPreview,
  type ChannelArchiveResult,
  type ChannelReportEnvelope,
  type EventMeta,
  type EventDetail,
  type EventConfigurationBinding,
  type EventLogPage,
  type EventReportEnvelope,
  type TicketReleaseList,
  type BestAvailableHoldResult,
  type HoldInspection,
  type HoldResult,
  type InventoryBookingDetail,
  type InventoryBookingPage,
  type AccessLinkReveal,
  type AccessLinkRevokeResult,
} from '../src/index.js';

/** Build a fetch stub that replays a queue of responses and records requests. */
function stubFetch(responses: Array<{
  status: number;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('stubFetch: more requests than queued responses');
    return new Response(
      next.rawBody ?? (next.body === undefined ? null : JSON.stringify(next.body)),
      {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
      },
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function client(responses: Parameters<typeof stubFetch>[0], overrides = {}) {
  const stub = stubFetch(responses);
  const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, ...overrides });
  /** Nth recorded request, asserted present so tests read without `!` noise. */
  const call = (index: number) => {
    const entry = stub.calls[index];
    if (!entry) throw new Error(`No request recorded at index ${index}`);
    return {
      url: entry.url,
      method: entry.init.method,
      headers: entry.init.headers as Record<string, string>,
      body: entry.init.body as string,
      rawBody: entry.init.body,
    };
  };
  return { sdk, call, ...stub };
}

describe('construction', () => {
  it('rejects a publishable key with a message that names the mistake', () => {
    // The pk_/sk_ mix-up is the single most common first-run failure; a 401
    // three round-trips later teaches nothing.
    expect(() => new SeatLayer('pk_test_abc')).toThrow(/publishable key/i);
  });

  it('rejects anything that is not a secret key', () => {
    expect(() => new SeatLayer('nonsense')).toThrow(/sk_live_ or sk_test_/);
    expect(() => new SeatLayer('')).toThrow(/required/i);
  });

  it('reports the key mode so callers can guard against pointing at live data', () => {
    expect(new SeatLayer('sk_test_abc').mode).toBe('test');
    expect(new SeatLayer('sk_live_abc').mode).toBe('live');
  });
});

describe('requests', () => {
  it('returns the dependency-aware readiness contract without inventing an ok flag', async () => {
    const { sdk } = client([{ status: 200, body: {
      state: 'healthy',
      version: '2026.08.13',
      checkedAt: '2026-08-13T08:00:00.000Z',
      dependencies: [{ name: 'd1', state: 'healthy', latencyMs: 4 }],
    } }]);

    const readiness = await sdk.ready();
    expect(readiness.state).toBe('healthy');
    expect(readiness.dependencies[0]?.latencyMs).toBe(4);
    expect(readiness).not.toHaveProperty('ok');
  });

  it('sends bearer auth and parses the body', async () => {
    const { sdk, call } = client([{ status: 200, body: { meta: { key: 'ev_1' } } }]);
    const res = await sdk.events.retrieve('ev_1');

    expect(res.meta.key).toBe('ev_1');
    expect(call(0).headers.Authorization).toBe('Bearer sk_test_abc');
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev_1');
  });

  it('url-encodes path parameters', async () => {
    const { sdk, call } = client([{ status: 200, body: {} }]);
    await sdk.events.retrieve('ev/../admin');
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev%2F..%2Fadmin');
  });

  it('reads, binds and explicitly detaches an exact Event configuration version', async () => {
    const binding = {
      configuration: { id: 'ec_touring', version: 3 }, revision: 7,
      changedBy: 'api-key:key_1', changedAt: 123,
      audit: [{
        id: 'eca_1', from: null, to: { id: 'ec_touring', version: 3 },
        revision: 7, actor: 'api-key:key_1', createdAt: 123,
      }],
    };
    const { sdk, call } = client([
      { status: 200, body: binding },
      { status: 200, body: binding },
      { status: 200, body: { ...binding, configuration: null, revision: 8 } },
    ]);

    const retrieved = await sdk.events.retrieveConfigurationBinding('ev / main');
    expectTypeOf(retrieved).toEqualTypeOf<EventConfigurationBinding>();
    expect(retrieved.audit[0]?.to).toEqual({ id: 'ec_touring', version: 3 });
    await sdk.events.updateConfigurationBinding('ev / main', {
      expectedRevision: 6,
      configuration: { id: 'ec_touring', version: 3 },
    });
    await sdk.events.updateConfigurationBinding('ev / main', {
      expectedRevision: 7,
      configuration: null,
    });

    for (const index of [0, 1, 2]) {
      expect(call(index).url).toBe(
        'https://api.seatlayer.io/v1/events/ev%20%2F%20main/event-configuration',
      );
    }
    expect(call(0).method).toBe('GET');
    expect(JSON.parse(call(1).body)).toEqual({
      expectedRevision: 6,
      configuration: { id: 'ec_touring', version: 3 },
    });
    expect(JSON.parse(call(2).body)).toEqual({ expectedRevision: 7, configuration: null });
    expect(call(1).headers['Idempotency-Key']).toBeUndefined();
    expect(call(2).headers['Idempotency-Key']).toBeUndefined();
  });

  it('generates an Idempotency-Key only for header-replay mutations', async () => {
    const { sdk, call } = client([
      { status: 200, body: {} },
      { status: 201, body: {} },
      { status: 201, body: {} },
      { status: 201, body: {} },
      { status: 201, body: {} },
      { status: 201, body: {} },
      { status: 200, body: {} },
    ]);
    await sdk.events.list();
    await sdk.events.create({ chartId: 'c_1' });
    await sdk.charts.create({ name: 'Arena' });
    await sdk.charts.copy('c_1');
    await sdk.templates.instantiateTemplate('arena');
    await sdk.workspaces.create({ name: 'Promoter' });
    await sdk.inventory.hold('ev_1', { labels: ['A-1'] });

    expect(call(0).headers['Idempotency-Key']).toBeUndefined();
    for (const index of [1, 2, 3, 4, 5]) {
      expect(call(index).headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    }
    expect(call(6).headers['Idempotency-Key']).toBeUndefined();
  });

  it('honours a caller-supplied idempotency key', async () => {
    const { sdk, call } = client([{ status: 201, body: {} }]);
    await sdk.events.create({ chartId: 'c_1' }, { idempotencyKey: 'order-42' });
    expect(call(0).headers['Idempotency-Key']).toBe('order-42');
  });

  it('rejects an idempotency key the API would reject', async () => {
    const { sdk } = client([]);
    await expect(
      sdk.events.create({ chartId: 'c_1' }, { idempotencyKey: 'has spaces' }),
    ).rejects.toThrow(/Invalid Idempotency-Key/);
  });

  it('drops undefined query parameters instead of sending "undefined"', async () => {
    const { sdk, call } = client([{ status: 200, body: {} }]);
    await sdk.charts.list({ workspaceId: 'ws_1' });
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/charts?workspaceId=ws_1');
  });

  it('maps the full Performance Groups lifecycle to its secret-key server routes', async () => {
    const { sdk, call } = client([
      { status: 200, body: { performanceGroups: [], nextCursor: null } },
      { status: 201, body: { performanceGroup: {} } },
      { status: 200, body: { performanceGroup: {} } },
      { status: 204 },
      { status: 202, body: { performanceGroup: {}, lifecycleOperation: { operationId: 'pga_1', terminal: false } } },
      { status: 200, body: { performanceGroup: {}, lifecycleOperation: { operationId: 'pgc_1', terminal: true } } },
      { status: 200, body: { performanceGroup: {}, lifecycleOperation: { operationId: 'pga_1', terminal: false } } },
      { status: 201, body: { sessionId: 'pgbs_1', token: 'bsg_secret' } },
      { status: 200, body: { sessions: [] } },
      { status: 200, body: { ok: true, sessionId: 'pgbs_1' } },
      { status: 200, body: { hold: {} } },
      { status: 202, body: { booking: { state: 'book_pending' } } },
      { status: 200, body: { booking: { state: 'booked' } } },
    ]);
    const groupKey = 'pg_a/b';

    await sdk.performanceGroups.listPerformanceGroups({ workspaceId: 'ws_1', state: 'draft' });
    await sdk.performanceGroups.createPerformanceGroup(
      { name: 'Weekend run', eventKeys: ['ev_1', 'ev_2'] },
      { idempotencyKey: 'weekend-run-1' },
    );
    await sdk.performanceGroups.retrievePerformanceGroup(groupKey);
    await expect(sdk.performanceGroups.deletePerformanceGroup(groupKey)).resolves.toBeUndefined();
    await sdk.performanceGroups.activatePerformanceGroup(groupKey, 1);
    await sdk.performanceGroups.closePerformanceGroup(groupKey, 2);
    await sdk.performanceGroups.retrievePerformanceGroupLifecycle(groupKey, 'pga_1');
    await sdk.performanceGroups.createPerformanceGroupBuyerAccessSession(groupKey, {
      allowedOrigin: 'https://tickets.example.test', includePublic: true,
    });
    await sdk.performanceGroups.listPerformanceGroupBuyerAccessSessions(groupKey, { limit: 25 });
    await sdk.performanceGroups.revokePerformanceGroupBuyerAccessSession(groupKey, 'pgbs_1');
    await sdk.performanceGroups.retrievePerformanceGroupHold(groupKey, 'pgh_1');
    await sdk.performanceGroups.bookPerformanceGroupHold(groupKey, 'pgh_1', {
      bookActionId: 'book_1', bookingRef: 'order_1',
    });
    await sdk.performanceGroups.retrievePerformanceGroupBooking(groupKey, 'book_1');

    const base = 'https://api.seatlayer.io/v1/performance-groups/pg_a%2Fb';
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/performance-groups?workspaceId=ws_1&state=draft');
    expect(call(1).url).toBe('https://api.seatlayer.io/v1/performance-groups');
    expect(call(1).headers['Idempotency-Key']).toBe('weekend-run-1');
    expect(call(2).url).toBe(base);
    expect(call(3).method).toBe('DELETE');
    expect(call(4).url).toBe(`${base}/activate`);
    expect(call(5).url).toBe(`${base}/close`);
    expect(call(6).url).toBe(`${base}/lifecycle/pga_1`);
    expect(call(7).url).toBe(`${base}/buyer-access-sessions`);
    expect(call(7).headers['Idempotency-Key']).toBeUndefined();
    expect(call(8).url).toBe(`${base}/buyer-access-sessions?limit=25`);
    expect(call(9).url).toBe(`${base}/buyer-access-sessions/pgbs_1`);
    expect(call(10).url).toBe(`${base}/holds/pgh_1`);
    expect(call(11).url).toBe(`${base}/holds/pgh_1/book`);
    expect(call(11).headers['Idempotency-Key']).toBeUndefined();
    expect(call(12).url).toBe(`${base}/bookings/book_1`);
  });

  it('types the group hold fields a host decides to charge on', async () => {
    // The hold projection is what money is moved against, so `active` and
    // `expiresAt` have to be reachable without an `as` cast. They arrived only
    // through the index signature until 0.5.1: a committed hold whose expiry has
    // elapsed is NOT bookable, and `state` alone does not say so.
    const { sdk } = client([{
      status: 200,
      body: {
        hold: {
          operationId: 'pgh_1',
          groupId: 'pg_1',
          holdId: 'pghold_1',
          state: 'committed',
          decision: 'commit',
          active: true,
          expiresAt: 1_900_000_000_000,
          createdAt: 1_800_000_000_000,
          convergedAt: 1_800_000_000_500,
          expiredAt: null,
          buyerSessionId: 'pgbs_1',
          selectionMode: 'same_seat',
          buyerRef: 'buyer-9',
          partnerRef: null,
          currency: 'GBP',
          groupRevision: 2,
          allocations: [],
        },
      },
    }]);

    const { hold } = await sdk.performanceGroups.retrievePerformanceGroupHold('pg_1', 'pgh_1');
    expectTypeOf(hold.active).toEqualTypeOf<boolean>();
    expectTypeOf(hold.expiresAt).toEqualTypeOf<number | null>();
    expectTypeOf(hold.decision).toEqualTypeOf<'commit' | 'abort' | null>();
    expectTypeOf(hold.selectionMode).toEqualTypeOf<'same_seat' | 'per_performance'>();
    expectTypeOf(hold.buyerSessionId).toEqualTypeOf<string | null>();
    expect(hold.active).toBe(true);
    expect(hold.holdId).toBe('pghold_1');
    expect(hold.decision).toBe('commit');
    expect(hold.expiresAt).toBe(1_900_000_000_000);
  });
});

describe('errors', () => {
  it('projects status, stable code, full body, and request id from one error response', async () => {
    const body = {
      error: 'validation_failed',
      code: 'invalid_section_state',
      message: 'Balcony is not a valid section state.',
      field: 'sectionStates.balcony',
      detail: { allowed: ['open', 'closed', 'hidden'] },
    };
    const { sdk } = client([{
      status: 422,
      body,
      headers: { 'x-request-id': 'req_contract_7' },
    }]);

    const error = await sdk.events.update('ev_1', { name: '' }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SeatLayerValidationError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('invalid_section_state');
    expect(error.body).toEqual(body);
    expect(error.requestId).toBe('req_contract_7');
  });

  it('maps 403 mode_mismatch to a typed, self-explaining error', async () => {
    const { sdk } = client([{ status: 403, body: { error: 'mode_mismatch' } }]);
    const error = await sdk.events.retrieve('ev_1').catch((e) => e);

    expect(error).toBeInstanceOf(SeatLayerAuthError);
    expect(error.isModeMismatch).toBe(true);
  });

  it('exposes conflicts on a 409 so callers can branch per seat', async () => {
    const { sdk } = client([{
      status: 409,
      body: { error: 'conflict', conflicts: [{ label: 'A-1', status: 'booked' }] },
    }]);
    const error = await sdk.inventory.hold('ev_1', { labels: ['A-1'] }).catch((e) => e);

    expect(error).toBeInstanceOf(SeatLayerConflictError);
    expect(error.conflicts).toEqual([{ label: 'A-1', status: 'booked' }]);
  });

  it('flags a sold-out best-available result as a business outcome', async () => {
    const { sdk } = client([{ status: 409, body: { error: 'conflict', reason: 'sold_out' } }]);
    const error = await sdk.inventory.holdBestAvailable('ev_1', { qty: 4 }).catch((e) => e);
    expect(error.isSoldOut).toBe(true);
  });

  it('surfaces the request id for support', async () => {
    const { sdk } = client([{
      status: 500,
      body: { error: 'internal' },
      headers: { 'x-request-id': 'req_9' },
    }], { maxRetries: 1 });
    const error = await sdk.events.retrieve('ev_1').catch((e) => e);
    expect(error.requestId).toBe('req_9');
  });

  it('maps a non-JSON failure to the base typed error instead of leaking a parser error', async () => {
    const { sdk, calls } = client([{
      status: 502,
      rawBody: '<html>upstream unavailable</html>',
      headers: { 'content-type': 'text/html', 'x-request-id': 'req_proxy_2' },
    }]);

    const error = await sdk.events.update('ev_1', { venue: null }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SeatLayerError);
    expect(error.name).toBe('SeatLayerError');
    expect(error.status).toBe(502);
    expect(error.code).toBe('unknown_error');
    expect(error.body).toEqual({});
    expect(error.requestId).toBe('req_proxy_2');
    expect(calls).toHaveLength(1);
  });
});

describe('retry', () => {
  it('retries a 429 and reuses the same idempotency key', async () => {
    const { sdk, calls, call } = client([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 201, body: { ok: true } },
    ]);

    await sdk.events.create({ chartId: 'c_1' });

    expect(calls).toHaveLength(2);
    // Same key on the retry, or the server would create two events.
    expect(call(0).headers['Idempotency-Key'])
      .toBe(call(1).headers['Idempotency-Key']);
  });

  it('keeps direct and box-office booking single-attempt even with a supplied key', async () => {
    const { sdk, calls, call } = client([
      { status: 500, body: { error: 'internal' } },
      { status: 500, body: { error: 'internal' } },
    ]);

    await sdk.inventory.book(
      'ev_1',
      { labels: ['A-1'], bookingRef: 'order-1' },
      { idempotencyKey: 'manual-book-1' },
    ).catch(() => {});
    await sdk.inventory.boxOfficeBook(
      'ev_1',
      { labels: ['A-2'], bookingRef: 'order-2' },
      { idempotencyKey: 'manual-box-1' },
    ).catch(() => {});

    expect(calls).toHaveLength(2);
    expect(call(0).headers['Idempotency-Key']).toBe('manual-book-1');
    expect(call(1).headers['Idempotency-Key']).toBe('manual-box-1');
  });

  it('keeps raw mutations single-attempt because their replay contract is unknown', async () => {
    const { sdk, calls } = client([{ status: 500, body: { error: 'internal' } }]);

    await sdk.request('POST', '/v1/future-mutation', {
      body: { value: 1 },
      idempotencyKey: 'manual-raw-1',
    }).catch(() => {});

    expect(calls).toHaveLength(1);
  });

  it('retains transient retries for reads', async () => {
    const { sdk, calls } = client([
      { status: 503, body: { error: 'unavailable' } },
      { status: 200, body: { events: [] } },
    ]);

    await sdk.events.list();
    expect(calls).toHaveLength(2);
  });

  it('does not retry a 4xx that will never succeed', async () => {
    const { sdk, calls } = client([{ status: 422, body: { error: 'invalid_slug' } }]);
    await sdk.events.create({ chartId: 'c_1' }).catch(() => {});
    expect(calls).toHaveLength(1);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const { sdk, calls } = client([
      { status: 429, body: {}, headers: { 'retry-after': '0' } },
      { status: 429, body: {}, headers: { 'retry-after': '0' } },
    ], { maxRetries: 2 });

    const error = await sdk.events.create({ chartId: 'c_1' }).catch((e) => e);
    expect(error).toBeInstanceOf(SeatLayerRateLimitError);
    expect(calls).toHaveLength(2);
  });

  it('keeps an unsafe 429 single-attempt, typed, and prefers Retry-After', async () => {
    const { sdk, calls } = client([{
      status: 429,
      body: { error: 'rate_limited', retryAfterSeconds: 99 },
      headers: { 'retry-after': '7', 'x-request-id': 'req_limit_1' },
    }]);

    const error = await sdk.events.update('ev_1', { name: 'New name' }).catch((e) => e);

    expect(error).toBeInstanceOf(SeatLayerRateLimitError);
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfterSeconds).toBe(7);
    expect(error.requestId).toBe('req_limit_1');
    expect(calls).toHaveLength(1);
  });
});

describe('sessions', () => {
  it('rejects an explicit empty capability set before making a request', async () => {
    const { sdk } = client([]);
    await expect(
      sdk.sessions.createManageSession('ev_1', {
        allowedOrigin: 'https://box-office.example',
        capabilities: [],
      }),
    ).rejects.toThrow(/capabilities is required/);
  });

  it('requires capabilities at the type level despite the raw API view-only default', () => {
    const { sdk } = client([]);
    if (false) {
      // @ts-expect-error SDK call sites must state browser authority explicitly.
      void sdk.sessions.createManageSession('ev_1', { allowedOrigin: 'https://viewer.example' });
    }
  });

  it('mints with expanded least-privilege capabilities it was given', async () => {
    const { sdk, call } = client([{ status: 201, body: {
      id: 'msess_2', token: 'mse_x', expiresAt: 1, eventKey: 'ev_1',
      allowedOrigin: 'https://box-office.example',
      capabilities: ['event:view', 'event:channels:view', 'event:boxoffice'],
    } }]);
    await sdk.sessions.createManageSession('ev_1', {
      allowedOrigin: 'https://box-office.example',
      capabilities: ['event:view', 'event:channels:view', 'event:boxoffice'],
    });
    expect(JSON.parse(call(0).body).capabilities).toEqual([
      'event:view', 'event:channels:view', 'event:boxoffice',
    ]);
  });

  it('returns designer session credentials inside the runtime session envelope', async () => {
    const session = {
      id: 'dsess_1', token: 'dse_once', workspaceId: 'ws_1', chartId: 'c_1',
      allowedOrigin: 'https://designer.example', authority: 'edit', canEdit: true,
      canPublish: false, mode: 'safe',
      safeModeOptions: { allowDeletingObjects: false, allowEditingAreaCapacity: false },
      featurePolicy: {}, expiresAt: 10, designerUrl: 'https://app.seatlayer.io/embed/designer#token=dse_once',
    };
    const { sdk, call } = client([{ status: 201, body: { session } }]);

    const created = await sdk.sessions.createDesignerSession({
      workspaceId: 'ws_1', chartId: 'c_1', allowedOrigin: 'https://designer.example',
      authority: 'edit', mode: 'safe', safeModeOptions: { allowDeletingObjects: false },
    });

    expect(created.session.token).toBe('dse_once');
    expect(JSON.parse(call(0).body)).toMatchObject({ mode: 'safe', authority: 'edit' });
  });
});

describe('sales channels', () => {
  it('mints an explicitly scoped buyer session through the typed server surface', async () => {
    const { sdk, call } = client([{ status: 201, body: {
      sessionId: 'bas_1', token: 'bse_secret', expiresAt: 1, eventKey: 'ev_1', includePublic: false, maxQuantity: 4,
    } }]);

    await sdk.channels.createBuyerAccessSession('ev_1', {
      channelIds: ['chn_agency'],
      includePublic: false,
      allowedOrigin: 'https://agency.example',
      buyerRef: 'buyer_1',
      clientRequestId: 'access_1',
    });

    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev_1/buyer-access-sessions');
    expect(JSON.parse(call(0).body)).toMatchObject({
      channelIds: ['chn_agency'], includePublic: false, allowedOrigin: 'https://agency.example',
    });
    expect(call(0).headers.Authorization).toBe('Bearer sk_test_abc');
  });

  it('keeps allocation writes versioned and one-time hosted links explicit', async () => {
    const { sdk, call } = client([
      { status: 200, body: { ok: true } },
      { status: 201, body: { link: { id: 'alk_1' }, url: 'https://app.seatlayer.io/a#alc_once', capability: 'alc_once', revealedOnce: true } },
    ]);

    await sdk.channels.updateChannelAssignments('ev_1', {
      targetChannelId: 'chn_agency', labels: ['A-1'], assignmentVersion: 7,
    });
    await sdk.channels.createAccessLink('ev_1', 'chn_agency', {
      label: null,
      includePublic: false,
      reason: 'Partner launch',
    });

    expect(JSON.parse(call(0).body)).toMatchObject({ targetChannelId: 'chn_agency', assignmentVersion: 7 });
    expect(call(1).url).toBe('https://api.seatlayer.io/v1/events/ev_1/channels/chn_agency/access-links');
    expect(JSON.parse(call(1).body)).toMatchObject({ label: null, reason: 'Partner launch' });
  });

  it('sends the explicit acknowledgement when switching a live channel intent', async () => {
    const { sdk, call } = client([{ status: 200, body: {
      ok: true, channel: { id: 'chn_agency', name: 'Agency', state: 'active' },
      intentSwitch: { closedLinks: 1, keptSessions: 2 },
    } }]);

    const result = await sdk.channels.updateChannel('ev_1', 'chn_agency', {
      accessIntent: 'server',
      acknowledgeLiveAccess: true,
      reason: 'Move sales into our authenticated app',
    });

    expect(JSON.parse(call(0).body)).toEqual({
      accessIntent: 'server',
      acknowledgeLiveAccess: true,
      reason: 'Move sales into our authenticated app',
    });
    expect(result.intentSwitch).toEqual({ closedLinks: 1, keptSessions: 2 });
  });

  it('wraps channel reporting, preview, archive, and access-link lifecycle results', async () => {
    const link = { id: 'alk_1', state: 'active', status: 'active' };
    const channel = { id: 'chn_1', name: 'Agency', state: 'archived' };
    const { sdk, call } = client([
      { status: 200, body: { report: { rows: [], totals: {} }, event: { key: 'ev_1' } } },
      { status: 200, body: {
        ok: true,
        audience: { channelIds: ['chn_1'], includePublic: false },
        available: false,
        unavailable: [{ channelId: 'chn_1', state: 'paused' }],
        assignmentVersion: 4,
      } },
      { status: 200, body: {
        ok: true, channel, assignmentVersion: 5,
        moved: { free: 3, blocked: 1, booked: 0, units: 4 }, revokedSessions: 2,
      } },
      { status: 201, body: {
        link, url: 'https://app.seatlayer.io/a#next', capability: 'next',
        revealedOnce: true, previous: { ...link, state: 'rotated' }, endedSessions: 1,
      } },
      { status: 200, body: { ok: true, link: { ...link, state: 'revoked' }, endedSessions: 2 } },
    ]);

    const report = await sdk.channels.retrieveChannelReport('ev/1');
    const preview = await sdk.channels.retrieveChannelAccessPreview('ev/1', {
      channelIds: ['chn_1'], includePublic: false,
    });
    const archived = await sdk.channels.archiveChannel('ev/1', 'chn/1', { destination: null });
    const rotated = await sdk.channels.rotateAccessLink('ev/1', 'chn/1', 'link/1', {
      endActiveSessions: true,
    });
    const revoked = await sdk.channels.revokeAccessLink('ev/1', 'chn/1', 'link/1', {
      endActiveSessions: true, reason: 'Compromised URL',
    });

    expectTypeOf(report).toEqualTypeOf<ChannelReportEnvelope>();
    expectTypeOf(preview).toEqualTypeOf<ChannelAccessPreview>();
    expectTypeOf(archived).toEqualTypeOf<ChannelArchiveResult>();
    expectTypeOf(rotated).toEqualTypeOf<AccessLinkReveal>();
    expectTypeOf(revoked).toEqualTypeOf<AccessLinkRevokeResult>();
    if (!preview.available) expect(preview.unavailable[0]?.state).toBe('paused');
    expect(archived.moved.units).toBe(4);
    expect(rotated.capability).toBe('next');
    expect(revoked.endedSessions).toBe(2);
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev%2F1/channels/report');
    expect(call(1).url).toBe(
      'https://api.seatlayer.io/v1/events/ev%2F1/channels/preview?channelIds=chn_1',
    );
    expect(call(2).url).toBe(
      'https://api.seatlayer.io/v1/events/ev%2F1/channels/chn%2F1/archive',
    );
    expect(call(4).url).toBe(
      'https://api.seatlayer.io/v1/events/ev%2F1/channels/chn%2F1/access-links/link%2F1?endActiveSessions=1&reason=Compromised+URL',
    );
  });
});

describe('platform inventory contract', () => {
  it('whitelists hold input so wider caller objects cannot transmit commerce data', async () => {
    const { sdk, call } = client([{
      status: 201,
      body: { ok: true, holdId: 'h_1', expiresAt: 123, items: [] },
    }]);
    const callerObject = {
      labels: ['A-1'],
      buyerEmail: 'not-sent@example.com',
      paymentId: 'pay_not_sent',
      ticketDelivery: 'email',
      refundRequested: true,
    };

    await sdk.inventory.hold('ev_1', callerObject);

    expect(JSON.parse(call(0).body)).toEqual({ labels: ['A-1'] });
  });

  it('requires and preserves the caller-owned bookingRef without commerce fields', async () => {
    const { sdk, call } = client([{ status: 200, body: { ok: true, booked: ['A-1'] } }]);
    // Structural TypeScript inputs can carry extra properties through a wider
    // variable. The SDK must whitelist its wire body rather than rely only on
    // excess-property checks to keep commerce/PII out of the request.
    const callerObject = {
      labels: ['A-1'],
      bookingRef: '  marketplace-order-42  ',
      buyerEmail: 'not-sent@example.com',
      paymentId: 'pay_not_sent',
      ticketDelivery: 'email',
      refundRequested: true,
    };

    const result = await sdk.inventory.book('ev_1', callerObject);

    expect(result).toEqual({ ok: true, booked: ['A-1'], bookingRef: 'marketplace-order-42' });
    expect(JSON.parse(call(0).body)).toEqual({
      labels: ['A-1'],
      bookingRef: 'marketplace-order-42',
    });
    expect(call(0).body).not.toMatch(/buyer|orderId|payment|ticket|email|refund/i);
  });

  it('cancels inventory against the same stable reference', async () => {
    const { sdk, call } = client([{ status: 200, body: { ok: true, unbooked: ['A-1'] } }]);

    const result = await sdk.inventory.unbook('ev_1', {
      labels: ['A-1'],
      bookingRef: 'marketplace-order-42',
    });

    expect(result.bookingRef).toBe('marketplace-order-42');
    expect(JSON.parse(call(0).body)).toEqual({
      labels: ['A-1'],
      bookingRef: 'marketplace-order-42',
    });
  });

  it('rejects a blank bookingRef before making a request', async () => {
    const { sdk, calls } = client([]);
    await expect(sdk.inventory.book('ev_1', {
      labels: ['A-1'],
      bookingRef: '   ',
    })).rejects.toThrow(/bookingRef is required/);
    expect(calls).toHaveLength(0);
  });

  it('lists and retrieves inventory Booking History without using Orders routes', async () => {
    const { sdk, call } = client([
      { status: 200, body: { bookings: [], nextCursor: null } },
      {
        status: 200,
        body: {
          booking: { bookingRef: 'marketplace/order 42', objects: [] },
          activity: [],
          activityTruncated: false,
        },
      },
    ]);

    await sdk.inventory.listBookings('ev_1', {
      q: 'A-1', state: 'booked', cursor: 'next', limit: 25,
    });
    const detail = await sdk.inventory.retrieveBooking('ev_1', 'marketplace/order 42');

    expect(call(0).url).toBe(
      'https://api.seatlayer.io/v1/events/ev_1/bookings?q=A-1&state=booked&cursor=next&limit=25',
    );
    expect(call(1).url).toBe(
      'https://api.seatlayer.io/v1/events/ev_1/bookings/marketplace%2Forder%2042',
    );
    expect(detail.booking.bookingRef).toBe('marketplace/order 42');
  });
});

describe('sales channels', () => {
  it('mints an explicitly scoped buyer session through the server surface', async () => {
    const { sdk, call } = client([{ status: 201, body: {
      sessionId: 'bas_1', token: 'bse_secret', expiresAt: 1, eventKey: 'ev_1',
      includePublic: false, maxQuantity: 4,
    } }]);

    await sdk.channels.createBuyerAccessSession('ev_1', {
      channelIds: ['chn_agency'],
      includePublic: false,
      allowedOrigin: 'https://agency.example',
      buyerRef: 'buyer_1',
      clientRequestId: 'access_1',
    });

    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev_1/buyer-access-sessions');
    expect(JSON.parse(call(0).body)).toMatchObject({
      channelIds: ['chn_agency'], includePublic: false, allowedOrigin: 'https://agency.example',
    });
    expect(call(0).headers.Authorization).toBe('Bearer sk_test_abc');
  });

  it('keeps allocation writes versioned and exposes canonical booked value', async () => {
    const { sdk, call } = client([
      { status: 200, body: { ok: true } },
      {
        status: 200,
        body: {
          report: {
            assignmentVersion: 7,
            includesBookedValue: true,
            includesRevenue: true,
            rows: [],
            totals: { bookedValue: 125, revenue: 125 },
          },
          event: { key: 'ev_1' },
        },
      },
    ]);

    await sdk.channels.updateChannelAssignments('ev_1', {
      targetChannelId: 'chn_agency', labels: ['A-1'], assignmentVersion: 7,
    });
    const report = await sdk.channels.retrieveChannelReport('ev_1');

    expect(JSON.parse(call(0).body)).toMatchObject({
      targetChannelId: 'chn_agency', assignmentVersion: 7,
    });
    expect(call(1).url).toBe('https://api.seatlayer.io/v1/events/ev_1/channels/report');
    expect(report.report.includesBookedValue).toBe(true);
    expect(report.report.includesRevenue).toBe(true);
    expect(report.report.totals.bookedValue).toBe(125);
  });

});

describe('charts', () => {
  it('requires expectedUpdatedAt on update, at the type level and on the wire', async () => {
    const { sdk, call } = client([{ status: 200, body: { meta: {} } }]);
    await sdk.charts.update('c_1', { doc: { version: 1 }, expectedUpdatedAt: 1234 });
    expect(JSON.parse(call(0).body).expectedUpdatedAt).toBe(1234);
  });

  it('sends optional copy overrides while retaining the inline idempotency option', async () => {
    const { sdk, call } = client([{ status: 201, body: { meta: { id: 'c_copy' } } }]);

    const result = await sdk.charts.copy('c_source', {
      name: 'Promoter Arena',
      externalRef: null,
      workspaceId: 'ws_promoter',
      idempotencyKey: 'copy-promoter-arena',
    });

    expect(result.meta.id).toBe('c_copy');
    expect(JSON.parse(call(0).body)).toEqual({
      name: 'Promoter Arena',
      externalRef: null,
      workspaceId: 'ws_promoter',
    });
    expect(call(0).headers['Idempotency-Key']).toBe('copy-promoter-arena');
  });
});

describe('templates and ticket releases', () => {
  it('instantiates a template with an object body, encoded id, and caller replay key', async () => {
    const { sdk, call } = client([{ status: 201, body: { meta: { id: 'c_draft' } } }]);

    const result = await sdk.templates.instantiateTemplate('arena/2026', {}, {
      idempotencyKey: 'template-arena-2026',
    });

    expect(result.meta.id).toBe('c_draft');
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/templates/arena%2F2026/instantiate');
    expect(call(0).method).toBe('POST');
    expect(call(0).headers['Idempotency-Key']).toBe('template-arena-2026');
    expect(JSON.parse(call(0).body)).toEqual({});
  });

  it('lists, replaces, and closes ticket releases with distinct input and live response types', async () => {
    const { sdk, call } = client([
      { status: 200, body: { releases: [{
        id: 'rel_0123456789ab', position: 1, name: 'Early', categoryKey: null,
        price: 2500, previousPrice: null, quota: 10, startsAt: null, endsAt: null,
        action: 'buy', actionUrl: null, soldOutAt: null, consumed: 2, remaining: 8,
      }] } },
      { status: 200, body: { releases: [] } },
      { status: 200, body: { releases: [] } },
    ]);

    const listed = await sdk.events.listTicketReleases('ev/1');
    await sdk.events.updateTicketReleases('ev/1', [{ name: 'Early', price: 2500, quota: 10 }]);
    await sdk.events.closeTicketRelease('ev/1', 'rel/0123456789ab');

    expectTypeOf(listed).toEqualTypeOf<TicketReleaseList>();
    expect(listed.releases[0]).toMatchObject({ consumed: 2, remaining: 8 });
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev%2F1/releases');
    expect(call(1).method).toBe('PUT');
    expect(JSON.parse(call(1).body)).toEqual({
      releases: [{ name: 'Early', price: 2500, quota: 10 }],
    });
    expect(call(2).url).toBe(
      'https://api.seatlayer.io/v1/events/ev%2F1/releases/rel%2F0123456789ab/close',
    );
  });

  it('replays template instantiation but keeps release mutations single-attempt', async () => {
    const replay = client([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 201, body: { meta: { id: 'c_draft' } } },
    ]);
    await replay.sdk.templates.instantiateTemplate('arena');
    expect(replay.calls).toHaveLength(2);
    expect(replay.call(0).headers['Idempotency-Key']).toBe(replay.call(1).headers['Idempotency-Key']);

    const update = client([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
    ]);
    await expect(update.sdk.events.updateTicketReleases('ev_1', [])).rejects.toBeInstanceOf(
      SeatLayerRateLimitError,
    );
    expect(update.calls).toHaveLength(1);

    const close = client([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
    ]);
    await expect(close.sdk.events.closeTicketRelease('ev_1', 'rel_0123456789ab')).rejects.toBeInstanceOf(
      SeatLayerRateLimitError,
    );
    expect(close.calls).toHaveLength(1);
  });
});

describe('inventory booking references', () => {
  it('requires bookingRef in both booking and cancellation types', () => {
    const { sdk } = client([]);
    if (false) {
      // @ts-expect-error The API refuses a booking that cannot be reconciled to an order.
      void sdk.inventory.book('ev_1', { labels: ['A-1'] });
      // @ts-expect-error Cancellation must target the original booking reference.
      void sdk.inventory.unbook('ev_1', { labels: ['A-1'] });
    }
  });

  it('rejects blank booking references before making a request', async () => {
    const { sdk, calls } = client([]);

    await expect(sdk.inventory.book('ev_1', {
      labels: ['A-1'],
      bookingRef: '   ',
    })).rejects.toThrow(/bookingRef is required/);
    await expect(sdk.inventory.unbook('ev_1', {
      labels: ['A-1'],
      bookingRef: '',
    })).rejects.toThrow(/bookingRef is required/);
    await expect(sdk.inventory.boxOfficeBook('ev_1', {
      labels: ['A-1'],
      bookingRef: '\t',
    })).rejects.toThrow(/bookingRef is required/);

    expect(calls).toHaveLength(0);
  });

  it('keeps selected-label and best-available hold response types distinct', async () => {
    const { sdk } = client([
      { status: 201, body: { ok: true, holdId: 'h_1', expiresAt: 1, items: [] } },
      { status: 200, body: {
        ok: true, holdId: 'h_2', expiresAt: 2, labels: ['A-1'], items: [],
      } },
    ]);

    const selected = await sdk.inventory.hold('ev_1', { labels: ['A-1'] });
    const picked = await sdk.inventory.holdBestAvailable('ev_1', { qty: 1 });

    expectTypeOf(selected).toEqualTypeOf<HoldResult>();
    expectTypeOf(picked).toEqualTypeOf<BestAvailableHoldResult>();
    expect(picked.labels).toEqual(['A-1']);
  });

  it('pages and retrieves booking history using the exact report routes', async () => {
    const booking = { bookingRef: 'order/42', state: 'booked', objects: [] };
    const { sdk, call } = client([
      { status: 200, body: { bookings: [booking], nextCursor: 'cur_2' } },
      { status: 200, body: { booking, activity: [], activityTruncated: false } },
    ]);

    const page = await sdk.inventory.listBookings('ev/1', {
      q: 'A 1', state: 'booked', limit: 25, cursor: 'cur_1',
    });
    const detail = await sdk.inventory.retrieveBooking('ev/1', 'order/42');

    expectTypeOf(page).toEqualTypeOf<InventoryBookingPage>();
    expectTypeOf(detail).toEqualTypeOf<InventoryBookingDetail>();
    expect(call(0).url).toBe(
      'https://api.seatlayer.io/v1/events/ev%2F1/bookings?q=A+1&state=booked&limit=25&cursor=cur_1',
    );
    expect(call(1).url).toBe(
      'https://api.seatlayer.io/v1/events/ev%2F1/bookings/order%2F42',
    );
  });

  it('sends bookingRef for bookings and cancellation', async () => {
    const { sdk, call } = client([
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true, unbooked: ['A-1'] } },
    ]);

    await sdk.inventory.book('ev_1', { labels: ['A-1'], bookingRef: 'order-42' });
    await sdk.inventory.unbook('ev_1', { labels: ['A-1'], bookingRef: 'order-42' });

    expect(JSON.parse(call(0).body).bookingRef).toBe('order-42');
    expect(JSON.parse(call(1).body)).toEqual({ labels: ['A-1'], bookingRef: 'order-42' });
  });

  it('sends trusted channel authority only on supported inventory operations', async () => {
    const { sdk, call } = client([
      { status: 201, body: { ok: true, holdId: 'h_1', expiresAt: 1, items: [] } },
      { status: 200, body: { ok: true, holdId: 'h_1', expiresAt: 2, extends: 1 } },
      { status: 200, body: { ok: true, holdId: 'h_2', expiresAt: 2, labels: ['A-1'], items: [] } },
      { status: 200, body: { ok: true, labels: ['A-2'], items: [], bookingRef: 'order-2' } },
      { status: 200, body: { ok: true, booked: ['A-3'] } },
    ]);
    const access = {
      channelIds: ['chn_partner'],
      ignoreChannelRestrictions: true,
      reason: 'Partner support override',
    };

    await sdk.inventory.hold('ev_1', { labels: ['A-1'], ...access });
    await sdk.inventory.extendHold('ev_1', { holdId: 'h_1', ...access });
    await sdk.inventory.holdBestAvailable('ev_1', { qty: 1, ...access });
    await sdk.inventory.bookBestAvailable('ev_1', { qty: 1, bookingRef: 'order-2', ...access });
    await sdk.inventory.book('ev_1', { labels: ['A-3'], bookingRef: 'order-3', ...access });

    for (let index = 0; index < 5; index++) {
      expect(JSON.parse(call(index).body)).toMatchObject(access);
    }
  });

  it('returns the complete hold inspection and sends scheduled block release', async () => {
    const held = {
      holdId: 'h_1', status: 'active', expiresAt: 10, bookingRef: null,
      eventKey: 'ev_1', mode: 'test', externalRef: null, workspaceId: 'ws_1',
      items: [{
        label: 'A-1', objectId: 'seat_1', objectType: 'seat', categoryKey: 'standard',
        tierId: null, unitPrice: 25, currency: 'USD', channelId: 'chn_partner',
        accessSource: 'partner', releaseId: null,
      }],
      accessSessionId: 'bas_1', accessSource: 'partner', buyerRef: 'buyer_1', partnerRef: 'agency_1',
    };
    const { sdk, call } = client([
      { status: 200, body: held },
      { status: 200, body: { ok: true, blocked: ['A-1'] } },
    ]);

    const inspected = await sdk.inventory.retrieveHold('ev_1', 'h_1');
    expectTypeOf(inspected).toEqualTypeOf<HoldInspection>();
    expect(inspected).toMatchObject({
      holdId: 'h_1', status: 'active', bookingRef: null,
      accessSource: 'partner', items: [{ channelId: 'chn_partner', currency: 'USD' }],
    });

    await sdk.inventory.block('ev_1', { labels: ['A-1'], releaseAt: 2_000_000_000_000 });
    expect(JSON.parse(call(1).body)).toEqual({ labels: ['A-1'], releaseAt: 2_000_000_000_000 });
  });

  it('requires an explicit, mode-correct availability rule map', async () => {
    const { sdk, call } = client([{ status: 200, body: {
      ok: true,
      hidden: ['balcony'],
      rules: { balcony: { mode: 'timed', revealAt: 2_000_000_000_000, labels: ['B-1'] } },
    } }]);

    await sdk.inventory.updateAvailability('ev_1', {
      rules: { balcony: { mode: 'timed', revealAt: 2_000_000_000_000 } },
    });
    expect(JSON.parse(call(0).body)).toEqual({
      rules: { balcony: { mode: 'timed', revealAt: 2_000_000_000_000 } },
    });

    if (false) {
      // @ts-expect-error A timed rule without revealAt is silently discarded by the runtime.
      void sdk.inventory.updateAvailability('ev_1', { rules: { balcony: { mode: 'timed' } } });
    }
  });
});

describe('webhook management contracts', () => {
  const sub = {
    id: 'wh_1',
    url: 'https://example.com/seatlayer',
    events: ['seat.booked'],
    disabled: false,
    lastStatus: null,
    lastAt: null,
    createdAt: 1,
    mode: 'test',
    environment: 'dev',
    uptime7d: null,
  };

  it('uses the server sub/subs response envelopes and disabled update field', async () => {
    const { sdk, call } = client([
      { status: 200, body: { subs: [sub] } },
      { status: 201, body: { sub, secret: 'whsec_once' } },
      { status: 200, body: { sub: { ...sub, disabled: true } } },
    ]);

    const listed = await sdk.webhooks.list();
    const created = await sdk.webhooks.create({
      url: sub.url,
      events: ['seat.booked'],
    });
    const updated = await sdk.webhooks.update(sub.id, { disabled: true });

    expect(listed.subs[0]?.id).toBe('wh_1');
    expect(created.sub.id).toBe('wh_1');
    expect(created.secret).toBe('whsec_once');
    expect(updated.sub.disabled).toBe(true);
    expect(JSON.parse(call(2).body)).toEqual({ disabled: true });
  });

  it('passes delivery filters and returns the pagination cursor', async () => {
    const { sdk, call } = client([{ status: 200, body: {
      deliveries: [{
        id: 'whd_1', at: 100, event: 'seat.booked', ref: 'order-1', status: 500,
        attempt: 2, maxAttempts: 4, willRetry: true, occurrenceId: 'occ_1',
        payload: '{"bookingRef":"order-1"}', responseBody: 'failed', errorMessage: null,
      }],
      nextBefore: 100,
    } }]);

    const page = await sdk.webhooks.listDeliveries('wh/1', {
      limit: 25,
      status: 'failed',
      before: 123,
    });

    expect(call(0).url).toBe(
      'https://api.seatlayer.io/v1/webhooks/wh%2F1/deliveries?limit=25&status=failed&before=123',
    );
    expect(page.deliveries[0]?.occurrenceId).toBe('occ_1');
    expect(page.nextBefore).toBe(100);
  });
});

describe('event request contracts', () => {
  it('sends all supported event-create metadata and chart-update acknowledgement', async () => {
    const { sdk, call } = client([
      { status: 201, body: { meta: { key: 'festival-2026' } } },
      { status: 200, body: { ok: true, updated: true, meta: { key: 'festival-2026' } } },
    ]);

    await sdk.events.create({
      chartId: 'c_1',
      name: 'Festival 2026',
      slug: 'festival-2026',
      startsAt: 2_000_000_000_000,
      venue: 'Riverside',
      externalRef: null,
      currency: null,
      description: 'An outdoor festival.',
      endsAt: 2_000_003_600_000,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      posterAssetId: '0123456789abcdef.jpg',
      mode: 'test',
    });
    await sdk.events.updateChart('festival-2026', {
      acknowledgeDroppedAssignments: true,
      reason: 'Reviewed the allocations before refreshing',
    });

    expect(JSON.parse(call(0).body)).toMatchObject({
      description: 'An outdoor festival.',
      endsAt: 2_000_003_600_000,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      posterAssetId: '0123456789abcdef.jpg',
      externalRef: null,
      currency: null,
      mode: 'test',
    });
    expect(JSON.parse(call(1).body)).toEqual({
      acknowledgeDroppedAssignments: true,
      reason: 'Reviewed the allocations before refreshing',
    });
  });

  it('represents the default hold TTL as null and can clear an override', async () => {
    const { sdk, call } = client([
      { status: 200, body: { holdTtlMs: null } },
      { status: 200, body: { ok: true, holdTtlMs: null } },
    ]);

    const current = await sdk.events.retrieveHoldTtl('ev_1');
    await sdk.events.updateHoldTtl('ev_1', null);

    expectTypeOf(current.holdTtlMs).toEqualTypeOf<number | null>();
    expect(current.holdTtlMs).toBeNull();
    expect(JSON.parse(call(1).body)).toEqual({ holdTtlMs: null });
  });

  it('uploads poster bytes without JSON encoding and removes the poster', async () => {
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const { sdk, call } = client([
      { status: 200, body: { meta: { key: 'ev_1', posterPath: '/pub/poster/1' } } },
      { status: 200, body: { meta: { key: 'ev_1', posterPath: null } } },
    ]);

    await sdk.events.updatePoster('ev/1', image);
    await sdk.events.deletePoster('ev/1');

    expect(call(0).method).toBe('PUT');
    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev%2F1/poster');
    expect(call(0).headers['Content-Type']).toBe('application/octet-stream');
    expect(call(0).rawBody).toBe(image);
    expect(call(1).method).toBe('DELETE');
    expect(call(1).url).toBe('https://api.seatlayer.io/v1/events/ev%2F1/poster');
  });

  it('exposes exact event detail, lifecycle, report, and log contracts', async () => {
    const { sdk, call } = client([
      { status: 200, body: {
        meta: { key: 'ev_1', sold: 2 },
        counts: { free: 8, held: 1, booked: 2, blocked: 1 },
        holdTtlMs: null,
        chartUpdate: { behind: true, canAutoUpdate: false },
      } },
      { status: 200, body: { meta: { key: 'ev_1' }, sectionStates: { hidden: [], closed: [], states: {} } } },
      { status: 200, body: { status: 'closed', state: 'paused', revision: 2, changed: true } },
      { status: 200, body: { status: 'open', state: 'live', revision: 3, changed: true } },
      { status: 200, body: { status: 'archived' } },
      { status: 200, body: { report: { byStatus: {} }, event: { key: 'ev_1' }, categories: [] } },
      { status: 200, body: { entries: [], nextBefore: 17 } },
    ]);

    const detail = await sdk.events.retrieve('ev_1');
    await sdk.events.update('ev_1', { sectionStates: { balcony: 'closed' } });
    const closed = await sdk.events.close('ev_1');
    const reopened = await sdk.events.reopen('ev_1');
    const archived = await sdk.events.archive('ev_1');
    const report = await sdk.events.retrieveReport('ev_1');
    const log = await sdk.events.retrieveLog('ev_1', { limit: 25, before: 99 });

    expectTypeOf(detail).toEqualTypeOf<EventDetail>();
    expectTypeOf(report).toEqualTypeOf<EventReportEnvelope>();
    expectTypeOf(log).toEqualTypeOf<EventLogPage>();
    expect(detail.holdTtlMs).toBeNull();
    expect(closed.changed).toBe(true);
    expect(reopened.revision).toBe(3);
    expect(archived.status).toBe('archived');
    expect(call(1).body).toBe('{"sectionStates":{"balcony":"closed"}}');
    expect(call(6).url).toBe('https://api.seatlayer.io/v1/events/ev_1/log?limit=25&before=99');

    if (false) {
      // @ts-expect-error The API rejects an event update with no supported field.
      void sdk.events.update('ev_1', {});
    }
  });
});

describe('metadata response types', () => {
  it('matches the fields emitted by chart and event metadata endpoints', () => {
    expectTypeOf<Chart['doc']>().toEqualTypeOf<Record<string, unknown> | null>();
    expectTypeOf<ChartMeta['seats']>().toEqualTypeOf<number>();
    expectTypeOf<ChartMeta['workspaceId']>().toEqualTypeOf<string>();
    expectTypeOf<ChartMeta['createdAt']>().toEqualTypeOf<unknown>();
    expectTypeOf<EventMeta['name']>().toEqualTypeOf<string>();
    expectTypeOf<EventMeta['createdAt']>().toEqualTypeOf<number>();
    expectTypeOf<EventMeta['id']>().toEqualTypeOf<unknown>();
  });
});

describe('pagination', () => {
  it('walks every page with listAll and stops when the cursor runs out', async () => {
    const { sdk, calls } = client([
      { status: 200, body: { charts: [{ id: 'c_1' }, { id: 'c_2' }], nextCursor: 'cur_1' } },
      { status: 200, body: { charts: [{ id: 'c_3' }] } },
    ]);

    const seen: string[] = [];
    for await (const chart of sdk.charts.listAll({ limit: 2 })) seen.push(chart.id);

    expect(seen).toEqual(['c_1', 'c_2', 'c_3']);
    expect(calls).toHaveLength(2);
    // Absent nextCursor terminates — a caller looping on it cannot spin forever.
    expect(String(calls[1]!.url)).toContain('cursor=cur_1');
  });

  it('does not ask for per-event counts when walking the whole catalogue', async () => {
    // Counts cost a server round-trip PER EVENT, which is exactly the cost
    // pagination was added to avoid.
    const { sdk, call } = client([{ status: 200, body: { events: [] } }]);
    for await (const _ of sdk.events.listAll()) { /* drain */ }
    expect(call(0).url).toContain('counts=0');
  });

  it('keeps counts on a single explicit page', async () => {
    const { sdk, call } = client([{ status: 200, body: { events: [] } }]);
    await sdk.events.list({ limit: 10 });
    expect(call(0).url).not.toContain('counts=0');
  });

  it('passes limit and cursor through verbatim', async () => {
    const { sdk, call } = client([{ status: 200, body: { charts: [] } }]);
    await sdk.charts.list({ limit: 25, cursor: 'abc' });
    expect(call(0).url).toContain('limit=25');
    expect(call(0).url).toContain('cursor=abc');
  });
});

describe('extendHold', () => {
  it('posts the hold id to the extend route', async () => {
    const { sdk, call } = client([{ status: 200, body: { ok: true, expiresAt: 123 } }]);
    await sdk.inventory.extendHold('ev_1', { holdId: 'h_9', ttlMs: 600_000 });

    expect(call(0).url).toBe('https://api.seatlayer.io/v1/events/ev_1/extend');
    expect(JSON.parse(call(0).body)).toEqual({ holdId: 'h_9', ttlMs: 600_000 });
  });

  it('surfaces a spent hold as a conflict, not a generic failure', async () => {
    const { sdk } = client([{ status: 409, body: { error: 'cannot_extend', reason: 'expired' } }]);
    const error = await sdk.inventory.extendHold('ev_1', { holdId: 'h_9' }).catch((e) => e);
    expect(error).toBeInstanceOf(SeatLayerConflictError);
    expect(error.code).toBe('cannot_extend');
  });
});
