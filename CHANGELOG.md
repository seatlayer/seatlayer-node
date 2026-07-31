# Changelog

## 0.1.0 — unreleased

First release of the SeatLayer Node server SDK.

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
  `event:cancel`, which reverses paid bookings.
- Constructor rejects a `pk_` key by name rather than failing as a 401 later.
