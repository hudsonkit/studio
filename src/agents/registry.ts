/**
 * Agent registry — the factory that binds a Studio's registered agent
 * targets to the query surface, mirroring `createComponentRegistry`.
 *
 * One array, passed in explicitly (from `.studio/project.json` or a
 * consumer's own config). Adding a target is a line in the manifest —
 * deliberately manual, because entering the registry is the act of claiming
 * an agent may receive work from this Studio, and that should be a decision
 * somebody makes rather than a discovery sweep across every agent Scout
 * happens to know about.
 */

import type { StudioAgentTarget } from "./types";

export interface AgentRegistry {
  readonly targets: ReadonlyArray<StudioAgentTarget>;
  /** Every registered target, in manifest order. */
  all(): StudioAgentTarget[];
  /** Exact target for a selector, or `undefined` when it is not registered. */
  get(selector: string): StudioAgentTarget | undefined;
  /**
   * `get()` with fallback: `undefined` (or empty) resolves to the default
   * target, so callers that never heard of multi-agent configs keep working.
   * Unknown selectors resolve to `undefined`, never silently to the default —
   * sending work to the wrong agent is worse than refusing to send.
   */
  resolve(selector?: string): StudioAgentTarget | undefined;
  /**
   * The target used when the caller does not choose one: `defaultTarget`
   * when given, otherwise the first registered target. `undefined` only when
   * the registry is empty.
   */
  default(): StudioAgentTarget | undefined;
}

export interface CreateAgentRegistryOptions {
  agents: ReadonlyArray<StudioAgentTarget>;
  /** Selector of the fallback target. Must name a registered agent. */
  defaultTarget?: string;
}

function normalizeSelector(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function createAgentRegistry(
  options: CreateAgentRegistryOptions,
): AgentRegistry {
  const { agents, defaultTarget } = options;

  function get(selector: string): StudioAgentTarget | undefined {
    const wanted = normalizeSelector(selector);
    if (!wanted) return undefined;
    return agents.find((target) => normalizeSelector(target.agent) === wanted);
  }

  function default_(): StudioAgentTarget | undefined {
    if (defaultTarget) {
      const target = get(defaultTarget);
      if (!target) {
        throw new Error(
          `Default agent target ${defaultTarget} is not registered.`,
        );
      }
      return target;
    }
    return agents[0];
  }

  function resolve(selector?: string): StudioAgentTarget | undefined {
    if (!selector?.trim()) return default_();
    return get(selector);
  }

  return {
    targets: agents,
    all: () => [...agents],
    get,
    resolve,
    default: default_,
  };
}
