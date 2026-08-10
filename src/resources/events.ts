import type { HttpClient } from '../http.js';
import type { EventMeta, EventReportResult } from '../types.js';

export interface EventListOptions {
  workspaceId?: string;
  externalRef?: string;
  /** Page size. Clamped server-side; asking for more is not an error. */
  limit?: number;
  cursor?: string;
  /** Include live availability counts. One server round-trip per event. */
  counts?: boolean;
}

export interface EventPage {
  events: EventMeta[];
  /** Absent once the list is exhausted. */
  nextCursor?: string;
}

export class Events {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * One page of events. Pass `cursor` from the previous page's `nextCursor`.
   *
   * Live availability `counts` cost one round-trip per event server-side. They
   * are included by default because most callers want them; pass
   * `counts: false` when paging a whole catalogue, where you almost certainly
   * do not.
   */
  list(options: EventListOptions = {}): Promise<EventPage> {
    return this.#http.get('/v1/events', {
      query: {
        workspaceId: options.workspaceId,
        externalRef: options.externalRef,
        limit: options.limit,
        cursor: options.cursor,
        ...(options.counts === false ? { counts: '0' } : {}),
      },
    });
  }

  /**
   * Every event, paging transparently. Defaults to `counts: false` — you are
   * walking the whole list, so per-event availability is rarely what you want
   * and always what it costs.
   *
   *   for await (const event of seatlayer.events.listAll()) { … }
   */
  async *listAll(options: Omit<EventListOptions, 'cursor'> = {}): AsyncGenerator<EventMeta> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ counts: false, ...options, cursor });
      for (const event of page.events) yield event;
      cursor = page.nextCursor;
    } while (cursor);
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

  retrieveReport(eventKey: string): Promise<EventReportResult> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/report`);
  }

  retrieveLog(eventKey: string): Promise<unknown> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/log`);
  }
}
