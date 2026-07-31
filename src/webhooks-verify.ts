/**
 * Webhook signature verification.
 *
 * This is the single most security-sensitive thing an integrator writes by
 * hand, and the two classic mistakes are both easy to make and silent:
 *
 *   1. verifying against a re-serialised body (`JSON.stringify(req.body)`),
 *      which changes bytes and fails — or worse, is "fixed" by skipping
 *      verification entirely;
 *   2. comparing signatures with `===`, which leaks the expected value through
 *      timing.
 *
 * So the SDK does it, takes the RAW body, and compares in constant time.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyWebhookOptions {
  /**
   * The raw request body, exactly as received — a string or Buffer, never a
   * parsed object. Express: `express.raw({ type: 'application/json' })`.
   */
  payload: string | Uint8Array;
  /** The `X-SeatLayer-Signature` header value (`sha256=<hex>`). */
  signature: string | null | undefined;
  /** The signing secret from webhook creation. */
  secret: string;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Verify a delivery and return its parsed payload.
 *
 * Throws `WebhookVerificationError` on any failure — treat that as "this did
 * not come from SeatLayer" and respond 400 without processing it.
 *
 * NOTE ON REPLAY: deliveries are currently signed over the body only, with no
 * timestamp header and so no tolerance window. Replay protection is therefore
 * yours to enforce: every event carries an `occurrenceId`, and the correct
 * pattern is to record processed ids and ignore repeats. Do not skip this — a
 * captured delivery stays valid indefinitely.
 */
export function verifyWebhook<T = Record<string, unknown>>(options: VerifyWebhookOptions): T {
  const { payload, signature, secret } = options;

  if (!secret) throw new WebhookVerificationError('A webhook signing secret is required.');
  if (!signature) {
    throw new WebhookVerificationError('Missing X-SeatLayer-Signature header.');
  }

  const [scheme, provided] = signature.split('=');
  if (scheme !== 'sha256' || !provided) {
    throw new WebhookVerificationError(
      `Unsupported signature format ${JSON.stringify(signature)}; expected "sha256=<hex>".`,
    );
  }

  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  const expected = createHmac('sha256', secret).update(body).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  // timingSafeEqual throws on length mismatch, which would itself leak a bit;
  // check length first and fail the same way either way.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WebhookVerificationError('Webhook signature did not match.');
  }

  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch (cause) {
    throw new WebhookVerificationError(
      `Signature verified but the body is not valid JSON: ${(cause as Error).message}`,
    );
  }
}
