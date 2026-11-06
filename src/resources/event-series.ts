import type { HttpClient } from '../http.js';
import type { KeyMode } from '../types.js';

/** A repeat rule. Dates and times are local to the series time zone. */
export interface EventSeriesSchedule {
  rule: 'none' | 'daily' | 'weekly' | 'biweekly' | 'dates';
  from?: string;
  until?: string;
  count?: number;
  times: string[];
  skip?: string[];
  dates?: string[];
}

export interface EventSeriesJobSummary {
  jobId: string;
  state: string;
  total: number;
  done: number;
  failed: number;
  [key: string]: unknown;
}

export interface EventSeries {
  seriesKey: string;
  name: string;
  chartKey: string;
  timezone: string;
  state: 'creating' | 'ready' | 'partial' | 'failed';
  dateCount: number;
  firstEventKey: string | null;
  job: EventSeriesJobSummary | null;
  mode: KeyMode;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

/** A series planned on a published floor plan. Every date carries `name` as its name. */
export interface CreateEventSeriesFromPlanParams {
  name: string;
  chartKey: string;
  schedule: EventSeriesSchedule;
  timezone?: string;
  venue?: string;
  durationMinutes?: number;
  /** Plan the dates without creating anything. */
  dryRun?: boolean;
}

/**
 * A series made from an event you already set up. The event becomes the first
 * date under its own key, and every other date is a copy of it: floor plan,
 * prices, checkout, payment account, poster, booking form and its own seat
 * blocks, but none of its orders, holds, sales or reservations. The series
 * takes the event's name, zone and floor plan.
 */
export interface CreateEventSeriesFromEventParams {
  fromEventKey: string;
  schedule: EventSeriesSchedule;
  /** Optional; when sent it must be the event's own name. */
  name?: string;
  /** Optional; when sent it must be the event's own zone. */
  timezone?: string;
  /** List every date the series would hold, the event included, without creating anything. */
  dryRun?: boolean;
}

export type CreateEventSeriesParams = CreateEventSeriesFromPlanParams | CreateEventSeriesFromEventParams;

export interface EventSeriesCreated {
  series: EventSeries;
  jobId: string;
  [key: string]: unknown;
}

export interface EventSeriesListOptions {
  /** Page size. Defaults to 50 and is capped at 100. */
  limit?: number;
  cursor?: string;
}

export interface EventSeriesPage {
  series: EventSeries[];
  /** Absent once the list is exhausted. */
  nextCursor?: string;
  [key: string]: unknown;
}

export interface EventSeriesDetail {
  series: EventSeries;
  events: Array<{
    key: string;
    name: string;
    startsAt: number | null;
    seriesKey: string | null;
    [key: string]: unknown;
  }>;
  job: (EventSeriesJobSummary & {
    failedDates: Array<{ moment: string; error: string | null; [key: string]: unknown }>;
  }) | null;
  [key: string]: unknown;
}

/** Add dates from another repeat rule, or from an explicit list. */
/**
 * New dates by schedule, by exact moments, or `{ retryFailed: true }` to make
 * again every date that failed to be made (up to 100, as in `job.failedDates`).
 */
export type AddEventSeriesDatesParams = { schedule: EventSeriesSchedule } | { dates: string[] } | { retryFailed: true };

export interface EventSeriesDatesAdded {
  jobId: string;
  added: number;
  [key: string]: unknown;
}

export interface UpdateEventSeriesParams {
  name?: string;
  /**
   * Only the categories whose price changes (for a tiered category, only the tiers sent), each as
   * `PUT /v1/events/:key/pricing` takes it. Every price left out keeps each date's own value.
   */
  prices?: {
    categories: Array<{
      key: string;
      price?: number | null;
      tiers?: Array<{ id: string; price: number }>;
    }>;
  };
  /**
   * `on` never opens a date its season cancelled: that date is a failed item of the job
   * (`season_date_cancelled`), counted in `job.failed` but not in `failedDates`, which are the
   * dates that could not be made. The run's other dates open.
   */
  sales?: 'on' | 'off';
}

export interface EventSeriesUpdated {
  series: EventSeries;
  jobId: string | null;
  job: (EventSeriesJobSummary & { skipped: number }) | null;
  [key: string]: unknown;
}

/**
 * Event series: many dated Events made from one chart and a repeat rule.
 * `seriesKey` is the key the API returns as `series.seriesKey`.
 */
export class EventSeriesResource {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Plan an event series from a schedule (`dryRun`), or create its dates as a
   * background job. Retried safely with one Idempotency-Key. A series from an
   * event that never started and was given up answers `409 create_abandoned`
   * for that key every time: send the request again with a new key.
   */
  createEventSeries(
    params: CreateEventSeriesParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<EventSeriesCreated> {
    return this.#http.postWithHeaderReplay('/v1/event-series', {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /** One page of event series. Pass `cursor` from the previous page's `nextCursor`. */
  listEventSeries(options: EventSeriesListOptions = {}): Promise<EventSeriesPage> {
    return this.#http.get('/v1/event-series', { query: {
      limit: options.limit,
      cursor: options.cursor,
    } });
  }

  /** Retrieve an event series, its dates and its current job. */
  retrieveEventSeries(seriesKey: string): Promise<EventSeriesDetail> {
    return this.#http.get(`/v1/event-series/${encodeURIComponent(seriesKey)}`);
  }

  /** Add dates to a series, copied from its first date. Retried safely with one Idempotency-Key. */
  addEventSeriesDates(
    seriesKey: string,
    params: AddEventSeriesDatesParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<EventSeriesDatesAdded> {
    return this.#http.postWithHeaderReplay(`/v1/event-series/${encodeURIComponent(seriesKey)}/dates`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }

  /**
   * Change the name, prices or sales of every upcoming date in a series.
   * Send only the prices that change: each date keeps its own price for the rest.
   * Retried safely with one Idempotency-Key.
   */
  updateEventSeries(
    seriesKey: string,
    params: UpdateEventSeriesParams,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<EventSeriesUpdated> {
    return this.#http.mutationWithHeaderReplay('PATCH', `/v1/event-series/${encodeURIComponent(seriesKey)}`, {
      body: params, idempotencyKey: options.idempotencyKey, signal: options.signal,
    });
  }
}
