import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  SeatLayer,
  SeatLayerConflictError,
  SeatLayerError,
  SeatLayerRateLimitError,
  type WebhookEventName,
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

describe('Holders resource', () => {
  it('maps all 14 holder, customer, ticket, transfer, return, and renewal operations', async () => {
    await expectOperations([
      {
        name: 'listCustomers',
        run: (sdk) => sdk.holders.listCustomers({
          email: 'fan+1@example.com', holderRef: 'holder a/b', cursor: 'c/1', limit: 10,
        }),
        method: 'GET', path: '/v1/customers?email=fan%2B1%40example.com&holderRef=holder+a%2Fb&cursor=c%2F1&limit=10',
      },
      {
        name: 'retrieveHolder',
        run: (sdk) => sdk.holders.retrieveHolder('holder a/b'),
        method: 'GET', path: '/v1/holders/holder%20a%2Fb',
      },
      {
        name: 'updateHolder',
        run: (sdk) => sdk.holders.updateHolder('holder a/b', { email: 'new@example.com', name: null }, {
          idempotencyKey: 'holder-1',
        }),
        method: 'PATCH', path: '/v1/holders/holder%20a%2Fb',
        body: { email: 'new@example.com', name: null }, idempotencyKey: 'holder-1',
      },
      {
        name: 'revokeHolderSessions',
        run: (sdk) => sdk.holders.revokeHolderSessions('holder a/b', { sessionId: 'hs_1' }),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/sessions/revoke', body: { sessionId: 'hs_1' },
      },
      {
        name: 'listHolderSeasons',
        run: (sdk) => sdk.holders.listHolderSeasons('holder a/b'),
        method: 'GET', path: '/v1/holders/holder%20a%2Fb/seasons',
      },
      {
        name: 'listHolderTickets',
        run: (sdk) => sdk.holders.listHolderTickets('holder a/b', {
          seasonKey: 'sea_a/b', from: 1, to: 2, cursor: 'c/1', limit: 5,
        }),
        method: 'GET', path: '/v1/holders/holder%20a%2Fb/tickets?seasonKey=sea_a%2Fb&from=1&to=2&cursor=c%2F1&limit=5',
      },
      {
        name: 'retrieveHolderTicket',
        run: (sdk) => sdk.holders.retrieveHolderTicket('holder a/b', 'tkt/1'),
        method: 'GET', path: '/v1/holders/holder%20a%2Fb/tickets/tkt%2F1',
      },
      {
        name: 'createHolderTransfer',
        run: (sdk) => sdk.holders.createHolderTransfer('holder a/b', {
          ticketIds: ['tkt/1'], toEmail: 'friend@example.com',
        }),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/transfers',
        body: { ticketIds: ['tkt/1'], toEmail: 'friend@example.com' }, idempotencyKey: 'generated',
        response: { status: 201, body: { transfer: { transferId: 'trf_1', state: 'sent' } } },
      },
      {
        name: 'listHolderTransfers',
        run: (sdk) => sdk.holders.listHolderTransfers('holder a/b'),
        method: 'GET', path: '/v1/holders/holder%20a%2Fb/transfers',
      },
      {
        name: 'cancelHolderTransfer',
        run: (sdk) => sdk.holders.cancelHolderTransfer('holder a/b', 'trf/1'),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/transfers/trf%2F1/cancel',
      },
      {
        name: 'acceptHolderTransfer',
        run: (sdk) => sdk.holders.acceptHolderTransfer('holder a/b', 'trf/1'),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/transfers/trf%2F1/accept',
      },
      {
        name: 'createHolderReturn',
        run: (sdk) => sdk.holders.createHolderReturn('holder a/b', {
          ticketIds: ['tkt_0123456789abcdef01234567'],
        }),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/returns',
        body: { ticketIds: ['tkt_0123456789abcdef01234567'] }, idempotencyKey: 'generated',
        response: { status: 201, body: { return: { returnId: 'ret_1', state: 'pending' } } },
        returns: { return: { returnId: 'ret_1', state: 'pending' } },
      },
      {
        name: 'createHolderRenewalCheckout',
        run: (sdk) => sdk.holders.createHolderRenewalCheckout('holder a/b', 'sro/1', {
          returnUrl: 'https://tickets.example/renewed', buyerEmail: 'cara@example.com',
          buyerName: 'Cara', provider: 'stripe',
        }, { idempotencyKey: 'crm-renew-cara-2027' }),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/renewal-offers/sro%2F1/checkout',
        body: {
          returnUrl: 'https://tickets.example/renewed', buyerEmail: 'cara@example.com',
          buyerName: 'Cara', provider: 'stripe',
        },
        idempotencyKey: 'crm-renew-cara-2027',
        response: { status: 201, body: { orderId: 'ord_1', payment: { url: 'https://pay.example/1' } } },
        returns: { orderId: 'ord_1', payment: { url: 'https://pay.example/1' } },
      },
      {
        name: 'declineHolderRenewalOffer with a reason',
        run: (sdk) => sdk.holders.declineHolderRenewalOffer('holder a/b', 'sro/1', { reason: 'Moving away' }),
        method: 'POST', path: '/v1/holders/holder%20a%2Fb/renewal-offers/sro%2F1/decline',
        body: { reason: 'Moving away' },
        response: { status: 200, body: { offer: { offerId: 'sro/1', state: 'declined', declineReason: 'Moving away' } } },
        returns: { offer: { offerId: 'sro/1', state: 'declined', declineReason: 'Moving away' } },
      },
    ]);
  });

  it('declines a holder offer with no body when no reason is given', async () => {
    await expectOperations([
      {
        name: 'declineHolderRenewalOffer',
        run: (sdk) => sdk.holders.declineHolderRenewalOffer('holder_1', 'sro_1'),
        method: 'POST', path: '/v1/holders/holder_1/renewal-offers/sro_1/decline',
      },
    ]);
  });

  it('reuses one Idempotency-Key when a holder renewal checkout retries, but sends a decline once', async () => {
    const stub = stubFetch([
      { status: 503, body: { error: 'unavailable' } },
      { status: 201, body: { orderId: 'ord_1' } },
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 201, body: { orderId: 'ord_1' } },
      { status: 503, body: { error: 'unavailable' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });
    const params = { returnUrl: 'https://tickets.example/renewed' };

    await sdk.holders.createHolderRenewalCheckout('a/b', 'sro_1', params);
    await sdk.holders.createHolderRenewalCheckout('a/b', 'sro_1', params, { idempotencyKey: 'renew-1' });
    await expect(sdk.holders.declineHolderRenewalOffer('a/b', 'sro_1', { reason: 'Moving away' }))
      .rejects.toBeInstanceOf(SeatLayerError);

    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(stub.calls.map((call) => `${call.init.method} ${new URL(call.url).pathname}`)).toEqual([
      ...Array(4).fill('POST /v1/holders/a%2Fb/renewal-offers/sro_1/checkout'),
      'POST /v1/holders/a%2Fb/renewal-offers/sro_1/decline',
    ]);
    expect(headers[0]!['Idempotency-Key']).toMatch(GENERATED_KEY);
    expect(headers[1]!['Idempotency-Key']).toBe(headers[0]!['Idempotency-Key']);
    expect(headers[2]!['Idempotency-Key']).toBe('renew-1');
    expect(headers[3]!['Idempotency-Key']).toBe('renew-1');
    expect(headers[4]!['Idempotency-Key']).toBeUndefined();
    expect(JSON.parse(stub.calls[4]!.init.body as string)).toEqual({ reason: 'Moving away' });
    expect(stub.responses).toHaveLength(0);
  });

  it('reuses one generated key when a transfer retries, and sends session revoke once', async () => {
    const stub = stubFetch([
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 201, body: { transfer: { transferId: 'trf_1' } } },
      { status: 503, body: { error: 'unavailable' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });

    await sdk.holders.createHolderTransfer('holder_1', { ticketIds: ['tkt_1'], toEmail: 'a@example.com' });
    await expect(sdk.holders.revokeHolderSessions('holder_1')).rejects.toBeInstanceOf(SeatLayerError);

    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(headers[0]!['Idempotency-Key']).toMatch(GENERATED_KEY);
    expect(headers[1]!['Idempotency-Key']).toBe(headers[0]!['Idempotency-Key']);
    expect(headers[2]!['Idempotency-Key']).toBeUndefined();
    expect(stub.calls[2]!.init.body).toBeUndefined();
    expect(stub.responses).toHaveLength(0);
  });

  it('reuses one Idempotency-Key when a return retries, generated or the caller\'s', async () => {
    const created = {
      return: {
        returnId: 'ret_1',
        state: 'returned',
        seasonKey: 'sea_1',
        tickets: [{ ticketId: 'tkt_0123456789abcdef01234567', eventKey: 'ev_1', label: 'A-1', state: 'returned', error: null }],
        createdAt: 1,
      },
    };
    const stub = stubFetch([
      { status: 503, body: { error: 'unavailable' } },
      { status: 201, body: created },
      { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 200, body: created },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });
    const params = { ticketIds: ['tkt_0123456789abcdef01234567'] };

    const first = await sdk.holders.createHolderReturn('a/b', params);
    const again = await sdk.holders.createHolderReturn('a/b', params, { idempotencyKey: 'return-1' });

    expect(first).toEqual(created);
    expect(again).toEqual(created);
    expectTypeOf(first.return.tickets[0]!.state).toEqualTypeOf<'pending' | 'returned' | 'failed'>();
    const headers = stub.calls.map((call) => call.init.headers as Record<string, string>);
    expect(stub.calls.map((call) => `${call.init.method} ${new URL(call.url).pathname}`))
      .toEqual(Array(4).fill('POST /v1/holders/a%2Fb/returns'));
    expect(stub.calls.map((call) => JSON.parse(call.init.body as string))).toEqual(Array(4).fill(params));
    expect(headers[0]!['Idempotency-Key']).toMatch(GENERATED_KEY);
    expect(headers[1]!['Idempotency-Key']).toBe(headers[0]!['Idempotency-Key']);
    expect(headers[2]!['Idempotency-Key']).toBe('return-1');
    expect(headers[3]!['Idempotency-Key']).toBe('return-1');
    expect(stub.responses).toHaveLength(0);
  });
});

describe('Orders resource', () => {
  it('maps all 9 order operations, including the event order routes', async () => {
    const csv = 'orderId,displayRef,total\nord_1,SL-1,"1,000"\n';
    await expectOperations([
      {
        name: 'listOrders',
        run: (sdk) => sdk.orders.listOrders({
          eventKey: 'ev a/b', seasonKey: 'sea_a/b', holderRef: 'ord_1/2', status: 'confirmed', from: 1, to: 2, cursor: 'c/1', limit: 50,
        }),
        method: 'GET',
        path: '/v1/orders?eventKey=ev+a%2Fb&seasonKey=sea_a%2Fb&holderRef=ord_1%2F2&status=confirmed&from=1&to=2&cursor=c%2F1&limit=50',
      },
      {
        name: 'retrieveOrder',
        run: (sdk) => sdk.orders.retrieveOrder('ord_1/2'),
        method: 'GET', path: '/v1/orders/ord_1%2F2',
      },
      {
        name: 'listOrderTickets',
        run: (sdk) => sdk.orders.listOrderTickets('ord_1/2'),
        method: 'GET', path: '/v1/orders/ord_1%2F2/tickets',
      },
      {
        name: 'listEventOrders',
        run: (sdk) => sdk.orders.listEventOrders('ev a/b', {
          q: 'smith', status: 'partially_cancelled', paidBy: 'card', from: 1, to: 2, cursor: 'c/1', limit: 25,
        }),
        method: 'GET',
        path: '/v1/events/ev%20a%2Fb/orders?q=smith&status=partially_cancelled&paidBy=card&from=1&to=2&cursor=c%2F1&limit=25',
      },
      {
        name: 'retrieveEventOrder',
        run: (sdk) => sdk.orders.retrieveEventOrder('ev a/b', 'ord_1/2'),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/orders/ord_1%2F2',
      },
      {
        name: 'exportEventOrdersCsv',
        run: (sdk) => sdk.orders.exportEventOrdersCsv('ev a/b', { status: 'confirmed', paidBy: 'card' }),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/orders.csv?status=confirmed&paidBy=card',
        response: { status: 200, rawBody: csv, headers: { 'content-type': 'text/csv; charset=utf-8' } },
        returns: csv,
      },
      {
        name: 'refundEventOrder',
        run: (sdk) => sdk.orders.refundEventOrder('ev a/b', 'ord_1/2', { amountMinor: 1_000 }, {
          idempotencyKey: 'event-refund-1',
        }),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/orders/ord_1%2F2/refund',
        body: { amountMinor: 1_000 }, idempotencyKey: 'event-refund-1',
        response: { status: 202, body: { orderId: 'ord_1/2', operationId: 'op_1' } },
      },
      {
        name: 'cancelEventOrder',
        run: (sdk) => sdk.orders.cancelEventOrder('ev a/b', 'ord_1/2', { reason: 'other', notifyBuyer: false }),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/orders/ord_1%2F2/cancel',
        body: { reason: 'other', notifyBuyer: false }, idempotencyKey: 'generated',
      },
      {
        name: 'resendEventOrderTickets',
        run: (sdk) => sdk.orders.resendEventOrderTickets('ev a/b', 'ord_1/2', { email: 'fan@example.com' }),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/orders/ord_1%2F2/resend', body: { email: 'fan@example.com' },
      },
    ]);
  });

  it('types the CSV export as text and never retries a ticket resend', async () => {
    const stub = stubFetch([{ status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '0' } }]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });
    expectTypeOf(sdk.orders.exportEventOrdersCsv).returns.resolves.toEqualTypeOf<string>();

    await expect(sdk.orders.resendEventOrderTickets('ev_1', 'ord_1')).rejects.toBeInstanceOf(SeatLayerRateLimitError);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.init.body).toBeUndefined();
  });
});

describe('Event sales operations', () => {
  it('maps all 14 checkout, gateway, sales, booking-fee, and discount-code operations', async () => {
    await expectOperations([
      {
        name: 'retrieveEventBuyerCheckout',
        run: (sdk) => sdk.events.retrieveEventBuyerCheckout('ev a/b'),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/buyer-checkout',
      },
      {
        name: 'replaceEventBuyerCheckout',
        run: (sdk) => sdk.events.replaceEventBuyerCheckout('ev a/b', { buyerCheckout: 'seatlayer', expectedRevision: 3 }),
        method: 'PUT', path: '/v1/events/ev%20a%2Fb/buyer-checkout',
        body: { buyerCheckout: 'seatlayer', expectedRevision: 3 },
      },
      {
        name: 'retrieveEventPaymentGateway',
        run: (sdk) => sdk.events.retrieveEventPaymentGateway('ev a/b', { currency: 'EUR' }),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/payment-gateway?currency=EUR',
      },
      {
        name: 'replaceEventPaymentGateway',
        run: (sdk) => sdk.events.replaceEventPaymentGateway('ev a/b', { connectionId: 'pc_1', provider: null }),
        method: 'PUT', path: '/v1/events/ev%20a%2Fb/payment-gateway', body: { connectionId: 'pc_1', provider: null },
      },
      {
        name: 'retrieveEventSalesReadiness',
        run: (sdk) => sdk.events.retrieveEventSalesReadiness('ev a/b'),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/sales/readiness',
      },
      {
        name: 'preflightEventSales',
        run: (sdk) => sdk.events.preflightEventSales('ev a/b', { orderId: 'ord_1/2' }),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/sales/preflight', body: { orderId: 'ord_1/2' },
      },
      {
        name: 'transitionEventSales',
        run: (sdk) => sdk.events.transitionEventSales('ev a/b', { to: 'live', expectedRevision: 4, reason: 'launch' }),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/sales/transition',
        body: { to: 'live', expectedRevision: 4, reason: 'launch' },
      },
      {
        name: 'retrieveEventBookingFee',
        run: (sdk) => sdk.events.retrieveEventBookingFee('ev a/b'),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/booking-fee',
      },
      {
        name: 'replaceEventBookingFee',
        run: (sdk) => sdk.events.replaceEventBookingFee('ev a/b', { bookingFeeMinor: null }),
        method: 'PUT', path: '/v1/events/ev%20a%2Fb/booking-fee', body: { bookingFeeMinor: null },
      },
      {
        name: 'listEventDiscountCodes',
        run: (sdk) => sdk.events.listEventDiscountCodes('ev a/b'),
        method: 'GET', path: '/v1/events/ev%20a%2Fb/discount-codes',
      },
      {
        name: 'createEventDiscountCode',
        run: (sdk) => sdk.events.createEventDiscountCode('ev a/b', {
          code: 'EARLY', kind: 'percent', percent: 10, maxUses: null,
        }),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/discount-codes',
        body: { code: 'EARLY', kind: 'percent', percent: 10, maxUses: null },
        response: { status: 201, body: { code: { id: 'dc_1', code: 'EARLY' } } },
      },
      {
        name: 'updateEventDiscountCode',
        run: (sdk) => sdk.events.updateEventDiscountCode('ev a/b', 'dc/1', { state: 'paused' }),
        method: 'PATCH', path: '/v1/events/ev%20a%2Fb/discount-codes/dc%2F1', body: { state: 'paused' },
      },
      {
        name: 'endEventDiscountCode',
        run: (sdk) => sdk.events.endEventDiscountCode('ev a/b', 'dc/1'),
        method: 'POST', path: '/v1/events/ev%20a%2Fb/discount-codes/dc%2F1/end',
      },
      {
        name: 'deleteEventDiscountCode',
        run: (sdk) => sdk.events.deleteEventDiscountCode('ev a/b', 'dc/1'),
        method: 'DELETE', path: '/v1/events/ev%20a%2Fb/discount-codes/dc%2F1',
        response: { status: 204 }, returns: undefined,
      },
    ]);
  });

  it('keeps every event sales mutation single-attempt', async () => {
    const stub = stubFetch([
      { status: 503, body: { error: 'unavailable' } },
      { status: 503, body: { error: 'unavailable' } },
      { status: 503, body: { error: 'unavailable' } },
    ]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 3 });
    expectTypeOf(sdk.events.deleteEventDiscountCode).returns.resolves.toEqualTypeOf<void>();

    await expect(sdk.events.transitionEventSales('ev_1', { to: 'paused', expectedRevision: 1 }))
      .rejects.toBeInstanceOf(SeatLayerError);
    await expect(sdk.events.createEventDiscountCode('ev_1', { code: 'X', kind: 'amount', amountMinor: 100 }))
      .rejects.toBeInstanceOf(SeatLayerError);
    await expect(sdk.events.replaceEventBookingFee('ev_1', { bookingFeeMinor: 50 }))
      .rejects.toBeInstanceOf(SeatLayerError);

    expect(stub.calls).toHaveLength(3);
    expect(stub.calls.every((call) => !(call.init.headers as Record<string, string>)['Idempotency-Key'])).toBe(true);
  });
});

describe('Event series resource', () => {
  it('makes failed dates again with { retryFailed: true }', async () => {
    await expectOperations([{
      name: 'addEventSeriesDates',
      run: (sdk) => sdk.eventSeries.addEventSeriesDates('ser/1', { retryFailed: true }),
      method: 'POST', path: '/v1/event-series/ser%2F1/dates',
      body: { retryFailed: true }, idempotencyKey: 'generated',
      response: { status: 202, body: { jobId: 'job_3', added: 2 } },
    }]);
  });

  it('makes a series from an event already set up (fromEventKey)', async () => {
    const schedule = { rule: 'daily' as const, from: '2026-11-06', until: '2026-11-19', times: ['14:00', '17:30', '20:15'] };
    await expectOperations([{
      name: 'createEventSeries',
      run: (sdk) => sdk.eventSeries.createEventSeries({ fromEventKey: 'lighthouse-keeper', schedule }, { idempotencyKey: 'series-2' }),
      method: 'POST', path: '/v1/event-series',
      body: { fromEventKey: 'lighthouse-keeper', schedule }, idempotencyKey: 'series-2',
      response: { status: 202, body: { series: { seriesKey: 'ser_2', firstEventKey: 'lighthouse-keeper' }, jobId: 'job_4' } },
    }]);
  });

  it('answers a given-up series create as 409 create_abandoned, once, with the message to use a new key', async () => {
    const stub = stubFetch([{ status: 409, body: {
      error: 'create_abandoned', code: 'create_abandoned',
      message: 'This series never started and was given up when another request came for the event. Send the request again with a new Idempotency-Key.',
    } }]);
    const sdk = new SeatLayer({ secretKey: 'sk_test_abc', fetch: stub.fetch, maxRetries: 2 });
    const schedule = { rule: 'daily' as const, from: '2026-11-06', until: '2026-11-08', times: ['20:00'] };
    const error = await sdk.eventSeries.createEventSeries({ fromEventKey: 'ev_1', schedule }, { idempotencyKey: 'series-3' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SeatLayerConflictError);
    expect((error as SeatLayerConflictError).code).toBe('create_abandoned');
    expect((error as SeatLayerConflictError).message).toMatch(/new Idempotency-Key/);
    expect(stub.calls).toHaveLength(1);
  });

  it('maps all 5 event series operations', async () => {
    const schedule = { rule: 'weekly' as const, from: '2027-01-01', count: 4, times: ['19:30'] };
    await expectOperations([
      {
        name: 'createEventSeries',
        run: (sdk) => sdk.eventSeries.createEventSeries({
          name: 'Tour', chartKey: 'ch_1', schedule, timezone: 'Europe/London',
        }, { idempotencyKey: 'series-1' }),
        method: 'POST', path: '/v1/event-series',
        body: { name: 'Tour', chartKey: 'ch_1', schedule, timezone: 'Europe/London' }, idempotencyKey: 'series-1',
        response: { status: 202, body: { series: { seriesKey: 'ser_1' }, jobId: 'job_1' } },
      },
      {
        name: 'listEventSeries',
        run: (sdk) => sdk.eventSeries.listEventSeries({ limit: 10, cursor: 'c/1' }),
        method: 'GET', path: '/v1/event-series?limit=10&cursor=c%2F1',
      },
      {
        name: 'retrieveEventSeries',
        run: (sdk) => sdk.eventSeries.retrieveEventSeries('ser/1'),
        method: 'GET', path: '/v1/event-series/ser%2F1',
      },
      {
        name: 'addEventSeriesDates',
        run: (sdk) => sdk.eventSeries.addEventSeriesDates('ser/1', { dates: ['2027-02-01T19:30'] }),
        method: 'POST', path: '/v1/event-series/ser%2F1/dates',
        body: { dates: ['2027-02-01T19:30'] }, idempotencyKey: 'generated',
        response: { status: 202, body: { jobId: 'job_2', added: 1 } },
      },
      {
        name: 'updateEventSeries',
        run: (sdk) => sdk.eventSeries.updateEventSeries('ser/1', {
          name: 'Tour 2', sales: 'off', prices: { categories: [{ key: 'A', price: 2_500 }] },
        }, { idempotencyKey: 'series-update-1' }),
        method: 'PATCH', path: '/v1/event-series/ser%2F1',
        body: { name: 'Tour 2', sales: 'off', prices: { categories: [{ key: 'A', price: 2_500 }] } },
        idempotencyKey: 'series-update-1',
      },
    ]);
  });
});

describe('webhook event names', () => {
  it('includes the series, order, customer, and season ticket transfer events', () => {
    const names: WebhookEventName[] = [
      'series.created', 'series.dates_added', 'order.paid', 'order.refunded', 'order.cancelled',
      'customer.created', 'customer.email_changed', 'season.ticket.transfer_sent',
      'season.ticket.transferred', 'season.ticket.transfer_cancelled',
    ];
    expect(names).toHaveLength(10);
  });

  it('lists all 56 public names, including the 2.11 date and bulk job events', () => {
    const names = [
      'seat.booked', 'seat.released', 'seat.blocked', 'hold.expired', 'hold.created', 'hold.extended',
      'event.created', 'event.soldout', 'object.resale.listed', 'object.resale.unlisted', 'object.resale.sold',
      'customer.created', 'customer.email_changed', 'order.paid', 'order.refunded', 'order.cancelled',
      'season.ticket.transfer_sent', 'season.ticket.transferred', 'season.ticket.transfer_cancelled',
      'season.ticket.issued', 'season.ticket.voided', 'season.structure.activated', 'season.structure.closed',
      'season.structure.archived', 'season.plan.published', 'season.plan.superseded', 'season.sales.opened',
      'season.sales.paused', 'season.sales.ended', 'season.hold.committed', 'season.hold.released',
      'season.hold.expired', 'season.booking.confirmed', 'season.booking.cancelled',
      'season.booking.emergency_requested', 'season.occurrence.returned', 'season.occurrence.reclaimed',
      'season.renewal.offered', 'season.renewal.intent_received', 'season.renewal.renewed',
      'season.renewal.declined', 'season.renewal.lapsed', 'season.renewal.released',
      'season.operation.partial_terminal', 'season.amendment.applied', 'season.performance.added',
      'season.performance.removed', 'season.performance.past', 'season.performance.postponed',
      'season.performance.cancelled', 'season.performance.rescheduled', 'season.bulk_action.completed',
      'season.block.ready', 'season.block.released',
      'season.order.paid', 'season.order.refunded', 'series.created', 'series.dates_added',
    ] as const satisfies readonly WebhookEventName[];
    expect(new Set(names).size).toBe(58);
    // Every member of the union is listed above: nothing is left over.
    expectTypeOf<Exclude<WebhookEventName, (typeof names)[number]>>().toEqualTypeOf<never>();
  });
});
