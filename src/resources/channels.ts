import type { HttpClient } from '../http.js';
import type { AccessSource, EventMeta } from '../types.js';

export type { AccessSource } from '../types.js';

export const PUBLIC_CHANNEL_ID = 'public' as const;

/** Organizer-facing channel state. Channel colours and markers never reach a buyer. */
export type ChannelState = 'active' | 'paused' | 'archived';
export type ChannelAccessIntent = 'none' | 'internal' | 'server' | 'hosted_link';

export interface BuyerAccessSession {
  /** Persist for audit/revocation; never send this to the browser. */
  sessionId: string;
  /** One-time browser bearer. Keep in memory only and never log it. */
  token: string;
  expiresAt: number;
  eventKey: string;
  includePublic: boolean;
  maxQuantity: number | null;
}

export interface CreateBuyerAccessSessionParams {
  /** Private allocations this authenticated buyer may select. */
  channelIds?: string[];
  /** Required: SeatLayer never guesses whether public inventory is included. */
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

export interface Channel {
  id: string;
  name: string;
  state: ChannelState;
  color: string | null;
  marker: string | null;
  externalRef: string | null;
  accessIntent: ChannelAccessIntent;
  archiveDestination: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  [key: string]: unknown;
}

export interface AccessLink {
  id: string;
  channelId: string;
  label: string | null;
  includePublic: boolean;
  expiresAt: number;
  maxRedemptions: number;
  redemptions: number;
  maxQuantity: number;
  sessionTtlSeconds: number;
  state: 'active' | 'revoked' | 'rotated';
  status: 'active' | 'revoked' | 'rotated' | 'expired' | 'exhausted';
  createdAt: number;
  createdBy: string | null;
  revokedAt: number | null;
  lastRedeemedAt: number | null;
  rotatedFrom: string | null;
  rotatedTo: string | null;
  [key: string]: unknown;
}

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

export interface ChannelWithCounts extends Channel {
  counts: ChannelCounts;
  access: ChannelAccess;
}

export interface PublicSaleChannel {
  id: typeof PUBLIC_CHANNEL_ID;
  name: string;
  state: 'active';
  counts: ChannelCounts;
}

export interface ChannelListResult {
  assignmentVersion: number;
  publicSale: PublicSaleChannel;
  channels: ChannelWithCounts[];
}

export interface ChannelAssignmentBuckets {
  changedFromPublic: { count: number };
  movedFromOtherChannel: {
    count: number;
    channels: Array<{ channelId: string; name: string | null; count: number }>;
  };
  alreadyInTarget: { count: number };
  skippedHeld: { count: number; labels: string[]; truncated: boolean };
  skippedBooked: { count: number; labels: string[]; truncated: boolean };
  notFound: { count: number; labels: string[]; truncated: boolean };
}

export interface ChannelAssignmentResult {
  ok: true;
  targetChannelId: string;
  assignmentVersion: number;
  requested: number;
  applied: number;
  buckets: ChannelAssignmentBuckets;
}

export interface ChannelPreviewAudience {
  channelIds: string[];
  includePublic: boolean;
}

export type ChannelAccessPreview =
  | {
      ok: true;
      audience: ChannelPreviewAudience;
      available: true;
      seats: Record<string, 'free' | 'held' | 'booked' | 'blocked'>;
      hidden: string[];
      closed: string[];
      updatedAt: number;
      eligible: string[];
      counts: { eligible: number };
      assignmentVersion: number;
      [key: string]: unknown;
    }
  | {
      ok: true;
      audience: ChannelPreviewAudience;
      available: false;
      unavailable: Array<{
        channelId: string;
        state: 'paused' | 'archived' | 'not_found';
      }>;
      assignmentVersion: number;
      [key: string]: unknown;
    };

export interface ChannelArchiveResult {
  ok: true;
  channel: Channel;
  assignmentVersion: number;
  moved: { free: number; blocked: number; booked: number; units: number };
  revokedSessions: number;
}

export interface AccessLinkReveal {
  link: AccessLink;
  url: string;
  capability: string;
  revealedOnce: true;
  previous?: AccessLink;
  endedSessions?: number;
}

export interface AccessLinkRevokeResult {
  ok: true;
  link: AccessLink;
  endedSessions: number;
}

export interface ChannelAttribution {
  sold: number;
  units: number;
  bookedValue: number | null;
  revenue: number | null;
}

export interface ChannelReportRow {
  channelId: string;
  name: string;
  externalRef: string | null;
  state: ChannelState;
  allocation: ChannelCounts;
  attribution: ChannelAttribution;
  sellThrough: number | null;
  [key: string]: unknown;
}

export interface ChannelReport {
  assignmentVersion: number;
  includesBookedValue: boolean;
  includesRevenue: boolean;
  methodology: { allocation: string; attribution: string; sellThrough: string };
  rows: ChannelReportRow[];
  totals: {
    allocated: number;
    free: number;
    held: number;
    booked: number;
    blocked: number;
    sold: number;
    bookedValue: number | null;
    revenue: number | null;
  };
  [key: string]: unknown;
}

export interface ChannelReportEnvelope {
  report: ChannelReport;
  event: EventMeta;
}

/** @deprecated Use `ChannelReportEnvelope`. */
export type ChannelReportResult = ChannelReportEnvelope;

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
  [key: string]: unknown;
}

/**
 * Sales-channel setup and buyer-access sessions.
 *
 * These are all secret-key calls. A browser receives only the short-lived
 * `bse_…` value returned by createBuyerAccessSession; it must never receive a
 * channel id as authority or this SDK's secret key.
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
    color?: string | null;
    marker?: string | null;
    externalRef?: string | null;
    accessIntent?: ChannelAccessIntent;
    reason?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<{ ok: true; channel: Channel }> {
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
    /** Confirm an intent switch after reviewing active links and sessions. */
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
   * Move only free or blocked inventory. assignmentVersion is deliberately
   * required: retrying a stale allocation would silently overwrite a colleague.
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

  /** Read-only proof of the inventory a given buyer scope would receive. */
  retrieveChannelAccessPreview(eventKey: string, options: {
    channelIds?: string[];
    includePublic?: boolean;
  } = {}): Promise<ChannelAccessPreview> {
    return this.#http.get(this.#path(eventKey, '/preview'), {
      query: {
        channelIds: options.channelIds?.join(','),
        includePublic: options.includePublic ? 1 : undefined,
      },
    });
  }

  pauseChannel(eventKey: string, channelId: string, params: { reason?: string } = {}): Promise<{ ok: true; channel: Channel }> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/pause`), {
      body: { reason: params.reason },
    });
  }

  unpauseChannel(eventKey: string, channelId: string, params: { reason?: string } = {}): Promise<{ ok: true; channel: Channel }> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/unpause`), {
      body: { reason: params.reason },
    });
  }

  archiveChannel(eventKey: string, channelId: string, params: {
    destination: string | null;
    reason?: string;
  }): Promise<ChannelArchiveResult> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/archive`), {
      body: { destination: params.destination, reason: params.reason },
    });
  }

  /** Current allocation and booking attribution for every sales channel. */
  retrieveChannelReport(eventKey: string): Promise<ChannelReportEnvelope> {
    return this.#http.get(this.#path(eventKey, '/report'));
  }

  /**
   * Mint one event- and origin-scoped browser session after authenticating the
   * buyer on your server. The bearer is returned exactly once.
   */
  createBuyerAccessSession(eventKey: string, params: CreateBuyerAccessSessionParams): Promise<BuyerAccessSession> {
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
    return this.#http.get(`/v1/events/${encodeURIComponent(eventKey)}/buyer-access-sessions`, { query: options });
  }

  revokeBuyerAccessSession(eventKey: string, sessionId: string): Promise<{
    ok: true;
    sessionId: string;
    grantVersion: number;
  }> {
    return this.#http.delete(`/v1/events/${encodeURIComponent(eventKey)}/buyer-access-sessions/${encodeURIComponent(sessionId)}`);
  }

  /** The URL/capability appears once; persist it immediately or rotate it. */
  createAccessLink(eventKey: string, channelId: string, params: {
    label?: string | null;
    expiresAt?: number;
    maxRedemptions?: number;
    maxQuantity?: number;
    sessionTtlSeconds?: number;
    includePublic?: boolean;
    reason?: string;
  }, options: { idempotencyKey?: string } = {}): Promise<AccessLinkReveal> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/access-links`), {
      body: {
        label: params.label,
        expiresAt: params.expiresAt,
        maxRedemptions: params.maxRedemptions,
        maxQuantity: params.maxQuantity,
        sessionTtlSeconds: params.sessionTtlSeconds,
        includePublic: params.includePublic,
        reason: params.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
  }

  listAccessLinks(eventKey: string, channelId: string): Promise<{
    links: Array<AccessLink & { activeSessions: number }>;
  }> {
    return this.#http.get(this.#path(eventKey, `/${encodeURIComponent(channelId)}/access-links`));
  }

  /** endActiveSessions is required: a leaked and misplaced link need different handling. */
  rotateAccessLink(eventKey: string, channelId: string, linkId: string, params: {
    endActiveSessions: boolean;
    reason?: string;
  }): Promise<AccessLinkReveal> {
    return this.#http.post(this.#path(eventKey, `/${encodeURIComponent(channelId)}/access-links/${encodeURIComponent(linkId)}/rotate`), {
      body: { endActiveSessions: params.endActiveSessions, reason: params.reason },
    });
  }

  revokeAccessLink(eventKey: string, channelId: string, linkId: string, options: {
    endActiveSessions?: boolean;
    reason?: string;
  } = {}): Promise<AccessLinkRevokeResult> {
    return this.#http.delete(this.#path(eventKey, `/${encodeURIComponent(channelId)}/access-links/${encodeURIComponent(linkId)}`), {
      query: {
        endActiveSessions: options.endActiveSessions ? 1 : undefined,
        reason: options.reason,
      },
    });
  }
}
