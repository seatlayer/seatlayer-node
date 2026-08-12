# Changelog

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
  channel reporting, and buyer-access-session mint/list/revoke. Managed hosted
  access-link fulfilment is intentionally not exposed by this Platform resource.
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
- `createManageSession` requires explicit `capabilities`; the API's default grants
  `event:cancel`, which releases booked inventory.
- Constructor rejects a `pk_` key by name rather than failing as a 401 later.
