# SeatLayer Node.js Server SDK for Reserved Seating

[![CI](https://github.com/seatlayer/seatlayer-node/actions/workflows/ci.yml/badge.svg)](https://github.com/seatlayer/seatlayer-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@seatlayer/server?label=%40seatlayer%2Fserver)](https://www.npmjs.com/package/@seatlayer/server)
[![Node.js](https://img.shields.io/node/v/@seatlayer/server.svg)](https://www.npmjs.com/package/@seatlayer/server)
[![License: MIT](https://img.shields.io/badge/license-MIT-111827.svg)](LICENSE)

SeatLayer's official Node.js server SDK is the trusted side of its reserved seating and seat
booking API. Inspect what a hold really contains, price from server-owned seating-chart data,
and book with a stable `bookingRef`, while managing charts, events, inventory, allocations, and
webhooks through one typed ticketing API client.

[`@seatlayer/server` on npm](https://www.npmjs.com/package/@seatlayer/server) ·
[Node.js server SDK guide](https://docs.seatlayer.io/server-sdk/node/) ·
[SeatLayer SDK and API overview](https://seatlayer.io/developers/) ·
[SeatLayer JavaScript seat map SDK](https://www.npmjs.com/package/@seatlayer/js) ·
[Server API reference](https://docs.seatlayer.io/server-api/events/)

> **Server-side only.** This package authenticates with your secret key. Never bundle it into a
> browser, a mobile app, or anything a ticket buyer can open. Browser surfaces get short-lived,
> origin-bound tokens that you mint here — see [Embedding the control room](#embedding-the-control-room).

This SDK is the **Platform inventory** product. SeatLayer owns seating state, configured prices,
holds, booking concurrency, the inventory ledger, allocation reporting, and inventory webhooks.
Your platform owns its event catalogue, buyer accounts, payments, commercial Orders, tickets,
email/PDF delivery, refunds, scanning, and customer support. No booking method in this package
accepts buyer, payment, ticket, email, or refund data.

## Install the Node.js seat booking SDK

```bash
npm install @seatlayer/server
```

Requires Node 20.19.4 or newer. No runtime dependencies.

## Quick start

```ts
import { SeatLayer } from '@seatlayer/server';

const seatlayer = new SeatLayer(process.env.SEATLAYER_SECRET_KEY!);

// 1. Materialize a published catalog template as the organiser's draft chart.
// Replace this placeholder with a template id from your catalog.
const { meta: chart } = await seatlayer.templates.instantiateTemplate('your-published-template');
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

## Book reserved seats from Node.js

**Buyer picks seats in the browser.** Your frontend holds them; your backend confirms the price and
books. Never price from what the browser sent you — `retrieveHold` is the authoritative answer.

```ts
const hold = await seatlayer.inventory.retrieveHold(eventKey, holdId);
if (!hold.items.length) throw new Error('Hold has no items.');
const currency = hold.items[0]!.currency;
if (!hold.items.every((item) => item.currency === currency)) {
  throw new Error('A hold must use one currency.');
}
const total = hold.items.reduce((sum, item) => sum + item.unitPrice * (item.quantity ?? 1), 0);
// … charge `total` in `currency` …
await seatlayer.inventory.book(eventKey, { holdId, bookingRef: charge.id });
```

**Your backend picks the seats.** Phone orders, box office, comps. No browser involved.

```ts
// Payment already taken — book outright, so nothing is stranded if a second call fails.
await seatlayer.inventory.bookBestAvailable(eventKey, { qty: 2, bookingRef: 'phone-1183' });

// Or name the seats yourself.
await seatlayer.inventory.book(eventKey, { labels: ['A-1', 'A-2'], bookingRef: 'comp-14' });
```

`bookingRef` is your stable join between SeatLayer inventory and your own commercial order. The SDK
trims it, refuses an empty value before making a request, and echoes the normalized reference in
booking and cancellation results. It is not a SeatLayer Order id.

## Booking History

Booking History is the inventory ledger, not a commerce or fulfilment record. It contains labels,
category/section/channel attribution, quantities, configured-value snapshots, and lifecycle events.
It never contains buyer, payment, ticket, email, refund, or Door fields.

```ts
const page = await seatlayer.inventory.listBookings(eventKey, {
  q: 'A-12',
  state: 'booked',
  limit: 50,
});

const detail = await seatlayer.inventory.retrieveBooking(
  eventKey,
  page.bookings[0].bookingRef,
);
```

To release booked inventory, first update the commercial/refund state in your own system as your
workflow requires, then cancel with the same reference that booked it:

```ts
await seatlayer.inventory.unbook(eventKey, {
  labels: ['A-12'],
  bookingRef: 'order-8842',
});
```

SeatLayer releases inventory and records the lifecycle entry; it does not move or refund money,
void a platform-owned ticket, send an email/PDF, or update a platform-owned scanner.

## Fixed Renewable Seasons

Version `0.7.0` adds the trusted organizer-side `seatlayer.seasons` resource.

The resource includes identity-preserving reschedules, explicit replacement/cancellation
exceptions with immutable amendment revisions, allocation/report health,
missed-event replay, booking/holder support lookup, redacted audit, and a bounded
versioned support export. Webhook delivery is counted only after a receiver
returns 2xx; a replay request or queue enqueue is not reported as delivered.
Operational feeds are deliberately bounded and report `truncated`; use exact
resource reads for retained records. Only the top-level Season catalogue is
cursor-paginated in the `0.7.0` contract.

Use a test key and test Events to validate the complete fixed Plan before
creating anything. Validation is read-only and returns exact incompatibility
codes, Event fields, and remediation.

```ts
const checked = await seatlayer.seasons.validateSeason({
  eventKeys: ['ev_test_thursday_1', 'ev_test_thursday_2'],
});
if (!checked.valid) throw new Error(JSON.stringify(checked.issues));

const { season: draft } = await seatlayer.seasons.createSeason({
  name: 'Thursday series',
  edition: '2026–27',
  eventKeys: checked.eventKeys,
}, { idempotencyKey: 'season-2026-thursday' });

const activation = await seatlayer.seasons.activateSeason(draft.key, draft.revision);
const active = await seatlayer.seasons.waitForSeasonLifecycle(activation);
const plan = active.season.plans.find((candidate) => candidate.publicationState === 'draft')!;

const publication = await seatlayer.seasons.publishSeasonPlan(
  active.season.key,
  plan.key,
  active.season.revision,
);
const published = await seatlayer.seasons.waitForSeasonLifecycle(publication);
```

Activation does not publish a Plan, publication does not open sales, and the
audience remains `embed_only`. `openSeasonSales` deliberately returns a
conflict until the S04 buyer hold/book/cancel/webhook rehearsal record exists.
Create all additional fixed Plans while the Season is still a draft. Each Plan
is immutable after activation; published Plans can be superseded only while
sales are closed or ended.

A test Season is never promoted. `duplicateSeasonToLive` requires an explicit
set of compatible live Event keys, creates new Season and Plan identities, and
keeps sales closed. Lifecycle calls are single-attempt domain operations. If a
response is non-terminal, poll only its retained `Location` through
`waitForSeasonLifecycle`; do not invent a new action.

### Season buyer integration

Mint the exact-origin browser session from trusted server code, keep its `bss_`
token in memory, and pass it to the distinct JavaScript `SeasonPicker`. Before
charging, retrieve the Season hold and use its trusted allocation identity. It
contains Event, seat, category, optional tier, and quantity, but no commercial
amount: `pricingAuthority` is `"host"` and `authoritativeAmountIncluded` is
`false`. Calculate and charge the package price in your own trusted system.
Book and cancel with caller-stable identities; cancellation has no implicit
future-right policy.

```ts
const session = await seatlayer.seasons.createSeasonBuyerAccessSession(seasonKey, {
  allowedOrigin: 'https://tickets.example.com',
  includePublic: true,
});
const { hold } = await seatlayer.seasons.retrieveSeasonHold(seasonKey, operationId);
const booked = await seatlayer.seasons.bookSeasonHold(seasonKey, operationId, {
  bookActionId: 'sba_order_1183', bookingRef: 'order_1183',
});
await seatlayer.seasons.waitForSeasonBooking(seasonKey, booked);
await seatlayer.seasons.cancelSeasonBooking(seasonKey, 'sba_order_1183', {
  cancelActionId: 'sca_order_1183', bookingRef: 'order_1183',
  planActivationId: session.planActivationId, rightDisposition: 'preserve',
});
await seatlayer.seasons.validateSeasonBuyerRehearsal(seasonKey);
```

Rehearsal validation has no request body. SeatLayer automatically matches the
retained hold, booking, cancellation, and successful webhook deliveries, then
records an audit checkpoint. Do not copy internal action or subscription IDs
into an operator form.

Version `0.7.0` includes this retained-evidence validation path. A successful
validation opens inventory sales only; your platform remains responsible for
price, payment, orders, tax, refunds, tickets, and passes.

### Incumbent import and same-seat renewal

Dry-run the exact prior Contract/Plan/seat-set mapping before committing it.
Every row carries a caller-stable row id, opaque holder and prior Contract
references, and may retain the incumbent booking reference. Invalid or
conflicting rows do not create a Contract or Seat Right.

```ts
const importInput = {
  successorPlanActivationId: published.plan.activationId!,
  rows: [{
    rowId: 'row_ada',
    holderRef: 'holder_ada',
    priorPlanActivationId: 'spa_2026_saturday',
    priorContractRef: 'legacy_contract_ada',
    existingBookingRef: 'legacy_booking_ada',
    labels: ['A-12'],
  }],
};

const dryRun = await seatlayer.seasons.createSeasonHolderImport(
  seasonKey,
  { ...importInput, dryRun: true },
  { idempotencyKey: 'incumbents-2027-dry-run' },
);
if (dryRun.import.rejectedCount) throw new Error(JSON.stringify(dryRun.import.rows));

await seatlayer.seasons.createSeasonHolderImport(
  seasonKey,
  importInput,
  { idempotencyKey: 'incumbents-2027-commit' },
);
const deadlineAt = Date.parse('2027-06-30T23:59:59Z');
const { offers } = await seatlayer.seasons.createSeasonRenewalOffers(
  seasonKey,
  { successorPlanActivationId: importInput.successorPlanActivationId, deadlineAt },
  { idempotencyKey: 'renewal-offers-2027' },
);

// Browser intent is not payment. Inspect and commit only after your trusted
// host has made its commercial decision with the exact immutable Plan.
const inspected = await seatlayer.seasons.inspectSeasonRenewalOffer(seasonKey, offers[0]!.offerId);
const accepted = await seatlayer.seasons.commitSeasonRenewalOffer(seasonKey, inspected.offer.offerId, {
  commitActionId: 'sba_renewal_ada_2027',
  orderRef: 'order_ada_2027',
  bookingRef: 'booking_ada_2027',
  planActivationId: inspected.offer.successorPlanActivationId,
});
const terminal = await seatlayer.seasons.waitForSeasonRenewal(seasonKey, accepted);
if (terminal.offer.state === 'partial_terminal') reconcile(terminal.offer.commitOutcomes);
```

Renewal intent requires a browser session bound to the exact `buyerRef`/holder.
Extension is explicit and pre-lapse; no default extension is invented while
organizer bounds and permission policy remain an owner-open rollout decision.

## Private allocations

`seatlayer.channels` manages event allocations and mints short-lived buyer access for a browser.
A channel id is routing/reporting metadata, never authority. Authenticate the buyer in your own
backend, then mint an event- and origin-bound bearer:

```ts
const access = await seatlayer.channels.createBuyerAccessSession(eventKey, {
  channelIds: ['chn_partner_a'],
  includePublic: false,
  allowedOrigin: 'https://tickets.marketplace.example',
  buyerRef: 'buyer_318',
});

// Return only access.token + access.expiresAt to the browser. Never the secret key.
```

For a managed invitation URL, use `createAccessLink`, persist the show-once URL immediately, and
use `rotateAccessLink` or `revokeAccessLink` if it is misplaced. Channel reports use `bookedValue`
and `includesBookedValue` for configured-price snapshots; `revenue` and `includesRevenue` remain
deprecated response aliases for compatibility.

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

The raw API safely defaults an omitted list to view-only (`event:view`). The SDK deliberately
requires an explicit non-empty `capabilities` list so the browser authority is visible during code
review. Grant only what the page needs. Viewing, blocking, cancellation, reports, and channels are
Platform/SDK inventory work. `event:cancel` returns a Platform booking's inventory to sale but does
not move gateway money. Eligible Managed Ticketing refunds use the separate `event:refund`
capability.

The same pattern embeds the Designer in your own UI:

```ts
const { meta: chart } = await seatlayer.charts.create({ name: 'Riverside Theatre' });
const { session: designer } = await seatlayer.sessions.createDesignerSession({
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

**Retries and idempotency.** Reads retry 408, 429 and 5xx responses with backoff. Fourteen
mutations use exact header replay: `charts.create`, `charts.copy`, `templates.instantiateTemplate`,
`events.create`, `workspaces.create`, `performanceGroups.createPerformanceGroup`,
`seasons.createSeason`, `seasons.updateSeason`, `seasons.deleteSeason`, `seasons.createSeasonPlan`,
`seasons.duplicateSeasonToLive`, `seasons.createSeasonHolderImport`,
`seasons.createSeasonRenewalOffers`, and `seasons.createSeasonAmendment`. The SDK generates one
`Idempotency-Key` and reuses it for every attempt. All remaining SDK mutations are sent once; some
have a server-side domain idempotency contract, but the SDK does not retry them automatically.

**Booking safety.** Direct and box-office bookings have the server's exact-selection plus
`bookingRef` safeguard, but the SDK still sends them once. Holds, best-available operations,
show-once secret creation and raw mutations are also single-attempt; reconcile an unknown outcome
before trying again.

```ts
new SeatLayer({
  secretKey: process.env.SEATLAYER_SECRET_KEY!,
  maxRetries: 3,      // retries for reads and the 14 exact-header-replay mutations
  timeoutMs: 30_000,  // per attempt
});
```

## Escape hatch

For surface this SDK does not wrap yet. Raw reads retain retries; raw mutations are single-attempt
because the SDK cannot prove that an unknown operation supports exact replay:

```ts
await seatlayer.request('POST', '/v1/events/ev_1/some-new-route', { body: { … } });
```

## API surface

The client exposes these resources. Performance Groups cover runs, sessions, holds, and bookings;
Seasons cover catalogue, plan, sales, buyer-session, booking, renewal, occurrence, reporting,
outbox, and support operations.

| Resource | Methods |
| --- | --- |
| `charts` | `list` `listAll` `create` `retrieve` `update` `delete` `copy` `archive` `unarchive` `publish` |
| `templates` | `instantiateTemplate` |
| `events` | `list` `listAll` `create` `retrieve` `retrieveConfigurationBinding` `updateConfigurationBinding` `update` `delete` `updatePoster` `deletePoster` `updateChart` `close` `reopen` `archive` `retrieveHoldTtl` `updateHoldTtl` `listTicketReleases` `updateTicketReleases` `closeTicketRelease` `retrieveReport` `retrieveLog` |
| `inventory` | `hold` `holdBestAvailable` `bookBestAvailable` `extendHold` `retrieveHold` `release` `book` `boxOfficeBook` `unbook` `block` `unblock` `unblockAll` `retrieveAvailability` `updateAvailability` `listBookings` `retrieveBooking` `listInventoryBookings` `retrieveInventoryBooking` |
| `channels` | `listChannels` `createChannel` `updateChannel` `updateChannelAssignments` `listChannelAllocation` `retrieveChannelAccessPreview` `pauseChannel` `unpauseChannel` `archiveChannel` `retrieveChannelReport` `createBuyerAccessSession` `listBuyerAccessSessions` `revokeBuyerAccessSession` `createAccessLink` `listAccessLinks` `rotateAccessLink` `revokeAccessLink` |
| `sessions` | `createManageSession` `revokeManageSession` `createDesignerSession` `revokeDesignerSession` |
| `webhooks` | `list` `create` `update` `delete` `listDeliveries` |
| `workspaces` | `list` `create` `retrieve` `update` |
| `performanceGroups` | `listPerformanceGroups` `createPerformanceGroup` `retrievePerformanceGroup` `deletePerformanceGroup` `activatePerformanceGroup` `closePerformanceGroup` `retrievePerformanceGroupLifecycle` `createPerformanceGroupBuyerAccessSession` `listPerformanceGroupBuyerAccessSessions` `revokePerformanceGroupBuyerAccessSession` `retrievePerformanceGroupHold` `bookPerformanceGroupHold` `retrievePerformanceGroupBooking` |
| `seasons` | 48 organizer operations for catalogue and Plan lifecycle, sales windows, buyer access and booking, holder imports, renewals, occurrence amendments, reports, audit, outbox, and support export, plus polling helpers |

Full reference: [SeatLayer Server API](https://docs.seatlayer.io/server-api/events/)

## Frequently asked questions

### How do I book seats from Node.js?

Create a client with your secret key, obtain a hold id — either from the buyer's
browser session or by holding server-side — and call `inventory.book(eventKey, { holdId, bookingRef })`.
`bookingRef` is your own stable order id and is the join between SeatLayer
inventory and your commercial order, so the same reference identifies the booking
in Booking History and when you later cancel it. For phone orders, box office, and
comps, `inventory.bookBestAvailable` books outright with no browser involved.

### What does the server SDK do compared with the buyer SDK?

The buyer SDK runs where the ticket buyer is: it renders the interactive seating
chart, handles seat selection, and creates temporary holds. This server SDK is the
trusted side. It authenticates with your secret key, inspects what a hold actually
contains, prices from server-owned data, and books. Never bundle the secret key
into a browser or a mobile app — browser surfaces get short-lived, origin-bound
tokens that you mint here.

### How do temporary holds work server-side?

A hold reserves seats against concurrent buyers for a limited window.
`inventory.retrieveHold(eventKey, holdId)` is the authoritative answer for what is held
and at what price, so charge from its `items` rather than from anything the browser
sent you. When an order runs longer than the checkout window, `inventory.extendHold`
renews the hold instead of releasing and re-holding, which would hand the seats to
whoever is racing for them. Bookings carry the server's exact-selection plus
`bookingRef` safeguard, but the SDK sends each booking once — reconcile an unknown
outcome before trying again.

### Can I use my own payment provider?

Yes. This server SDK does not process payment in a Platform/SDK integration. Inspect the hold,
compute the charge from each returned item's authoritative `unitPrice`, `quantity`, and `currency`,
take the money through whichever provider you already use, and then book the hold with your order
id as `bookingRef`. SeatLayer owns seating state, holds, booking concurrency, and the inventory
ledger in this integration; your platform owns payments, commercial orders, tickets, delivery,
and refunds. Managed Ticketing is a separate product path with organizer-connected payments.

## Continue your Node.js integration

- [Follow the Node.js server SDK guide](https://docs.seatlayer.io/server-sdk/node/)
  for installation, authentication, and the full hold-to-booking flow.
- [Handle errors, retries, and safe booking repeats](https://docs.seatlayer.io/server-sdk/reliability/)
  before connecting a production order flow.
- [Verify SeatLayer webhooks](https://docs.seatlayer.io/server-sdk/webhooks/)
  to react to holds, expiry, and bookings on your server.
- [Browse the SeatLayer server API reference](https://docs.seatlayer.io/server-api/events/)
  for every endpoint behind this SDK.
- [Generate clients from the SeatLayer OpenAPI description](https://docs.seatlayer.io/openapi.json)
  or explore the raw API surface.
- [Point AI coding agents at the SeatLayer docs index](https://docs.seatlayer.io/llms.txt)
  (`llms.txt`) for an agent-readable map of the documentation.
- [Explore every SeatLayer SDK on GitHub](https://github.com/seatlayer)
  across web, mobile, and server.

### Other SeatLayer SDKs

| Surface | Package or source |
| --- | --- |
| JavaScript | [`@seatlayer/js`](https://www.npmjs.com/package/@seatlayer/js) |
| React | [`@seatlayer/react`](https://www.npmjs.com/package/@seatlayer/react) |
| React Native | [`@seatlayer/react-native`](https://www.npmjs.com/package/@seatlayer/react-native) |
| iOS | [`seatlayer-ios`](https://github.com/seatlayer/seatlayer-ios) |
| Flutter | [`seatlayer`](https://pub.dev/packages/seatlayer) |
| Android | [`seatlayer-android`](https://github.com/seatlayer/seatlayer-android) |
| Node.js (server) | [`@seatlayer/server`](https://www.npmjs.com/package/@seatlayer/server) (this package) |
| Python (server) | [`seatlayer`](https://pypi.org/project/seatlayer/) |
| PHP (server) | [`seatlayer/seatlayer-php`](https://packagist.org/packages/seatlayer/seatlayer-php) |
| Ruby (server) | [`seatlayer`](https://rubygems.org/gems/seatlayer) |
| .NET (server) | [`SeatLayer`](https://www.nuget.org/packages/SeatLayer) |
| Java (server) | [`io.seatlayer:seatlayer-java`](https://central.sonatype.com/artifact/io.seatlayer/seatlayer-java) |
| Go (server) | [`github.com/seatlayer/seatlayer-go`](https://pkg.go.dev/github.com/seatlayer/seatlayer-go) |

## Development

```bash
pnpm install
pnpm validate   # typecheck, tests, build, publint + attw
```

## License

MIT
