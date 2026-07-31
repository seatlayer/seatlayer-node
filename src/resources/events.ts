import type { HttpClient } from '../http.js';
import type { EventMeta } from '../types.js';

export class Events {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  list(options: { workspaceId?: string; externalRef?: string } = {}): Promise<{ events: EventMeta[] }> {
    return this.#http.get('/v1/events', {
      query: { workspaceId: options.workspaceId, externalRef: options.externalRef },
    });
  }

  create(params: {
    chartId: string;
    name?: string;
    slug?: string;
    startsAt?: number;
    venue?: string;
    externalRef?: string;
    /** Three-letter override. Defaults to the organisation currency. */
    currency?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<{ meta: EventMeta }> {
    return this.#http.post('/v1/events', { body: params, idempotencyKey: options.idempotencyKey });
  }

  retrieve(eventKey: string): Promise<{ meta: EventMeta; counts?: Record<string, number> }> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}`);
  }

  update(eventKey: string, params: Record<string, unknown>): Promise<{ meta: EventMeta }> {
    return this.#http.patch(`/v1/events/${encodeURIComponent(eventKey)}`, { body: params });
  }

  delete(eventKey: string): Promise<void> {
    return this.#http.delete(`/v1/events/${encodeURIComponent(eventKey)}`);
  }

  /** Move a live event onto the latest published version of its chart. */
  updateChart(eventKey: string): Promise<unknown> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/update-chart`);
  }

  /** Stop buyer sales. Existing holds keep their TTL. */
  close(eventKey: string): Promise<unknown> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/close`);
  }

  reopen(eventKey: string): Promise<unknown> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/reopen`);
  }

  archive(eventKey: string): Promise<unknown> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/archive`);
  }

  /** Read the checkout window (ms) buyers get for this event. */
  retrieveHoldTtl(eventKey: string): Promise<{ holdTtlMs: number }> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/hold-ttl`);
  }

  updateHoldTtl(eventKey: string, holdTtlMs: number): Promise<unknown> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/hold-ttl`, {
      body: { holdTtlMs },
    });
  }

  retrieveReport(eventKey: string): Promise<unknown> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/report`);
  }

  retrieveLog(eventKey: string): Promise<unknown> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/log`);
  }
}
