import type { HttpClient } from '../http.js';
import type {
  ArchiveEventResult,
  EventCounts,
  EventConfigurationBinding,
  EventConfigurationBindingUpdateParams,
  EventDetail,
  EventEnvelope,
  EventLogPage,
  EventMeta,
  EventReportEnvelope,
  EventSectionState,
  KeyMode,
  EventHostingRegion,
  SalesAliasResult,
  TicketReleaseList,
  TicketReleaseReplaceInput,
} from '../types.js';

export interface EventListOptions {
  workspaceId?: string;
  externalRef?: string;
  /** Page size. Clamped server-side; asking for more is not an error. */
  limit?: number;
  cursor?: string;
  /** Include live availability counts. One server round-trip per event. */
  counts?: boolean;
  /** Only the dates of this event series. */
  seriesKey?: string;
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

/** Where an event is in its sales lifecycle. */
export type EventSalesState = 'setup' | 'testable' | 'live' | 'paused' | 'ended';

/** Who takes payment: SeatLayer's hosted checkout, or your own (`integrator`). */
export type EventBuyerCheckout = 'seatlayer' | 'integrator';

export interface EventBuyerCheckoutOption {
  value: EventBuyerCheckout;
  selected: boolean;
  eligible: boolean;
  blockers: Array<{ reason: string; count?: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface EventBuyerCheckoutState {
  buyerCheckout: EventBuyerCheckout | null;
  revision: number;
  salesState: EventSalesState;
  paymentGateway: unknown;
  options: EventBuyerCheckoutOption[];
  [key: string]: unknown;
}

export interface EventBuyerCheckoutReplaceResult extends EventBuyerCheckoutState {
  ok: boolean;
  changed: boolean;
  from?: string | null;
  paymentGatewayCleared?: boolean;
  meta: Record<string, unknown>;
}

export interface EventPaymentGatewayOptions {
  assigned: string | null;
  assignedConnectionId: string | null;
  buyerCheckout: string | null;
  eventMode: KeyMode;
  eventCurrency: string | null;
  options: Array<{
    connectionId: string;
    provider: string;
    mode: string;
    currency: string | null;
    eligible: boolean;
    problem?: string;
    [key: string]: unknown;
  }>;
  problem: string | null;
  [key: string]: unknown;
}

export interface EventPaymentGatewayAssignment {
  assigned: string | null;
  assignedConnectionId: string | null;
  [key: string]: unknown;
}

export interface EventSalesReadiness {
  state: EventSalesState;
  revision: number;
  path: EventBuyerCheckout | null;
  readiness: Record<string, boolean>;
  required: string[];
  gatewayRefusal: unknown;
  [key: string]: unknown;
}

export interface EventSalesPreflightResult {
  ok: true;
  preflight: { id: string; order_id: string; [key: string]: unknown };
  reused: boolean;
  [key: string]: unknown;
}

export interface EventSalesTransitionResult {
  ok: boolean;
  changed: boolean;
  state: EventSalesState;
  revision: number;
  from?: EventSalesState;
  meta: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EventBookingFee {
  bookingFeeMinor: number | null;
  currency: string | null;
  confirmedOrders: number;
  editable: boolean;
  available: boolean;
  reason: string | null;
  [key: string]: unknown;
}

export interface EventDiscountCode {
  id: string;
  code: string;
  kind: 'percent' | 'amount';
  percent: number | null;
  amountMinor: number | null;
  currency: string | null;
  startsAt: number | null;
  endsAt: number | null;
  maxUses: number | null;
  state: string;
  status: string;
  uses: number;
  discountGivenMinor: number;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface CreateEventDiscountCodeParams {
  code: string;
  kind: 'percent' | 'amount';
  /** Required when `kind` is `percent`. */
  percent?: number;
  /** Required when `kind` is `amount`. */
  amountMinor?: number;
  startsAt?: number | null;
  endsAt?: number | null;
  maxUses?: number | null;
  active?: boolean;
}

export interface UpdateEventDiscountCodeParams extends Partial<CreateEventDiscountCodeParams> {
  /** Pause a code, or make it active again. */
  state?: 'active' | 'paused';
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
        seriesKey: options.seriesKey,
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
    /** Live-inventory region nearest the venue. Defaults to Western Europe. */
    region?: EventHostingRegion;
  }, options: { idempotencyKey?: string } = {}): Promise<EventEnvelope> {
    return this.#http.postWithHeaderReplay('/v1/events', {
      body: params,
      idempotencyKey: options.idempotencyKey,
    });
  }

  retrieve(eventKey: string): Promise<EventDetail> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}`);
  }

  /** Read the Event's exact immutable configuration binding and audit history. */
  retrieveConfigurationBinding(eventKey: string): Promise<EventConfigurationBinding> {
    return this.#http.get(
      `/v1/events/${encodeURIComponent(eventKey)}/event-configuration`,
    );
  }

  /**
   * Bind an exact published version, or pass `configuration: null` to detach.
   * This compare-and-set mutation is deliberately single-attempt because the
   * public operation does not promise exact response replay.
   */
  updateConfigurationBinding(
    eventKey: string,
    params: EventConfigurationBindingUpdateParams,
  ): Promise<EventConfigurationBinding> {
    return this.#http.put(
      `/v1/events/${encodeURIComponent(eventKey)}/event-configuration`,
      { body: params },
    );
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

  /** List releases with current quota consumption. */
  listTicketReleases(eventKey: string): Promise<TicketReleaseList> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/releases`);
  }

  /**
   * Replace the complete, ordered release list. This remains single-attempt:
   * the public contract has no replay guarantee, so callers decide whether a
   * failed response should be read back or submitted again.
   */
  updateTicketReleases(
    eventKey: string,
    releases: TicketReleaseReplaceInput[],
  ): Promise<TicketReleaseList> {
    return this.#http.put(`/v1/events/${encodeURIComponent(eventKey)}/releases`, {
      body: { releases },
    });
  }

  /** Close a single release immediately, retaining its reporting provenance. */
  closeTicketRelease(eventKey: string, releaseId: string): Promise<TicketReleaseList> {
    return this.#http.post(
      `/v1/events/${encodeURIComponent(eventKey)}/releases/${encodeURIComponent(releaseId)}/close`,
    );
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

  /** Retrieve who takes payment for an event, and what blocks changing it. */
  retrieveEventBuyerCheckout(eventKey: string): Promise<EventBuyerCheckoutState> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/buyer-checkout`);
  }

  /**
   * Choose SeatLayer checkout or your own for an event. Compare-and-set on
   * `expectedRevision`; sent once, so read the state back after an unknown outcome.
   */
  replaceEventBuyerCheckout(eventKey: string, params: {
    buyerCheckout: EventBuyerCheckout;
    expectedRevision: number;
  }): Promise<EventBuyerCheckoutReplaceResult> {
    return this.#http.put(`/v1/events/${encodeURIComponent(eventKey)}/buyer-checkout`, { body: params });
  }

  /** Retrieve an event's payment gateway and the connected gateways it could use. */
  retrieveEventPaymentGateway(eventKey: string, options: {
    /** Check the options against this currency instead of the event's. */
    currency?: string;
  } = {}): Promise<EventPaymentGatewayOptions> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/payment-gateway`, {
      query: { currency: options.currency },
    });
  }

  /** Assign one of the organisation's connected gateways to an event. Sent once. */
  replaceEventPaymentGateway(eventKey: string, params?: {
    connectionId?: string | null;
    provider?: string | null;
  }): Promise<EventPaymentGatewayAssignment> {
    return this.#http.put(`/v1/events/${encodeURIComponent(eventKey)}/payment-gateway`, { body: params });
  }

  /** Retrieve what an event still needs before its next sales step. */
  retrieveEventSalesReadiness(eventKey: string): Promise<EventSalesReadiness> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/sales/readiness`);
  }

  /** Record a test order as the event's sales preflight. Sent once. */
  preflightEventSales(eventKey: string, params: { orderId: string }): Promise<EventSalesPreflightResult> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/sales/preflight`, { body: params });
  }

  /**
   * Move an event's sales to testable, live, paused or ended. Compare-and-set
   * on `expectedRevision`; sent once.
   */
  transitionEventSales(eventKey: string, params: {
    to: EventSalesState;
    expectedRevision: number;
    reason?: string;
  }): Promise<EventSalesTransitionResult> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/sales/transition`, { body: params });
  }

  /** Retrieve an event's booking fee. */
  retrieveEventBookingFee(eventKey: string): Promise<EventBookingFee> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/booking-fee`);
  }

  /** Set an event's booking fee in minor units, or clear it with `null`. Sent once. */
  replaceEventBookingFee(eventKey: string, params: { bookingFeeMinor: number | null }): Promise<EventBookingFee> {
    return this.#http.put(`/v1/events/${encodeURIComponent(eventKey)}/booking-fee`, { body: params });
  }

  /** List an event's discount codes. */
  listEventDiscountCodes(eventKey: string): Promise<{ codes: EventDiscountCode[] }> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/discount-codes`);
  }

  /** Create a discount code for an event. Sent once. */
  createEventDiscountCode(
    eventKey: string,
    params: CreateEventDiscountCodeParams,
  ): Promise<{ code: EventDiscountCode }> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/discount-codes`, { body: params });
  }

  /** Change or pause a discount code. Sent once. */
  updateEventDiscountCode(
    eventKey: string,
    codeId: string,
    params: UpdateEventDiscountCodeParams,
  ): Promise<{ code: EventDiscountCode }> {
    return this.#http.patch(
      `/v1/events/${encodeURIComponent(eventKey)}/discount-codes/${encodeURIComponent(codeId)}`,
      { body: params },
    );
  }

  /** End a discount code for good. */
  endEventDiscountCode(eventKey: string, codeId: string): Promise<{ code: EventDiscountCode }> {
    return this.#http.post(
      `/v1/events/${encodeURIComponent(eventKey)}/discount-codes/${encodeURIComponent(codeId)}/end`,
    );
  }

  /** Delete a discount code nobody has used. Resolves with nothing (204). Sent once. */
  deleteEventDiscountCode(eventKey: string, codeId: string): Promise<void> {
    return this.#http.delete(
      `/v1/events/${encodeURIComponent(eventKey)}/discount-codes/${encodeURIComponent(codeId)}`,
    );
  }
}
