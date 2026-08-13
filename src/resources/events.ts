import type { HttpClient } from '../http.js';
import type {
  ArchiveEventResult,
  EventCounts,
  EventDetail,
  EventEnvelope,
  EventLogPage,
  EventMeta,
  EventReportEnvelope,
  EventSectionState,
  KeyMode,
  SalesAliasResult,
} from '../types.js';

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
  events: Array<EventMeta & { sold: number; counts?: EventCounts }>;
  /** Absent once the list is exhausted. */
  nextCursor?: string;
}

export interface EventChartUpdateResult {
  ok: boolean;
  updated: boolean;
  meta: EventMeta;
}

interface EventUpdateFields {
  name: string;
  startsAt: number | null;
  venue: string | null;
  externalRef: string | null;
  currency: string | null;
  description: string | null;
  endsAt: number | null;
  timezone: string | null;
  locale: string | null;
  sectionStates: Record<string, EventSectionState>;
}

/** Event updates must contain at least one supported field. */
export type EventUpdateParams = {
  [K in keyof EventUpdateFields]: Pick<EventUpdateFields, K> & Partial<Omit<EventUpdateFields, K>>;
}[keyof EventUpdateFields];

/** Raw image input accepted by fetch; Node Buffers satisfy ArrayBufferView. */
export type PosterImage = Blob | ArrayBuffer | ArrayBufferView;

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
    startsAt?: number | null;
    venue?: string | null;
    externalRef?: string | null;
    /** Three-letter override. Defaults to the organisation currency. */
    currency?: string | null;
    description?: string | null;
    endsAt?: number | null;
    /** IANA time-zone name used to render local event times. */
    timezone?: string | null;
    /** Event-specific BCP-47 language tag. */
    locale?: string | null;
    /** A poster previously staged through the API. */
    posterAssetId?: string | null;
    /** A secret-key client is always pinned to its own mode. */
    mode?: KeyMode;
  }, options: { idempotencyKey?: string } = {}): Promise<EventEnvelope> {
    return this.#http.postWithHeaderReplay('/v1/events', {
      body: params,
      idempotencyKey: options.idempotencyKey,
    });
  }

  retrieve(eventKey: string): Promise<EventDetail> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}`);
  }

  update(eventKey: string, params: EventUpdateParams): Promise<EventEnvelope> {
    return this.#http.patch(`/v1/events/${encodeURIComponent(eventKey)}`, { body: params });
  }

  delete(eventKey: string): Promise<{ ok: true }> {
    return this.#http.delete(`/v1/events/${encodeURIComponent(eventKey)}`);
  }

  /** Upload raw PNG, JPEG, or WebP bytes. The API validates magic bytes. */
  updatePoster(eventKey: string, image: PosterImage): Promise<EventEnvelope> {
    return this.#http.put(`/v1/events/${encodeURIComponent(eventKey)}/poster`, {
      rawBody: image as NonNullable<RequestInit['body']>,
    });
  }

  deletePoster(eventKey: string): Promise<EventEnvelope> {
    return this.#http.delete(`/v1/events/${encodeURIComponent(eventKey)}/poster`);
  }

  /** Move a live event onto the latest published version of its chart. */
  updateChart(eventKey: string, params: {
    acknowledgeDroppedAssignments?: boolean;
    reason?: string;
  } = {}): Promise<EventChartUpdateResult> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/update-chart`, { body: params });
  }

  /** Stop buyer sales. Existing holds keep their TTL. */
  close(eventKey: string): Promise<SalesAliasResult> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/close`);
  }

  reopen(eventKey: string): Promise<SalesAliasResult> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/reopen`);
  }

  archive(eventKey: string): Promise<ArchiveEventResult> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/archive`);
  }

  /** Read the checkout window (ms) buyers get for this event. */
  retrieveHoldTtl(eventKey: string): Promise<{ holdTtlMs: number | null }> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/hold-ttl`);
  }

  updateHoldTtl(eventKey: string, holdTtlMs: number | null): Promise<{
    ok: true;
    holdTtlMs: number | null;
  }> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/hold-ttl`, {
      body: { holdTtlMs },
    });
  }

  retrieveReport(eventKey: string): Promise<EventReportEnvelope> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/report`);
  }

  retrieveLog(eventKey: string, options: { limit?: number; before?: number } = {}): Promise<EventLogPage> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/log`, { query: options });
  }
}
