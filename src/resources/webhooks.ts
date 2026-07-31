import type { HttpClient } from '../http.js';
import type { Webhook } from '../types.js';

export class Webhooks {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  list(): Promise<{ webhooks: Webhook[] }> {
    return this.#http.get('/v1/webhooks');
  }

  create(params: { url: string; events: string[] }): Promise<{ webhook: Webhook; secret?: string }> {
    return this.#http.post('/v1/webhooks', { body: params });
  }

  update(webhookId: string, params: Partial<{ url: string; events: string[]; status: string }>): Promise<{ webhook: Webhook }> {
    return this.#http.patch(`/v1/webhooks/${encodeURIComponent(webhookId)}`, { body: params });
  }

  delete(webhookId: string): Promise<void> {
    return this.#http.delete(`/v1/webhooks/${encodeURIComponent(webhookId)}`);
  }

  listDeliveries(webhookId: string): Promise<{ deliveries: unknown[] }> {
    return this.#http.get(`/v1/webhooks/${encodeURIComponent(webhookId)}/deliveries`);
  }
}
