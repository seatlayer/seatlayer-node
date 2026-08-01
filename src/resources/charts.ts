import type { HttpClient } from '../http.js';
import type { Chart, ChartMeta } from '../types.js';

export interface ChartListOptions {
  workspaceId?: string;
  externalRef?: string;
  archived?: boolean;
  /** Page size. Clamped server-side; asking for more is not an error. */
  limit?: number;
  cursor?: string;
}

export interface ChartPage {
  charts: ChartMeta[];
  /** Absent once the list is exhausted. */
  nextCursor?: string;
}

/**
 * Charts are the seat-map definitions events are created from.
 *
 * If your organisers draw their own venues in the embedded Designer, you still
 * need this: `createDesignerSession` requires a chartId that must already
 * exist, so the usual platform flow is copy a template here, then hand the
 * organiser a Designer session for it.
 */
export class Charts {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * One page of charts. Pass `cursor` from the previous page's `nextCursor`;
   * its absence means the list is exhausted.
   */
  list(options: ChartListOptions = {}): Promise<ChartPage> {
    return this.#http.get('/v1/charts', {
      query: {
        workspaceId: options.workspaceId,
        externalRef: options.externalRef,
        limit: options.limit,
        cursor: options.cursor,
        ...(options.archived ? { archived: '1' } : {}),
      },
    });
  }

  /**
   * Every chart, paging transparently.
   *
   * An async iterator rather than an array: the whole point of paginating was
   * to stop loading an unbounded list into memory, and returning `ChartMeta[]`
   * would hand that problem straight back to the caller.
   *
   *   for await (const chart of seatlayer.charts.listAll()) { … }
   */
  async *listAll(options: Omit<ChartListOptions, 'cursor'> = {}): AsyncGenerator<ChartMeta> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...options, cursor });
      for (const chart of page.charts) yield chart;
      cursor = page.nextCursor;
    } while (cursor);
  }

  create(params: {
    name: string;
    doc?: Record<string, unknown>;
    externalRef?: string;
    workspaceId?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<{ meta: ChartMeta }> {
    return this.#http.post('/v1/charts', { body: params, idempotencyKey: options.idempotencyKey });
  }

  retrieve(chartId: string): Promise<Chart> {
    return this.#http.get(`/v1/charts/${encodeURIComponent(chartId)}`);
  }

  /**
   * Replace a chart document.
   *
   * `expectedUpdatedAt` is required by the API for optimistic concurrency and
   * is not optional here either: without it two concurrent writers silently
   * overwrite each other, and a seat map is exactly the kind of document where
   * that loses work. Read it from `retrieve()` immediately before writing.
   *
   * The Designer is the authoring surface. Reach for this for bulk programmatic
   * edits and migrations, not for drawing.
   */
  update(chartId: string, params: {
    doc: Record<string, unknown>;
    expectedUpdatedAt: number;
    name?: string;
  }): Promise<{ meta: ChartMeta }> {
    return this.#http.put(`/v1/charts/${encodeURIComponent(chartId)}`, { body: params });
  }

  delete(chartId: string): Promise<void> {
    return this.#http.delete(`/v1/charts/${encodeURIComponent(chartId)}`);
  }

  /** Copy a chart — the usual way to provision a venue from a template. */
  copy(chartId: string, options: { idempotencyKey?: string } = {}): Promise<{ meta: ChartMeta }> {
    return this.#http.post(`/v1/charts/${encodeURIComponent(chartId)}/duplicate`, {
      idempotencyKey: options.idempotencyKey,
    });
  }

  archive(chartId: string): Promise<{ meta: ChartMeta }> {
    return this.#http.post(`/v1/charts/${encodeURIComponent(chartId)}/archive`);
  }

  unarchive(chartId: string): Promise<{ meta: ChartMeta }> {
    return this.#http.post(`/v1/charts/${encodeURIComponent(chartId)}/unarchive`);
  }

  /** Publish the draft. An event can only be created from a published chart. */
  publish(chartId: string): Promise<{ meta: ChartMeta }> {
    return this.#http.post(`/v1/charts/${encodeURIComponent(chartId)}/publish`);
  }
}
