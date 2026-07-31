import type { HttpClient } from '../http.js';
import type { Workspace } from '../types.js';

/**
 * Workspaces isolate one tenant's charts and events from another's. A platform
 * typically provisions one per organiser at signup and disables it on churn.
 */
export class Workspaces {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  list(): Promise<{ workspaces: Workspace[] }> {
    return this.#http.get('/v1/workspaces');
  }

  create(params: { name: string; externalRef?: string }, options: { idempotencyKey?: string } = {}): Promise<{ workspace: Workspace }> {
    return this.#http.post('/v1/workspaces', { body: params, idempotencyKey: options.idempotencyKey });
  }

  retrieve(workspaceId: string): Promise<{ workspace: Workspace }> {
    return this.#http.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  /**
   * Rename, re-reference, or disable a workspace.
   *
   * The organisation's default workspace cannot be disabled — the API answers
   * 409 `default_workspace_required`. Promote another one first.
   */
  update(workspaceId: string, params: Partial<{
    name: string;
    externalRef: string | null;
    status: 'active' | 'disabled';
    isDefault: true;
  }>): Promise<{ workspace: Workspace }> {
    return this.#http.patch(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, { body: params });
  }
}
