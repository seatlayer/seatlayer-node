# Changelog

## Unreleased

- Adds 39 Season operations (87 in all): performances and package prices,
  `publishSeason`, checkout tests, import from a previous season, occurrence
  inventory returns and reclaims, the holder list, season order refunds and
  cancellations, hosted renewal links, contacts and notices, renewal quotes,
  intents and checkouts, sales and seat reports, holder and order CSV exports,
  bulk refunds with their jobs, and the release of lapsed renewal offers.
- Adds `holders` (customers, holders, holder tickets, ticket transfers),
  `orders` (orders across events and seasons, and one event's orders, refunds,
  cancellations and resends), and `eventSeries` resources.
- Adds `holders.createHolderReturn`: give back a holder's seat on one date, one
  per ticket (`HolderReturn`, `HolderReturnTicket`, `CreateHolderReturnParams`).
- Adds 14 event sales operations to `events`: buyer checkout choice, payment
  gateway, sales readiness, preflight and transitions, booking fee, and
  discount codes.
- 27 of the new mutations use exact header replay (41 in all) and reuse one
  `Idempotency-Key` across retries; the others are sent once. CSV exports
  resolve with the CSV text; `deleteSeasonPlan` and `deleteEventDiscountCode`
  resolve with nothing.
- Adds 10 webhook event names to `WebhookEventName`: `series.created`,
  `series.dates_added`, `order.paid`, `order.refunded`, `order.cancelled`,
  `customer.created`, `customer.email_changed`, `season.ticket.transfer_sent`,
  `season.ticket.transferred`, and `season.ticket.transfer_cancelled`.
- Adds `seasons.refundSeasonPerformance` (refund every order of a cancelled date as a job, with
  header replay), `seasons.listSeasonBulkJobs`, and `seasons.retrieveSeasonBulkJob`
  (`SeasonBulkJob`, `SeasonBulkJobDetail`, `RefundSeasonPerformanceParams`).
- Adds price types: `priceTypeKey` on `replaceSeasonPackagePrices` rows (`SeasonPackagePriceInput`,
  `SeasonPriceTypeKey`), `priceTypeKey` and `priceTypeLabel` on every `SeasonPackagePrice`,
  `priceTypeKey` on each `SeasonHoldItem`, and `seats` with `priceTypeKey` on a retrieved or
  inspected `SeasonRenewalOffer`.
- `createSeasonAmendment` takes `kind: 'postpone' | 'cancel'` with `refund` and `reason`
  (`CreateSeasonAmendmentParams`) and resolves with the `refundJob` a refunding cancel starts.
- `SeasonAmendment.kind` adds `postpone`, `cancel`, `performance_added`, `performance_removed`, and
  `performance_past` (`SeasonAmendmentKind`).
- `updateSeason` takes `checkoutMode`, `transferCutoffHours`, and `returnCutoffHours`
  (`UpdateSeasonParams`).
- `SeasonHolderImportRow` takes `holderEmail` and `holderName`.
- `WebhookEventName` lists all 56 public event names, adding `object.resale.*`,
  `season.occurrence.*`, `season.performance.*` (including `postponed`, `cancelled`, and
  `rescheduled`), `season.bulk_action.completed`, `season.order.*`, `season.ticket.issued`, and
  `season.ticket.voided`.
- `events.list` and `events.listAll` take `seriesKey` to list one event series' dates.
- Adds `seasons.retrieveSeasonRenewalQuote`: what renewing an offer costs, and whether SeatLayer checkout can take it now (`SeasonRenewalQuote`, `SeasonRenewalQuoteProblem`).
- Adds `seasons.createSeasonRenewalIntent`: record a holder's intent for a renewal taken by phone or at the box office, so your own checkout can commit.
- Adds `seasons.createSeasonRenewalCheckout`: a SeatLayer checkout that renews an offer with no hosted page, with header replay (`SeasonRenewalCheckoutParams`, `SeasonRenewalCheckoutStarted`).
- Adds `holders.createHolderRenewalCheckout`: the same checkout for one of a holder's offers, with header replay.
- Adds `holders.declineHolderRenewalOffer`: decline one of a holder's offers, with an optional `reason`.
- `declineSeasonRenewalOffer` takes an optional `{ reason }` (`DeclineSeasonRenewalOfferParams`), and `SeasonRenewalOffer` has `declineReason`.
- `Season` carries `checkoutMode`, `transferCutoffHours`, and `returnCutoffHours`, and `audience` is `'embed_only' | 'public'`; `updateSeason` takes `audience`.
- `openSeasonSales` resolves with `warnings` (`SeasonSalesOpenResult`): `checkout_test_missing` until a checkout test or rehearsal has passed. It can also refuse with `409 plan_not_published` or `409 checkout_mode_not_chosen`.
- A cancelled date refunds per date only: `createSeasonAmendment`'s `refund` is `'none' | 'per_date'`, and `refundSeasonPerformance` takes `amount: 'per_date'` (`full` answers `422 date_refund_per_date_only`; refund a whole order with the order refund).
- `SeasonHolder.status` adds `reserved` (an imported holder with seats and no offer yet).
- `retrieveSeasonHostedRenewals` readiness carries `missingPrices` with `prices_missing`.
- `addEventSeriesDates` takes `{ retryFailed: true }` to make the failed dates again (`409 series_busy`, `422 nothing_to_retry`).
- `Order` has `holderRef` and `customerId`, and `buyer.email` is nullable (a box office sale with no email); `listOrders` takes `holderRef`.
- Season holds, give-backs, and date cancels can refuse with `performance_cancelled`, `refund_not_started` (503), `missing_manage_capability` (403), or `invalid_refund`.
- `createEventSeries` takes `{ fromEventKey, schedule }` (`CreateEventSeriesFromEventParams`): the event becomes the first date under its own key, and every other date is a copy of it. It refuses with `404 event_not_found`, or `422 event_has_no_date`, `event_in_season`, `event_in_performance_group`, `event_in_series` or `invalid_request`.
- Every date of an event series carries the series' plain name (`Hamlet`, not `Hamlet · 3 Nov`); tell dates apart by `startsAt`. `updateEventSeries` renames each date that carries the series name, and a series name cannot hold `{n}`, `{date}` or `{time}`.
- Adds `seasons.releaseSeasonLapsedOffers`: release the seats of every lapsed renewal offer as a job (202 `{ job }`), with header replay. An offer extended before its turn is skipped and keeps its seat. It can refuse with `503 job_busy` or `season_not_configured`; send it again.
- `retrieveSeasonHostedRenewals` and `listSeasonRenewalOffers` page, newest first: pass `{ cursor, limit }` (`SeasonRenewalOfferPageOptions`; `limit` 1-500 and 1-100), and each page carries `nextCursor`, null on the last. A bad cursor or limit answers `400 invalid_cursor` or `invalid_limit`.
- `createSeasonRenewalOffers` resolves with `{ offers }` for 100 contracts or fewer, and with `{ job, batchId }` (`SeasonRenewalOfferJob`, a 202) above that: a `renewal_run` job makes the offers. Follow it with `retrieveSeasonBulkJob`, then page the offers with `listSeasonRenewalOffers`.
- `createSeasonHolderImportFromSeason` resolves with `{ job }` (a 202) when a commit brings across more than 100 holders: a `holder_import` job, whose `summary` has the same counts when it completes. `SeasonBulkJobKind` adds `holder_import`, and `SeasonBulkJobDetail` has `summary`. Both creates can refuse with `409 job_mismatch` or `503 season_not_configured`, and the bring-across with `503 job_busy`.
- `createSeasonRenewalNotices` takes up to 20,000 offer ids; more answers `422 too_many_offer_ids`.

## 0.8.0 (2026-09-10)

- Added Event hosting regions: `region` on `events.create`, the `EventHostingRegion` type, `defaultRegion` on workspace create and update, and `region` on every Event read back (null on older Events). Events created without a region run in Western Europe.

## 0.7.0 — 2026-08-30

- Adds all 48 Fixed Renewable Season operations across catalogue, lifecycle,
  Plans and sales, trusted buyer handoff, renewals, amendments, recovery,
  outbox, audit, and support.
- Types bounded operational feeds explicitly: renewal offers and amendments
  return the latest 100, operations the latest 50, and outbox the latest 100;
  each response reports `truncated`. The top-level Season catalogue retains its
  opaque cursor contract.
- Retains typed rate-limit failures, stable request IDs, exact mutation replay
  policies, and bounded/cancellable `202` wait helpers that honor `Location`
  and `Retry-After`.
- Makes the commerce boundary explicit on Season holds with
  `pricingAuthority: "host"` and `authoritativeAmountIncluded: false`; allocation
  items carry seat/Event identity only. Buyer rehearsal validation now sends no
  evidence body because SeatLayer discovers the retained hold, booking,
  cancellation, and delivered webhook chain automatically.

## 0.7.0-season-s06.0 — unpublished candidate

- Adds typed occurrence amendments with immutable revisions and retained
  Contract/allocation outcomes, operational reports, support lookup, missed-event
  replay, redacted audit, and versioned support export resources.
- Outbox replay preserves the original occurrence identity and payload. Delivery
  health means at least one real receiver returned 2xx; enqueue alone is not success.
- This candidate is retained out of band only. No package registry or production
  availability is claimed.

## 0.7.0-season-s05.0 — unpublished candidate

- Adds typed incumbent holder import dry-run/commit/status mapping with retained
  prior Plan activation, prior Contract, existing booking, row decision,
  Contract, and Seat Right identities.
- Adds generate/list/read/inspect/extend/commit/decline/release renewal-offer
  operations plus bounded polling of the exact committing offer.
- Preserves explicit `partial_terminal` allocation outcomes and caller-stable
  commit/order/booking identities; browser intent remains outside the trusted
  server SDK and is never purchase proof.
- This candidate is retained out of band only. No package registry or
  production availability is claimed.

## 0.7.0-season-s04.0 — unpublished candidate

- Adds the typed `seasons` organizer resource for compatibility validation,
  draft catalogue and multi-Plan management, structural activation/close/archive,
  immutable Plan publication/supersession, separate sales controls, test-to-live
  recreation, and bounded lifecycle polling.
- Header-replay mutations retain one idempotency key across transport retries;
  domain-exact lifecycle and sales actions remain single-attempt.
- Adds the S04 trusted buyer-integration resource: show-once Season session
  mint/list/revoke, authoritative hold inspection, caller-stable book/cancel,
  bounded booking polling, and retained rehearsal validation. Cancellation
  requires an explicit `preserve` or `release` right disposition.
- This is a locally built validation candidate only. No package registry or
  production availability is claimed.

## 0.6.1

- Documentation only. Refreshes the README, adds frequently asked
  questions, and aligns package metadata. No API or behaviour changes.

## 0.6.0 — 2026-08-23

- Added exact immutable Event configuration binding reads and compare-and-set
  attach/detach through `Events.retrieveConfigurationBinding` and
  `Events.updateConfigurationBinding`. Updates remain deliberately
  single-attempt.

## 0.5.1 — 2026-08-21

- `PerformanceGroupHold` now types the fields a host decides to charge on:
  `active`, `expiresAt`, `decision`, `holdId`, `groupId`, `createdAt`,
  `convergedAt`, `expiredAt`, `buyerSessionId`, `selectionMode`, `buyerRef` and
  `partnerRef`. They were always in the response but reached callers only
  through the index signature, so TypeScript could not point at `active` — the
  one field that says whether a committed hold has already expired and must not
  be booked.

## 0.5.0 — 2026-08-21

- Added `performanceGroups`, the trusted server resource for fixed two-to-eight
  performance runs. It creates and activates groups, mints one-time browser
  access, retrieves authoritative group holds, and confirms bookings with
  stable action and order references. Browser-only group routes remain outside
  this secret-key SDK.

- Added template instantiation and ticket-release management (`Templates.instantiateTemplate`,
  `Events.listTicketReleases`, `Events.updateTicketReleases`, and
  `Events.closeTicketRelease`). Template instantiation uses exact header replay;
  release replacement and close deliberately remain single-attempt.

- **Security/reliability:** Mutations now default to a single attempt. Automatic header-replay
  retries are limited to chart create/copy, template instantiation, event create, and workspace create, preventing
  transient failures from duplicating holds or best-available results and from issuing extra
  show-once credentials.
- **API contracts:** Booking and cancellation now require a non-empty `bookingRef`; chart copy
  accepts the server's optional name, external-reference, and workspace overrides; webhook
  management uses the runtime `subs`/`sub` envelopes; and chart/event metadata types match the
  fields returned by the API. Existing calls now expose event-create metadata, hold inspection,
  allocation scope, channel acknowledgements, timed blocks, nullable hold TTLs, typed availability,
  and webhook-delivery pagination. Manage and Designer session responses match their runtime
  envelopes; manage sessions include every supported capability while retaining the SDK's explicit
  least-privilege requirement.
- **Parity surface:** Added raw event poster upload/removal, booking-history list/detail, and the
  channel report. Event detail/lifecycle/report/log, channel preview/archive, and hosted-link
  rotation/revocation now expose their documented response types. Selected-label holds and
  best-available holds return their distinct contracts, and box-office booking rejects a blank
  `bookingRef` before network I/O.
- **Error contract:** Typed API failures consistently expose status, stable code, the full decoded
  body, and `X-Request-ID`; non-JSON failures fall back to the base API error, and unsafe mutations
  remain single-attempt even when rate limited.

## 0.2.0 — 2026-08-12

- Establish the Platform inventory boundary: booking, cancellation, reporting,
  and webhooks contain no SeatLayer-owned buyer, payment, commercial Order,
  ticket, email/PDF, refund, Door, or customer-support workflow.
- Require a caller-owned `bookingRef` for every booking and cancellation. The
  SDK normalizes and echoes it so callers can reconcile inventory with their
  own order ledger safely.
- Add typed `inventory.listBookings` and `inventory.retrieveBooking` helpers
  for inventory Booking History, including immutable configured-value and
  lifecycle snapshots. Public-manifest operation-id aliases are also exported.
- Add `channels` for channel CRUD, versioned allocations, access previews,
  channel reporting, and buyer-access-session mint/list/revoke.
- Use `bookedValue` and `includesBookedValue` as the canonical configured-price
  reporting fields. `bookedRevenue`, `revenue`, and `includesRevenue` remain
  deprecated response aliases for compatibility.
- Deprecate `inventory.boxOfficeBook`; Platform callers should use
  `inventory.book({ labels, bookingRef })`. Managed box-office commerce does not
  belong to this SDK.

## 0.1.0

First release of the SeatLayer Node server SDK.

- `inventory.extendHold` — keep a server-side hold alive past the checkout window.
- `charts.list` / `events.list` take `limit` and `cursor`; `listAll()` pages transparently as an
  async iterator and skips the per-event availability fanout.
- `SeatLayer` client with secret-key auth, per-attempt timeouts, and a typed escape hatch.
- Resources: `charts`, `events`, `inventory`, `sessions`, `webhooks`, `workspaces`.
- Automatic `Idempotency-Key` on every mutation, reused across retries so a retried
  booking cannot become two bookings.
- Retries on 429/408/5xx with exponential backoff and full jitter; honours `Retry-After`.
  4xx is never retried.
- Typed errors: `SeatLayerAuthError` (with `isModeMismatch`), `SeatLayerConflictError`
  (with `conflicts` and `isSoldOut`), `SeatLayerRateLimitError`, `SeatLayerValidationError`,
  `SeatLayerNotFoundError`, `SeatLayerConnectionError`.
- `verifyWebhook` — raw-body HMAC-SHA256 verification with constant-time comparison.
- `createManageSession` requires explicit `capabilities`.
- Constructor rejects a `pk_` key by name rather than failing as a 401 later.
