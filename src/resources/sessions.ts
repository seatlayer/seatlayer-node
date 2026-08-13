import type { HttpClient } from '../http.js';
import type { DesignerSession, ManageCapability, ManageSession } from '../types.js';

/**
 * Short-lived, origin-bound browser tokens.
 *
 * The governing rule of this SDK: **it mints tokens, widgets consume them.**
 * Your secret key never reaches a browser. You mint a scoped token here, hand
 * it to your frontend, and our widget uses that.
 */
export class Sessions {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Mint a manage-session token for the control room.
   *
   * The raw API defaults an omitted list to view-only (`event:view`). This SDK
   * still requires an explicit non-empty set so browser authority is visible at
   * every call site; pass the smallest set the page needs.
   *
   * `allowedOrigin` must be an https origin; the token is bound to it.
   */
  // `async` so the guard below rejects rather than throwing synchronously —
  // a sync throw from a promise-returning method escapes `.catch()` and
  // surfaces as an unhandled error in the caller's request handler.
  async createManageSession(eventKey: string, params: {
    allowedOrigin: string;
    capabilities: ManageCapability[];
    /** 300–14400. Defaults to 3600 server-side. */
    expiresInSeconds?: number;
    workspaceId?: string;
  }): Promise<ManageSession> {
    if (!params.capabilities?.length) {
      throw new TypeError(
        'capabilities is required and must contain a non-empty least-privilege set.',
      );
    }
    return this.#http.post(`/v1/events/${encodeURIComponent(eventKey)}/manage-sessions`, {
      body: params,
    });
  }

  /** Revoke a manage token before it expires (staff logout, permission change). */
  revokeManageSession(eventKey: string, sessionId: string): Promise<{ ok: true }> {
    return this.#http.delete(
      `/v1/events/${encodeURIComponent(eventKey)}/manage-sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  /**
   * Mint a designer-session token so an organiser can edit a chart inside your
   * own UI. Requires a chartId that already exists — create or copy one first.
   */
  createDesignerSession(params: {
    workspaceId: string;
    chartId: string;
    allowedOrigin: string;
    authority?: 'read-only' | 'edit' | 'publish';
    canPublish?: boolean;
    mode?: 'normal' | 'safe';
    safeModeOptions?: {
      allowDeletingObjects?: boolean;
      allowEditingAreaCapacity?: boolean;
    };
    features?: Record<string, unknown>;
    expiresInSeconds?: number;
  }): Promise<{ session: DesignerSession }> {
    return this.#http.post('/v1/designer/sessions', { body: params });
  }

  revokeDesignerSession(sessionId: string): Promise<{ ok: true }> {
    return this.#http.delete(`/v1/designer/sessions/${encodeURIComponent(sessionId)}`);
  }
}
