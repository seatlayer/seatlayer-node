import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhook, WebhookVerificationError } from '../src/index.js';

const SECRET = 'whsec_test';

function sign(payload: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

describe('verifyWebhook', () => {
  it('accepts a correctly signed delivery and returns the parsed payload', () => {
    const payload = JSON.stringify({ type: 'booking.created', occurrenceId: 'occ_1' });
    const event = verifyWebhook<{ type: string }>({
      payload,
      signature: sign(payload),
      secret: SECRET,
    });
    expect(event.type).toBe('booking.created');
  });

  it('accepts a Buffer body, which is what raw body parsers hand you', () => {
    const payload = JSON.stringify({ ok: true });
    const event = verifyWebhook({
      payload: Buffer.from(payload, 'utf8'),
      signature: sign(payload),
      secret: SECRET,
    });
    expect(event).toEqual({ ok: true });
  });

  it('rejects a body that was re-serialised rather than passed through raw', () => {
    // The classic integration bug: JSON.stringify(req.body) reorders or
    // reformats and the bytes no longer match what was signed.
    const original = '{"a":1,"b":2}';
    const reserialised = JSON.stringify(JSON.parse('{"b":2,"a":1}'));
    expect(() => verifyWebhook({
      payload: reserialised,
      signature: sign(original),
      secret: SECRET,
    })).toThrow(WebhookVerificationError);
  });

  it('rejects a signature made with the wrong secret', () => {
    const payload = '{"ok":true}';
    expect(() => verifyWebhook({
      payload,
      signature: sign(payload, 'whsec_other'),
      secret: SECRET,
    })).toThrow(/did not match/);
  });

  it('rejects a missing header rather than trusting the body', () => {
    expect(() => verifyWebhook({ payload: '{}', signature: null, secret: SECRET }))
      .toThrow(/Missing X-SeatLayer-Signature/);
  });

  it('rejects an unknown signature scheme', () => {
    expect(() => verifyWebhook({ payload: '{}', signature: 'md5=abc', secret: SECRET }))
      .toThrow(/Unsupported signature format/);
  });

  it('rejects a truncated signature without throwing on length mismatch', () => {
    const payload = '{"ok":true}';
    const short = sign(payload).slice(0, 20);
    expect(() => verifyWebhook({ payload, signature: short, secret: SECRET }))
      .toThrow(WebhookVerificationError);
  });

  it('requires a secret', () => {
    expect(() => verifyWebhook({ payload: '{}', signature: sign('{}'), secret: '' }))
      .toThrow(/signing secret is required/);
  });

  it('reports a verified-but-unparseable body distinctly', () => {
    const payload = 'not json';
    expect(() => verifyWebhook({ payload, signature: sign(payload), secret: SECRET }))
      .toThrow(/Signature verified but the body is not valid JSON/);
  });
});
