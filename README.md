# SeatLayer Node SDK

Official Node.js server SDK for the [SeatLayer](https://seatlayer.io) reserved-seating API.

> **Server-side only.** This package authenticates with your secret key. Never bundle it into a
> browser, a mobile app, or anything a ticket buyer can open. Browser surfaces get short-lived,
> origin-bound tokens that you mint here — see [Embedding the control room](#embedding-the-control-room).

## Install

```bash
npm install @seatlayer/server
```

Requires Node 20.19.4 or newer. No runtime dependencies.

## Quick start

```ts
import { SeatLayer } from '@seatlayer/server';

const seatlayer = new SeatLayer(process.env.SEATLAYER_SECRET_KEY!);

// 1. Provision a venue for a new organiser from one of your templates.
const { meta: chart } = await seatlayer.charts.copy('c_template_arena');
await seatlayer.charts.publish(chart.id);

// 2. Create an event on it.
const { meta: event } = await seatlayer.events.create({
  chartId: chart.id,
  name: 'Spring Gala',
  startsAt: Date.parse('2026-09-12T19:30:00Z'),
});

// 3. Sell four seats over the phone.
const held = await seatlayer.inventory.holdBestAvailable(event.key, { qty: 4 });
// … take payment against held.items, which carry authoritative prices …
await seatlayer.inventory.book(event.key, { holdId: held.holdId, bookingRef: 'order-8842' });
```

## Test vs live

Keys carry their own mode. `sk_test_…` keys can only touch test-mode events, and `sk_live_…` keys
only live ones; crossing them returns `403 mode_mismatch`, surfaced as
`SeatLayerAuthError` with `isModeMismatch === true`.

```ts
const seatlayer = new SeatLayer(process.env.SEATLAYER_SECRET_KEY!);
if (process.env.NODE_ENV === 'production' && seatlayer.mode !== 'live') {
  throw new Error('Refusing to boot production against test-mode seating data.');
}
```

## The two selling flows

**Buyer picks seats in the browser.** Your frontend holds them; your backend confirms the price and
books. Never price from what the browser sent you — `retrieveHold` is the authoritative answer.

```ts
const hold = await seatlayer.inventory.retrieveHold(eventKey, holdId);
const total = hold.items.reduce((sum, item) => sum + item.unitPrice, 0);
// … charge `total` in hold.currency …
await seatlayer.inventory.book(eventKey, { holdId, bookingRef: charge.id });
```

**Your backend picks the seats.** Phone orders, box office, comps. No browser involved.

```ts
// Payment already taken — book outright, so nothing is stranded if a second call fails.
await seatlayer.inventory.bookBestAvailable(eventKey, { qty: 2, bookingRef: 'phone-1183' });

// Or name the seats yourself.
await seatlayer.inventory.boxOfficeBook(eventKey, { labels: ['A-1', 'A-2'], bookingRef: 'comp-14' });
```

## Listing and pagination

`list()` returns one page plus a `nextCursor`. When you want everything, `listAll()` pages for you
and yields as it goes — an async iterator rather than an array, because the point of paginating is
to *not* hold an unbounded list in memory.

```ts
// One page, your own paging.
const page = await seatlayer.events.list({ limit: 50 });
page.events;      // EventMeta[]
page.nextCursor;  // undefined once exhausted

// Or let the SDK walk it.
for await (const event of seatlayer.events.listAll()) {
  await sync(event);
}
```

Listing events includes live availability `counts` by default, which costs the server one
round-trip **per event**. `listAll()` turns them off automatically — walking a whole catalogue is
exactly when you don't want that — and you can control it explicitly:

```ts
await seatlayer.events.list({ limit: 50, counts: false });
```

## Keeping a hold alive

When an order takes longer than the checkout window — an invoice, a phone sale — extend rather than
release and re-hold. Releasing first hands the seats to whoever is racing for them in between.

```ts
try {
  await seatlayer.inventory.extendHold(eventKey, { holdId, ttlMs: 10 * 60_000 });
} catch (error) {
  if (error instanceof SeatLayerConflictError) {
    // Gone, expired, or at its renewal cap — the buyer has to re-pick.
  }
}
```

## Embedding the control room

Your secret key never reaches a browser. Mint a scoped token instead and hand that to the widget.

```ts
const session = await seatlayer.sessions.createManageSession(eventKey, {
  allowedOrigin: 'https://box-office.yourplatform.com',
  capabilities: ['event:view', 'event:block'],
  expiresInSeconds: 3600,
});
```

`capabilities` is **required** by this SDK even though the API defaults it. That default grants all
four capabilities including `event:cancel`, which reverses paid bookings — not something that should
arrive by forgetting an argument. Grant the smallest set the page needs.

The same pattern embeds the Designer in your own UI:

```ts
const { meta: chart } = await seatlayer.charts.create({ name: 'Riverside Theatre' });
const designer = await seatlayer.sessions.createDesignerSession({
  workspaceId,
  chartId: chart.id,
  allowedOrigin: 'https://app.yourplatform.com',
  authority: 'edit',
});
```

## Webhooks

Verify every delivery against the **raw** body. Re-serialising it (`JSON.stringify(req.body)`)
changes the bytes and verification will fail.

```ts
import express from 'express';
import { verifyWebhook, WebhookVerificationError } from '@seatlayer/server';

app.post('/webhooks/seatlayer', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = verifyWebhook({
      payload: req.body,                                   // Buffer, not parsed JSON
      signature: req.header('X-SeatLayer-Signature'),
      secret: process.env.SEATLAYER_WEBHOOK_SECRET!,
    });

    // The signed body carries `at`, but nothing enforces a freshness window,
    // so a captured delivery stays valid indefinitely. Deduplicate on
    // occurrenceId — this is your replay protection, not an optimisation.
    if (await alreadyProcessed(event.occurrenceId)) return res.sendStatus(200);

    await handle(event);
    res.sendStatus(200);
  } catch (error) {
    if (error instanceof WebhookVerificationError) return res.sendStatus(400);
    throw error;
  }
});
```

## Errors

```ts
import {
  SeatLayerAuthError,
  SeatLayerConflictError,
  SeatLayerRateLimitError,
} from '@seatlayer/server';

try {
  await seatlayer.inventory.holdBestAvailable(eventKey, { qty: 6 });
} catch (error) {
  if (error instanceof SeatLayerConflictError && error.isSoldOut) {
    return showAlternativeDates();          // a business outcome, not a bug
  }
  if (error instanceof SeatLayerRateLimitError) {
    return retryAfter(error.retryAfterSeconds);
  }
  if (error instanceof SeatLayerAuthError && error.isModeMismatch) {
    throw new Error('Test key pointed at a live event (or the reverse).');
  }
  throw error;
}
```

Every error carries `status`, `code`, `body`, and `requestId` — quote the request id in support
requests.

## Reliability

**Retries.** 429, 408 and 5xx are retried with exponential backoff and full jitter; `Retry-After`
wins when the server sends it. 4xx responses are never retried — they will not start succeeding.

**Idempotency.** Every mutating request carries an `Idempotency-Key`, generated if you do not supply
one, and **reused across retries** so a retried booking cannot become two bookings. Pass your own
order id when you want end-to-end deduplication:

```ts
await seatlayer.inventory.book(eventKey, { holdId }, { idempotencyKey: `order-${orderId}` });
```

```ts
new SeatLayer({
  secretKey: process.env.SEATLAYER_SECRET_KEY!,
  maxRetries: 3,      // total attempts
  timeoutMs: 30_000,  // per attempt
});
```

## Escape hatch

For surface this SDK does not wrap yet — same auth, retries, idempotency and error mapping:

```ts
await seatlayer.request('POST', '/v1/events/ev_1/some-new-route', { body: { … } });
```

## API surface

| Resource | Methods |
| --- | --- |
| `charts` | `list` `listAll` `create` `retrieve` `update` `delete` `copy` `archive` `unarchive` `publish` |
| `events` | `list` `listAll` `create` `retrieve` `update` `delete` `updateChart` `close` `reopen` `archive` `retrieveHoldTtl` `updateHoldTtl` `retrieveReport` `retrieveLog` |
| `inventory` | `hold` `holdBestAvailable` `bookBestAvailable` `extendHold` `retrieveHold` `release` `book` `boxOfficeBook` `unbook` `block` `unblock` `unblockAll` `retrieveAvailability` `updateAvailability` |
| `sessions` | `createManageSession` `revokeManageSession` `createDesignerSession` `revokeDesignerSession` |
| `webhooks` | `list` `create` `update` `delete` `listDeliveries` |
| `workspaces` | `list` `create` `retrieve` `update` |

Full reference: [docs.seatlayer.io/server-api](https://docs.seatlayer.io/server-api/)

## Related resources

- [Server SDK guide](https://docs.seatlayer.io/server-sdk/install/)
- [Errors, retries and idempotency](https://docs.seatlayer.io/server-sdk/reliability/)
- [Webhook verification](https://docs.seatlayer.io/server-sdk/webhooks/)
- [Server API reference](https://docs.seatlayer.io/server-api/events/)
- [OpenAPI description](https://docs.seatlayer.io/openapi.json)
- [Agent-readable documentation](https://docs.seatlayer.io/llms.txt)
- [SeatLayer GitHub organization](https://github.com/seatlayer)

### Other SeatLayer SDKs

| Surface | Package |
|---|---|
| Browser (vanilla) | [`@seatlayer/js`](https://github.com/seatlayer/seatlayer-sdk) |
| React | [`@seatlayer/react`](https://github.com/seatlayer/seatlayer-sdk) |
| React Native | [`@seatlayer/react-native`](https://github.com/seatlayer/seatlayer-react-native) |
| iOS | [`seatlayer-ios`](https://github.com/seatlayer/seatlayer-ios) |
| Android | [`seatlayer-android`](https://github.com/seatlayer/seatlayer-android) |
| Flutter | [`seatlayer_flutter`](https://github.com/seatlayer/seatlayer-flutter) |
| Python (server) | [`seatlayer`](https://github.com/seatlayer/seatlayer-python) |
| PHP (server) | [`seatlayer/seatlayer-php`](https://github.com/seatlayer/seatlayer-php) |
| Java (server) | [`io.seatlayer:seatlayer-java`](https://github.com/seatlayer/seatlayer-java) |
| Go (server) | [`github.com/seatlayer/seatlayer-go`](https://github.com/seatlayer/seatlayer-go) |

## Development

```bash
pnpm install
pnpm validate   # typecheck, tests, build, publint + attw
```

## License

MIT
