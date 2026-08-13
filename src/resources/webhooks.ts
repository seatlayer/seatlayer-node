import type { HttpClient } from '../http.js';
import type { Webhook, WebhookDelivery, WebhookEventName } from '../types.js';

export class Webhooks {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  list(): Promise<{ subs: Webhook[] }> {
    return this.#http.get('/v1/webhooks');
  }

  create(params: { url: string; events: WebhookEventName[] }): Promise<{ sub: Webhook; secret: string }> {
    return this.#http.post('/v1/webhooks', { body: params });
  }

  update(
    webhookId: string,
    params: Partial<{ url: string; events: WebhookEventName[]; disabled: boolean }>,
  ): Promise<{ sub: Webhook }> {
    return this.#http.patch(`/v1/webhooks/${encodeURIComponent(webhookId)}`, { body: params });
  }

  delete(webhookId: string): Promise<{ ok: true }> {
    return this.#http.delete(`/v1/webhooks/${encodeURIComponent(webhookId)}`);
  }

  listDeliveries(webhookId: string, options: {
    limit?: number;
    status?: 'ok' | 'failed';
    before?: number;
  } = {}): Promise<{ deliveries: WebhookDelivery[]; nextBefore?: number }> {
    return this.#http.get(`/v1/webhooks/${encodeURIComponent(webhookId)}/deliveries`, {
      query: options,
    });
  }
}
