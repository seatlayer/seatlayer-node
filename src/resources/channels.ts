import type { HttpClient } from '../http.js';
import type { EventMeta } from '../types.js';

export const PUBLIC_CHANNEL_ID = 'public' as const;

export type ChannelState = 'active' | 'paused' | 'archived';
export type ChannelAccessIntent = 'none' | 'internal' | 'server' | 'hosted_link';
export type AccessSource = 'public' | 'promoter' | 'partner' | 'hosted_link' | 'staff_override';

export interface ChannelCounts {
  allocated: number;
  free: number;
  held: number;
  booked: number;
  blocked: number;
  units: number;
}

export interface ChannelAccess {
  intent: ChannelAccessIntent;
  hasActiveGrants: boolean;
  lastMintAt: number | null;
}

export interface Channel {
  id: string;
  name: string;
  color: string | null;
  marker: string | null;
  externalRef: string | null;
  state: ChannelState;
  archiveDestination: string | null;
  accessIntent: ChannelAccessIntent;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface ChannelWithCounts extends Channel {
  counts: ChannelCounts;
  access: ChannelAccess;
}

export interface ChannelListResult {
  assignmentVersion: number;
  publicSale: {
    id: typeof PUBLIC_CHANNEL_ID;
    name: string;
    state: 'active';
    counts: ChannelCounts;
  };
  channels: ChannelWithCounts[];
}

export interface ChannelAssignmentResult {
  ok: true;
  targetChannelId: string;
  assignmentVersion: number;
  requested: number;
  applied: number;
  buckets: {
    changedFromPublic: { count: number };
    movedFromOtherChannel: {
      count: number;
      channels: Array<{ channelId: string; name: string | null; count: number }>;
    };
    alreadyInTarget: { count: number };
    skippedHeld: { count: number; labels: string[]; truncated: boolean };
    skippedBooked: { count: number; labels: string[]; truncated: boolean };
    notFound: { count: number; labels: string[]; truncated: boolean };
  };
}

export interface ChannelReport {
  assignmentVersion: number;
  /** Whether configured booked-value fields are present rather than `null`. */
  includesBookedValue: boolean;
  /** @deprecated Use `includesBookedValue`. */
  includesRevenue: boolean;
  methodology: {
    allocation: string;
    attribution: string;
    sellThrough: string;
  };
  rows: Array<{
    channelId: string;
    name: string;
    externalRef: string | null;
    state: ChannelState;
    allocation: ChannelCounts;
    attribution: {
      sold: number;
      units: number;
      /** Configured-price snapshot; `null` when value reporting is not in scope. */
      bookedValue: number | null;
      /** @deprecated Use `bookedValue`. */
      revenue: number | null;
    };
    sellThrough: number | null;
  }>;
  totals: {
    allocated: number;
    free: number;
    held: number;
    booked: number;
    blocked: number;
    sold: number;
    bookedValue: number | null;
    /** @deprecated Use `bookedValue`. */
    revenue: number | null;
  };
}

export interface ChannelReportResult {
  report: ChannelReport;
  event: EventMeta;
}

export interface BuyerAccessSession {
  sessionId: string;
  /** One-time browser bearer. Keep in memory only and never log it. */
  token: string;
  expiresAt: number;
  eventKey: string;
  includePublic: boolean;
  maxQuantity: number | null;
}

/** Organizer-safe session projection. It never contains a token or token hash. */
export interface BuyerAccessSessionRecord {
  sessionId: string;
  channelIds: string[];
  includePublic: boolean;
  allowedOrigin: string;
  mode: 'live' | 'test';
  expiresAt: number;
  maxQuantity: number | null;
  buyerRef: string | null;
  partnerRef: string | null;
  accessSource: AccessSource;
  state: 'active' | 'revoked';
  createdAt: number;
  revokedAt: number | null;
  accessLinkId: string | null;
}

export interface CreateBuyerAccessSessionParams {
  /** Private allocations this authenticated buyer may select. */
  channelIds?: string[];
  /** Required: SeatLayer never guesses whether Public sale is included. */
  includePublic: boolean;
  /** Exact browser origin on which this bearer can be used. */
  allowedOrigin: string;
  expiresInSeconds?: number;
  maxQuantity?: number | null;
  buyerRef?: string;
  partnerRef?: string;
  /** A retry rotates a prior unseen bearer rather than replaying it. */
  clientRequestId?: string;
}

/**
 * Platform allocation setup, reporting, and buyer-access sessions.
 *
 * These are secret-key calls. A browser receives only the short-lived `bse_…`
 * returned by `createBuyerAccessSession`; a channel id is metadata, not
 * authority. Managed hosted-link operations are intentionally not exposed by
 * this Platform SDK resource.
 */
export class Channels {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  #path(eventKey: string, suffix = ''): string {
    return `/v1/events/${encodeURIComponent(eventKey)}/channels${suffix}`;
  }

  listChannels(eventKey: string, options: { includeArchived?: boolean } = {}): Promise<ChannelListResult> {
    return this.#http.get(this.#path(eventKey), {
      query: options.includeArchived ? { includeArchived: 1 } : undefined,
    });
  }

  createChannel(eventKey: string, params: {
    name: string;
    color?: string;
    marker?: string;
    externalRef?: string;
    accessIntent?: ChannelAccessIntent;
    reason?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<{ ok: true; channel: ChannelWithCounts }> {
    return this.#http.post(this.#path(eventKey), {
      body: {
        name: params.name,
        color: params.color,
        marker: params.marker,
        externalRef: params.externalRef,
        accessIntent: params.accessIntent,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
  }

  updateChannel(eventKey: string, channelId: string, params: {
    name?: string;
    accessIntent?: ChannelAccessIntent;
    acknowledgeLiveAccess?: boolean;
    reason?: string;
  }): Promise<{
    ok: true;
    channel: Channel;
    intentSwitch?: { closedLinks: number; keptSessions: number };
  }> {
    return this.#http.patch(this.#path(eventKey, `/${encodeURIComponent(channelId)}`), {
      body: {
        name: params.name,
        accessIntent: params.accessIntent,
        acknowledgeLiveAccess: params.acknowledgeLiveAccess,
        reason: params.reason,
      },
    });
  }

  /**
   * Move only free or blocked inventory. `assignmentVersion` is deliberately
   * required so a stale allocation cannot overwrite a colleague's update.
   */
  updateChannelAssignments(eventKey: string, params: {
    targetChannelId?: string | null;
    labels: string[];
    assignmentVersion: number;
    reason?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<ChannelAssignmentResult> {
    return this.#http.post(this.#path(eventKey, '/assignments'), {
      body: {
        targetChannelId: params.targetChannelId,
        labels: params.labels,
        assignmentVersion: params.assignmentVersion,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
  }

  listChannelAllocation(eventKey: string, options: { afterLabel?: string; limit?: number } = {}): Promise<{
    assignmentVersion: number;
    allocations: Array<{ label: string; channelId: string }>;
    nextAfterLabel: string | null;
  }> {
    return this.#http.get(this.#path(eventKey, '/allocation'), { query: options });
  }

  /** Read-only proof of the inventory a buyer scope would receive. */
  retrieveChannelAccessPreview(eventKey: string, options: {
    channelIds?: string[];
    includePublic?: boolean;
  } = {}): Promise<Record<string, unknown>> {
    return this.#http.get(this.#path(eventKey, '/preview'), {
      query: {
        channelIds: options.channelIds?.join(','),
        includePublic: options.includePublic,
      },
    });
  }

  retrieveChannelReport(eventKey: string): Promise<ChannelReportResult> {
    return this.#http.get(this.#path(eventKey, '/report'));
  }

  pauseChannel(eventKey: string, channelId: string, params: { reason?: string } = {}): Promise<{
    ok: true;
    channel: Channel;
  }> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/pause`), {
      body: { reason: params.reason },
    });
  }

  unpauseChannel(eventKey: string, channelId: string, params: { reason?: string } = {}): Promise<{
    ok: true;
    channel: Channel;
  }> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/unpause`), {
      body: { reason: params.reason },
    });
  }

  archiveChannel(eventKey: string, channelId: string, params: {
    destination: string | null;
    reason?: string;
  }): Promise<{
    ok: true;
    channel: Channel;
    assignmentVersion: number;
    moved: { free: number; blocked: number; booked: number; units: number };
    revokedSessions: number;
  }> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/archive`), {
      body: { destination: params.destination, reason: params.reason },
    });
  }

  /** Mint an event- and origin-scoped browser bearer after authenticating the buyer. */
  createBuyerAccessSession(
    eventKey: string,
    params: CreateBuyerAccessSessionParams,
  ): Promise<BuyerAccessSession> {
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/buyer-access-sessions`, {
      body: {
        channelIds: params.channelIds,
        includePublic: params.includePublic,
        allowedOrigin: params.allowedOrigin,
        expiresInSeconds: params.expiresInSeconds,
        maxQuantity: params.maxQuantity,
        buyerRef: params.buyerRef,
        partnerRef: params.partnerRef,
        clientRequestId: params.clientRequestId,
      },
    });
  }

  listBuyerAccessSessions(eventKey: string, options: { limit?: number } = {}): Promise<{
    sessions: BuyerAccessSessionRecord[];
  }> {
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/buyer-access-sessions`, {
      query: options,
    });
  }

  revokeBuyerAccessSession(eventKey: string, sessionId: string): Promise<{
    ok: true;
    sessionId: string;
    grantVersion: number;
  }> {
    return this.#http.delete(
      `/v1/events/${encodeURIComponent(eventKey)}/buyer-access-sessions/${encodeURIComponent(sessionId)}`,
    );
  }
}
