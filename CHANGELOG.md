# Changelog

## 0.7.0-season-s07.0 — unpublished candidate

- Freezes the private-beta support lane for every Season operation through S06:
  REST and Node source/candidate coverage are verified, while publication and
  production availability remain unverified.
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
- This candidate is retained out of band only. No package registry or
  production availability is claimed.

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
