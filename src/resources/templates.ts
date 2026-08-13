import type { HttpClient } from '../http.js';
import type { ChartMeta } from '../types.js';

/** Optional overrides for a catalog template instantiation. */
export interface InstantiateTemplateParams {
  name?: string;
  workspaceId?: string;
  /** A caller-edited document; object-valued so the wire payload remains JSON. */
  editedDoc?: Record<string, unknown>;
  /** Pin the catalog snapshot that is materialized. */
  version?: number;
  /** Pin by the published catalog artifact digest. */
  sha256?: string;
}

export interface InstantiateTemplateOptions {
  idempotencyKey?: string;
}

/** Published template catalog entries materialize as draft charts. */
export class Templates {
  #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Instantiate a published catalog template as a draft chart.
   *
   * The API has an exact header-replay contract for this operation. An empty
   * object is intentional: it distinguishes this public template request from
   * a bodyless mutation and stays compatible with every server SDK.
   */
  instantiateTemplate(
    templateId: string,
    params: InstantiateTemplateParams = {},
    options: InstantiateTemplateOptions = {},
  ): Promise<{ meta: ChartMeta }> {
    return this.#http.postWithHeaderReplay(
      `/v1/templates/${encodeURIComponent(templateId)}/instantiate`,
      { body: params, idempotencyKey: options.idempotencyKey },
    );
  }
}
