/**
 * Component registry — the factory that binds a consumer's manifests to the
 * query surface, mirroring `createRegistry` for pages.
 *
 * One array, passed in explicitly. Adding a component is an import and a
 * line in the consumer's own registry file — deliberately manual, because
 * entering the registry is the act of claiming a component is adoptable, and
 * that should be a decision somebody makes rather than a glob that sweeps up
 * every sketch in the folder.
 */

import {
  auditManifest,
  meetsStatus,
  searchManifests,
  type AuditRule,
  type ComponentManifest,
  type ComponentStatus,
  type SearchHit,
} from "./manifest";

export interface RegistryHealth<Status extends string = ComponentStatus> {
  id: string;
  status: Status;
  /** False when the manifest claims the top status but fails the audit. */
  honest: boolean;
  errors: number;
  warnings: number;
}

export interface ComponentRegistry<Status extends string = ComponentStatus> {
  readonly manifests: ReadonlyArray<ComponentManifest<Status>>;
  /** Every registered manifest, sorted by name. */
  all(): ComponentManifest<Status>[];
  get(id: string): ComponentManifest<Status> | undefined;
  byStatus(status: Status): ComponentManifest<Status>[];
  find(query: string, limit?: number): SearchHit<Status>[];
  /**
   * Whether the registry is telling the truth about its statuses. A status a
   * component cannot back up is worse than no status at all, so `health()`
   * re-runs the audit and reports which entries are honest.
   */
  health(): RegistryHealth<Status>[];
}

export interface CreateComponentRegistryOptions<
  Status extends string = ComponentStatus,
> {
  manifests: ReadonlyArray<ComponentManifest<Status>>;
  /**
   * The status a manifest must earn by clearing the audit bar. Defaults to
   * `"graduated"` from the built-in vocabulary; consumers with their own
   * status union pass their top status.
   */
  honestyBar?: Status;
  /** Project-specific audit rules, appended to the built-in ruleset. */
  auditRules?: ReadonlyArray<AuditRule<Status>>;
  /** Default result cap for `find()`. */
  searchLimit?: number;
  /** Relevance bonus by status; see `defaultStatusBoost`. */
  statusBoost?: (status: Status) => number;
}

export function createComponentRegistry<
  Status extends string = ComponentStatus,
>(
  options: CreateComponentRegistryOptions<Status>,
): ComponentRegistry<Status> {
  const {
    manifests,
    honestyBar,
    auditRules,
    searchLimit = 10,
    statusBoost,
  } = options;

  type Manifest = ComponentManifest<Status>;
  const auditOptions = { rules: auditRules, bar: honestyBar };

  function all(): Manifest[] {
    return [...manifests].sort((a, b) => a.name.localeCompare(b.name));
  }

  function get(id: string): Manifest | undefined {
    return manifests.find((manifest) => manifest.id === id);
  }

  function byStatus(status: Status): Manifest[] {
    return all().filter((manifest) => manifest.status === status);
  }

  function find(query: string, limit = searchLimit): SearchHit<Status>[] {
    return searchManifests(manifests, query, { statusBoost }).slice(0, limit);
  }

  function health(): RegistryHealth<Status>[] {
    return all().map((manifest) => {
      const issues = auditManifest(manifest, auditOptions);
      return {
        id: manifest.id,
        status: manifest.status,
        honest: meetsStatus(manifest, auditOptions),
        errors: issues.filter((issue) => issue.level === "error").length,
        warnings: issues.filter((issue) => issue.level === "warning").length,
      };
    });
  }

  return {
    manifests,
    all,
    get,
    byStatus,
    find,
    health,
  };
}
