# Changelog

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
