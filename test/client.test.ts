import { describe, expect, it, vi } from 'vitest';
import { SeatLayer, SeatLayerAuthError, SeatLayerConflictError, SeatLayerRateLimitError } from '../src/index.js';

/** Build a fetch stub that replays a queue of responses and records requests. */
function stubFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('stubFetch: more requests than queued responses');
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    });
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
    return { url: entry.url, headers: entry.init.headers as Record<string, string>, body: entry.init.body as string };
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

  it('attaches an Idempotency-Key to mutations but not to reads', async () => {
    const { sdk, call } = client([
      { status: 200, body: {} },
      { status: 201, body: {} },
    ]);
    await sdk.events.list();
    await sdk.events.create({ chartId: 'c_1' });

    expect(call(0).headers['Idempotency-Key']).toBeUndefined();
    expect(call(1).headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
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
});

describe('errors', () => {
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

  it('prefers Retry-After over the JSON field', async () => {
    const { sdk } = client([{
      status: 429,
      body: { error: 'rate_limited', retryAfterSeconds: 99 },
      headers: { 'retry-after': '0' },
    }], { maxRetries: 1 });

    const error = await sdk.events.retrieve('ev_1').catch((e) => e);
    expect(error.retryAfterSeconds).toBe(0);
  });
});

describe('sessions', () => {
  it('refuses to mint a manage session without explicit capabilities', async () => {
    const { sdk } = client([]);
    // The API would default this to all four including event:cancel — the
    // ability to reverse paid bookings should never arrive by omission.
    await expect(
      sdk.sessions.createManageSession('ev_1', {
        allowedOrigin: 'https://box-office.example',
        capabilities: [],
      }),
    ).rejects.toThrow(/capabilities is required/);
  });

  it('mints with the capabilities it was given', async () => {
    const { sdk, call } = client([{ status: 201, body: { token: 'mse_x', expiresAt: 1 } }]);
    await sdk.sessions.createManageSession('ev_1', {
      allowedOrigin: 'https://box-office.example',
      capabilities: ['event:view'],
    });
    expect(JSON.parse(call(0).body).capabilities).toEqual(['event:view']);
  });
});

describe('charts', () => {
  it('requires expectedUpdatedAt on update, at the type level and on the wire', async () => {
    const { sdk, call } = client([{ status: 200, body: { meta: {} } }]);
    await sdk.charts.update('c_1', { doc: { version: 1 }, expectedUpdatedAt: 1234 });
    expect(JSON.parse(call(0).body).expectedUpdatedAt).toBe(1234);
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
