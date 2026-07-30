/**
 * Component manifest — a generic schema for describing the components a
 * design studio has finished, so a human or an agent can tell an adoptable
 * component from a sketch without reading its source.
 *
 * This sits beside the page registry (`src/registry`): that module describes
 * the *routes* a studio hosts; this one describes the *components* it has
 * graduated. Like the page registry, it is generic over a consumer-defined
 * `Status` string union — the package ships a default vocabulary
 * (`draft | candidate | graduated`) and never needs to know a consumer's
 * taxonomy.
 *
 * A manifest is the component's own answer to the questions somebody — human
 * or agent — asks before adopting it:
 *
 *   Is there a component for X?        → id, name, summary, keywords
 *   Is it finished?                    → status, and it has to be earned
 *   How do I use it?                   → import, props, slots, examples
 *   What happens in the ugly cases?    → states
 *   Can I drive it from a keyboard?    → keyboard, a11y
 *   Where does its data come from?     → data
 *   Is it already in prod, and synced? → port
 *
 * Manifests live beside their component as `<Name>.manifest.ts`, never in a
 * central file. A sidecar changes in the same diff as the thing it describes;
 * a central registry drifts the first time somebody is in a hurry.
 *
 * The top status is not a label you write, it is a bar you clear —
 * `auditManifest()` below is the bar. The ruleset is extensible: consumers
 * append project-specific rules via `AuditOptions.rules` (or the registry
 * factory's `auditRules`) without forking the built-in list.
 */

export type ComponentStatus =
  /** A sketch. Lives in the studio, expect it to move under you. */
  | "draft"
  /** Complete and interactive, but the contract is still settling. */
  | "candidate"
  /** Contract is stable and documented. Safe to adopt. */
  | "graduated";

export type PortStatus =
  /** Studio only — no production counterpart yet. */
  | "none"
  /** Ported, but the production copy is missing capabilities. */
  | "partial"
  /** Ported and the contracts agree. */
  | "synced"
  /** Ported, then the two diverged. `drift` says how. */
  | "drifted";

export interface PropSpec {
  name: string;
  /** As written in the source, e.g. `"rail" | "bands"`. */
  type: string;
  required?: boolean;
  /** Literal default, as source. Omit when there is none. */
  default?: string;
  /** One sentence. What it changes, not what it is. */
  summary: string;
}

export interface SlotSpec {
  name: string;
  type: string;
  summary: string;
}

/**
 * A state worth knowing about before adoption: loading, empty, error,
 * disabled, over-long content. `trigger` has to be concrete enough to
 * reproduce — "pass status='loading'", not "while loading".
 */
export interface StateSpec {
  name: string;
  trigger: string;
  behavior: string;
}

export interface KeySpec {
  /** e.g. `"↑ / ↓"`, `"Enter"`, `"Escape"`. */
  keys: string;
  action: string;
  /** Where the binding applies, when it is not the whole component. */
  scope?: string;
}

export interface ExampleSpec {
  title: string;
  /** Copy-pasteable. The first example must run with no other setup. */
  code: string;
  summary?: string;
}

export interface DataSpec {
  /** Repo-relative module holding the data contract. */
  module: string;
  summary: string;
  /** Where the real thing comes from in production, if it differs. */
  production?: string;
}

export interface PortSpec {
  /** Repo-relative path of the production counterpart. */
  target?: string;
  status: PortStatus;
  /** One sentence per divergence, each naming both sides. */
  drift?: string[];
  notes?: string;
  /**
   * Git ref (branch, tag or commit) the `verifiedAgainst` hashes were taken
   * against. A hash is a claim about file contents at one moment; without the
   * ref, a port claim is branch-relative without saying so, and a legitimate
   * rebuild on a different ref reads as drift.
   */
  ref?: string;
  /**
   * Short content hashes of the files this drift list was checked against,
   * keyed by repo-relative path. Drift is a claim about two files at one
   * moment, and nobody editing the product tree will think to update a studio
   * sidecar — so verification compares these and warns when the ground moved.
   */
  verifiedAgainst?: Record<string, string>;
}

export interface ComponentManifest<Status extends string = ComponentStatus> {
  /** Stable kebab-case key. This is what search matches and what URLs use. */
  id: string;
  name: string;
  status: Status;
  /** One sentence: what it is and what it replaces. */
  summary: string;
  /**
   * What somebody would type looking for this, including the words you do NOT
   * use. An agent searching "dropdown" should still find a picker.
   */
  keywords: string[];
  whenToUse: string[];
  whenNotToUse: string[];
  import: { from: string; symbols: string[] };
  props: PropSpec[];
  slots?: SlotSpec[];
  states?: StateSpec[];
  keyboard?: KeySpec[];
  a11y?: string[];
  data?: DataSpec;
  dependencies?: {
    components?: string[];
    /** CSS custom properties the component reads. Port blockers live here. */
    tokens?: string[];
    packages?: string[];
  };
  examples: ExampleSpec[];
  /** Studio route where it is exercised live. */
  atom?: string;
  /** Repo-relative source files, component first. */
  source: string[];
  port?: PortSpec;
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

/**
 * One completeness rule. A rule reads a manifest and returns the issues it
 * finds; it never throws and never looks outside the manifest. Consumers
 * write project-specific rules in this shape and pass them through
 * `AuditOptions.rules` — they run after the built-in ruleset, so a project
 * can tighten the bar (e.g. "every graduated component names a data contract")
 * without forking the defaults.
 */
export type AuditRule<Status extends string = ComponentStatus> = (
  manifest: ComponentManifest<Status>,
) => AuditIssue[];

export interface AuditOptions<Status extends string = ComponentStatus> {
  /** Project-specific rules, appended after `defaultAuditRules`. */
  rules?: ReadonlyArray<AuditRule<Status>>;
}

const error = (field: string, message: string): AuditIssue => ({
  level: "error",
  field,
  message,
});
const warn = (field: string, message: string): AuditIssue => ({
  level: "warning",
  field,
  message,
});

/**
 * The built-in graduation bar, as composable rules. Typed against the widest
 * manifest (`Status = string`) so they accept any consumer's status union.
 *
 * Errors block the top status. Warnings never block anything — they are
 * pressure, not a gate, and `meetsStatus()` ignores them on purpose: a bar
 * that fails on advisory findings gets satisfied by writing noise to silence
 * it rather than by fixing anything. The rules encode what actually bites
 * when studio work is ported into a product: a component with no minimal
 * example gets adopted wrong, one with undocumented keyboard behaviour gets
 * adopted without it, and one whose token dependencies are unlisted gets
 * adopted and renders invisible against a different palette.
 */
export const defaultAuditRules: ReadonlyArray<AuditRule<string>> = [
  (m) =>
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)
      ? []
      : [error("id", "must be kebab-case — it is used as a search key and a URL segment")],
  (m) =>
    m.summary.trim().split(/\s+/).length >= 5
      ? []
      : [error("summary", "one full sentence, not a label")],
  (m) =>
    m.keywords.length >= 3
      ? []
      : [warn("keywords", "under three keywords is hard to find; include synonyms you do not use")],
  (m) =>
    m.whenToUse.length > 0 ? [] : [error("whenToUse", "required — adoption starts here")],
  (m) =>
    m.whenNotToUse.length > 0
      ? []
      : [warn("whenNotToUse", "a component with no stated limits gets used where it does not fit")],
  (m) => (m.props.length > 0 ? [] : [warn("props", "no props documented")]),
  (m) => {
    const issues: AuditIssue[] = [];
    for (const prop of m.props) {
      // Only literal unions and booleans are warned about. Those are the
      // props where the default is a fact the adopter cannot guess —
      // `variant` silently being "rail" changes the whole panel. A callback
      // or an object value has no meaningful default and demanding one just
      // trains people to write `default: "undefined"` to silence the audit.
      const needsDefault =
        !prop.required &&
        !prop.default &&
        (prop.type === "boolean" || (prop.type.includes('"') && prop.type.includes("|")));
      if (needsDefault) {
        issues.push(
          warn(
            `props.${prop.name}`,
            "optional prop with a fixed option set but no documented default",
          ),
        );
      }
      if (!prop.summary.trim()) {
        issues.push(error(`props.${prop.name}`, "missing summary"));
      }
    }
    return issues;
  },
  (m) =>
    m.examples.length > 0
      ? []
      : [error("examples", "required — the first must run with no other setup")],
  (m) => (m.source.length > 0 ? [] : [error("source", "required")]),
  (m) =>
    m.atom
      ? []
      : [warn("atom", "no studio route — nobody can see it work before adopting it")],
  (m) =>
    m.port
      ? []
      : [warn("port", "port status unstated; adoption cannot tell if prod already has this")],
  (m) =>
    m.port?.status === "drifted" && !m.port.drift?.length
      ? [error("port.drift", "marked drifted but the divergences are not named")]
      : [],
  (m) =>
    m.states?.length
      ? []
      : [warn("states", "loading, empty, error and disabled are where ports go wrong")],
  (m) =>
    m.dependencies?.tokens?.length
      ? []
      : [
          warn(
            "dependencies.tokens",
            "unlisted token dependencies are the usual cause of a port rendering invisible",
          ),
        ],
];

/**
 * Run the completeness rules against one manifest: the built-in ruleset plus
 * any consumer-supplied `options.rules`.
 */
export function auditManifest<Status extends string = ComponentStatus>(
  manifest: ComponentManifest<Status>,
  options: AuditOptions<Status> = {},
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const rule of defaultAuditRules) issues.push(...rule(manifest));
  for (const rule of options.rules ?? []) issues.push(...rule(manifest));
  return issues;
}

/**
 * True when the manifest clears the bar for the status it claims. `bar` is
 * the status that must be earned — it defaults to `"graduated"` from the
 * built-in vocabulary; consumers with their own union pass their top status.
 * Any other status is self-declared and always passes.
 */
export function meetsStatus<Status extends string = ComponentStatus>(
  manifest: ComponentManifest<Status>,
  options: AuditOptions<Status> & { bar?: Status } = {},
): boolean {
  const bar = options.bar ?? ("graduated" as Status);
  if (manifest.status !== bar) return true;
  return !auditManifest(manifest, options).some((issue) => issue.level === "error");
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface SearchHit<Status extends string = ComponentStatus> {
  manifest: ComponentManifest<Status>;
  score: number;
  /** Which fields matched, so a caller can explain the hit. */
  matched: string[];
  /** Fraction of the query's content words that hit, 0–1. */
  coverage: number;
}

/**
 * Dropped before matching. An agent asking for "a dropdown for choosing which
 * model runs this" is describing a need in a sentence, not typing keywords,
 * and every one of these words would otherwise have to appear in a manifest
 * for the query to return anything.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "for", "of", "to", "in", "on", "with", "and", "or", "is",
  "are", "was", "be", "it", "this", "that", "which", "what", "how", "do", "does",
  "i", "we", "you", "my", "our", "can", "should", "would", "need", "want",
  "some", "any", "there", "here", "when", "where", "let", "lets", "me", "us",
  "component", "components", "ui", "widget", "thing", "something", "runs", "run",
  "using", "use", "used", "make", "get", "have", "has", "one", "way", "like",
]);

type SearchField = "id" | "name" | "keyword" | "summary" | "text";

const FIELD_WEIGHTS: [SearchField, number][] = [
  ["id", 12],
  ["name", 10],
  ["keyword", 8],
  ["summary", 4],
  ["text", 1],
];

/**
 * Relevance bonus by status: at equal relevance a finished component should
 * outrank a sketch. The default implements the built-in vocabulary
 * (graduated 3, candidate 1, draft 0); consumers with their own union pass
 * their own function via `SearchOptions.statusBoost`.
 */
export const defaultStatusBoost = (status: string): number =>
  status === "graduated" ? 3 : status === "candidate" ? 1 : 0;

export interface SearchOptions<Status extends string = ComponentStatus> {
  statusBoost?: (status: Status) => number;
}

/**
 * Coverage-weighted scoring. No server, no embeddings — substring matching
 * over the manifest's own text.
 *
 * Not token-AND. Requiring every term to hit reads as principled and fails
 * the one query that matters: an agent describing a need in a sentence gets
 * nothing back, because no manifest contains the word "choosing". Instead,
 * stopwords are dropped, any remaining term that hits contributes its best
 * field weight, and the total is scaled by how much of the query was
 * covered — so a precise query still outranks a vague one without the vague
 * one returning empty.
 *
 * Substring, not fuzzy: "picker" must not rank "Ticker" above the thing
 * actually called a picker. Trailing plurals are folded so "pickers" still
 * finds it.
 */
export function searchManifests<Status extends string = ComponentStatus>(
  manifests: ReadonlyArray<ComponentManifest<Status>>,
  query: string,
  options: SearchOptions<Status> = {},
): SearchHit<Status>[] {
  const boost = options.statusBoost ?? defaultStatusBoost;
  const raw = query.trim().toLowerCase().split(/[\s,/]+/).filter(Boolean);
  const terms = raw.filter((term) => term.length > 1 && !STOPWORDS.has(term));
  if (terms.length === 0) {
    return manifests.map((manifest) => ({
      manifest,
      score: 0,
      matched: [],
      coverage: 0,
    }));
  }

  const hits: SearchHit<Status>[] = [];
  for (const manifest of manifests) {
    const haystack: Record<SearchField, string> = {
      id: manifest.id.toLowerCase(),
      name: manifest.name.toLowerCase(),
      keyword: manifest.keywords.join(" ").toLowerCase(),
      summary: manifest.summary.toLowerCase(),
      text: [
        ...manifest.whenToUse,
        ...manifest.whenNotToUse,
        ...manifest.props.map((prop) => `${prop.name} ${prop.summary}`),
        ...(manifest.states ?? []).map((state) => `${state.name} ${state.behavior}`),
        ...manifest.source,
      ]
        .join(" ")
        .toLowerCase(),
    };

    let score = 0;
    const matched = new Set<string>();
    let hitTerms = 0;

    for (const term of terms) {
      // Fold a trailing plural so "pickers" and "models" still land.
      const variants = term.endsWith("s") && term.length > 3 ? [term, term.slice(0, -1)] : [term];
      let best = 0;
      let bestField = "";
      for (const [field, weight] of FIELD_WEIGHTS) {
        const text = haystack[field];
        if (!text) continue;
        for (const variant of variants) {
          if (!text.includes(variant)) continue;
          // Whole-word hits beat incidental substring hits.
          const exact = new RegExp(`\\b${escapeRegExp(variant)}\\b`).test(text);
          const value = exact ? weight * 1.5 : weight;
          if (value > best) {
            best = value;
            bestField = field;
          }
        }
      }
      if (best === 0) continue;
      score += best;
      hitTerms += 1;
      matched.add(bestField);
    }

    if (hitTerms === 0) continue;
    const coverage = hitTerms / terms.length;
    // Scaled, not gated: a query where every word landed beats one where two
    // words out of six did, but the vague one still comes back with something.
    score = score * (0.4 + 0.6 * coverage);
    score += boost(manifest.status);
    hits.push({
      manifest,
      score: Math.round(score * 10) / 10,
      matched: [...matched],
      coverage: Math.round(coverage * 100) / 100,
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.manifest.id.localeCompare(b.manifest.id));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
