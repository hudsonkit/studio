import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  auditManifest,
  createComponentRegistry,
  defaultAuditRules,
  meetsStatus,
  searchManifests,
  type AuditRule,
  type ComponentManifest,
} from "../src/components";
import {
  findRepoRoot,
  hashFile,
  portHashes,
  verifyManifest,
  verifyRegistry,
} from "../src/components/verify";

function manifest(overrides: Partial<ComponentManifest> = {}): ComponentManifest {
  return {
    id: "widget",
    name: "Widget",
    status: "graduated",
    summary: "A small widget that renders one short status word inline.",
    keywords: ["widget", "badge", "chip"],
    whenToUse: ["When a row needs a compact marker."],
    whenNotToUse: ["When the marker is interactive."],
    import: { from: "./Widget", symbols: ["Widget", "WidgetProps"] },
    props: [
      { name: "title", type: "string", required: true, summary: "The word shown." },
      {
        name: "mode",
        type: '"a" | "b"',
        default: '"a"',
        summary: "Which treatment is used.",
      },
    ],
    examples: [{ title: "Drop-in", code: `<Widget title="OK" />` }],
    source: ["src/Widget.tsx"],
    ...overrides,
  };
}

// ── audit ────────────────────────────────────────────────────────────────

describe("auditManifest", () => {
  test("a complete manifest has no errors", () => {
    const issues = auditManifest(manifest());
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  test("flags a non-kebab id and a label-length summary as errors", () => {
    const issues = auditManifest(manifest({ id: "NotKebab", summary: "Too short." }));
    const fields = issues.filter((i) => i.level === "error").map((i) => i.field);
    expect(fields).toContain("id");
    expect(fields).toContain("summary");
  });

  test("warns (not errors) on an undocumented default for a union prop", () => {
    const issues = auditManifest(
      manifest({ props: [{ name: "mode", type: '"a" | "b"', summary: "Treatment." }] }),
    );
    const issue = issues.find((i) => i.field === "props.mode");
    expect(issue?.level).toBe("warning");
  });

  test("exposes the built-in ruleset as composable rules", () => {
    expect(defaultAuditRules.length).toBeGreaterThan(5);
    for (const rule of defaultAuditRules) {
      expect(Array.isArray(rule(manifest()))).toBe(true);
    }
  });

  test("runs consumer-supplied rules after the built-ins", () => {
    const requireData: AuditRule = (m) =>
      m.data
        ? []
        : [{ level: "error", field: "data", message: "project rule: name a data contract" }];
    const issues = auditManifest(manifest(), { rules: [requireData] });
    expect(issues.some((i) => i.field === "data" && i.level === "error")).toBe(true);
    // The same rule makes a graduated manifest dishonest.
    expect(meetsStatus(manifest(), { rules: [requireData] })).toBe(false);
    expect(meetsStatus(manifest({ data: { module: "x.ts", summary: "s" } }), { rules: [requireData] })).toBe(true);
  });
});

describe("meetsStatus", () => {
  test("only the bar status has to clear the audit", () => {
    const broken = manifest({ summary: "Too short." });
    expect(meetsStatus(manifest({ ...broken, status: "draft" }))).toBe(true);
    expect(meetsStatus(manifest({ ...broken, status: "graduated" }))).toBe(false);
  });

  test("accepts a consumer-defined bar status", () => {
    type Custom = "wip" | "shipped";
    const m: ComponentManifest<Custom> = { ...manifest(), status: "shipped", summary: "Too short." };
    expect(meetsStatus(m, { bar: "shipped" })).toBe(false);
    expect(meetsStatus(m, { bar: "wip" })).toBe(true);
  });
});

// ── search ───────────────────────────────────────────────────────────────

describe("searchManifests", () => {
  const badge = manifest({ id: "badge", name: "Badge", status: "draft" });
  const chip = manifest({
    id: "chip",
    name: "Chip",
    status: "graduated",
    summary: "A small widget that renders one short status word inline.",
  });

  test("drops stopwords so a sentence query still hits", () => {
    const hits = searchManifests([badge], "a badge for the thing that shows status");
    expect(hits.length).toBe(1);
    expect(hits[0]!.manifest.id).toBe("badge");
  });

  test("folds trailing plurals", () => {
    const hits = searchManifests([badge], "badges");
    expect(hits.map((h) => h.manifest.id)).toEqual(["badge"]);
  });

  test("scales by coverage instead of requiring every term", () => {
    const vague = searchManifests([badge], "badge nonexistentword");
    expect(vague.length).toBe(1);
    expect(vague[0]!.coverage).toBe(0.5);
    const precise = searchManifests([badge], "badge inline");
    expect(precise[0]!.coverage).toBe(1);
    expect(precise[0]!.score).toBeGreaterThan(vague[0]!.score);
  });

  test("a graduated component outranks a draft at equal relevance", () => {
    // "marker" hits the same prose field in both manifests; only the boost differs.
    const hits = searchManifests([badge, chip], "marker");
    expect(hits.map((h) => h.manifest.id)).toEqual(["chip", "badge"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  test("id hits outweigh prose hits", () => {
    const prose = manifest({
      id: "zzz",
      name: "Zzz",
      whenToUse: ["badge badge badge"],
    });
    const hits = searchManifests([badge, prose], "badge");
    expect(hits[0]!.manifest.id).toBe("badge");
  });

  test("a query of only stopwords returns zero-score hits", () => {
    const hits = searchManifests([badge], "a the for");
    expect(hits.length).toBe(1);
    expect(hits[0]!.score).toBe(0);
  });
});

// ── registry ─────────────────────────────────────────────────────────────

describe("createComponentRegistry", () => {
  const registry = createComponentRegistry({
    manifests: [
      manifest({ id: "beta", name: "Beta", status: "draft" }),
      manifest({ id: "alpha", name: "Alpha" }),
    ],
  });

  test("all() sorts by name; get() and byStatus() filter", () => {
    expect(registry.all().map((m) => m.id)).toEqual(["alpha", "beta"]);
    expect(registry.get("beta")?.name).toBe("Beta");
    expect(registry.get("nope")).toBeUndefined();
    expect(registry.byStatus("draft").map((m) => m.id)).toEqual(["beta"]);
  });

  test("find() ranks and respects the limit", () => {
    expect(registry.find("widget").length).toBe(2);
    expect(registry.find("widget", 1).length).toBe(1);
  });

  test("health() reports honesty per manifest", () => {
    const health = registry.health();
    expect(health.find((h) => h.id === "alpha")?.honest).toBe(true);
    const dishonest = createComponentRegistry({
      manifests: [manifest({ summary: "Too short." })],
    });
    expect(dishonest.health()[0]!.honest).toBe(false);
  });

  test("threads consumer audit rules and a custom bar into health()", () => {
    const requireAtom: AuditRule = (m) =>
      m.atom ? [] : [{ level: "error", field: "atom", message: "required here" }];
    const custom = createComponentRegistry({
      manifests: [manifest()],
      auditRules: [requireAtom],
    });
    expect(custom.health()[0]!.honest).toBe(false);
    expect(custom.health()[0]!.errors).toBe(1);
  });
});

// ── verify ───────────────────────────────────────────────────────────────

const WIDGET_SOURCE = `export interface WidgetProps {
  title: string;
  mode?: "a" | "b";
  extra?: boolean;
}

export function Widget(props: WidgetProps) {
  return props.title;
}

export const WIDGET_DEFAULT = "a";
`;

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "studio-components-"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "Widget.tsx"), WIDGET_SOURCE);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("verifyManifest", () => {
  test("passes a truthful manifest", () => {
    const issues = verifyManifest(manifest(), { root });
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    // "extra" exists on WidgetProps but is undocumented: a warning.
    expect(issues.some((i) => i.level === "warning" && i.message.includes('"extra"'))).toBe(true);
  });

  test("errors on a source file that does not exist", () => {
    const issues = verifyManifest(manifest({ source: ["src/Gone.tsx"] }), { root });
    expect(issues.some((i) => i.level === "error" && i.field === "source")).toBe(true);
  });

  test("errors on an export the source does not provide", () => {
    const issues = verifyManifest(
      manifest({ import: { from: "./Widget", symbols: ["Widget", "Nope"] } }),
      { root },
    );
    expect(issues.some((i) => i.level === "error" && i.field === "import.symbols")).toBe(true);
  });

  test("errors on a documented prop the props type does not declare", () => {
    const issues = verifyManifest(
      manifest({
        props: [{ name: "phantom", type: "string", required: true, summary: "Not real." }],
      }),
      { root },
    );
    expect(
      issues.some((i) => i.level === "error" && i.message.includes('"phantom"')),
    ).toBe(true);
  });

  test("errors on a missing port target", () => {
    const issues = verifyManifest(
      manifest({ port: { status: "partial", target: "prod/Widget.tsx" } }),
      { root },
    );
    expect(issues.some((i) => i.level === "error" && i.field === "port.target")).toBe(true);
  });

  test("accepts matching verifiedAgainst hashes and warns on stale ones", () => {
    const hash = hashFile("src/Widget.tsx", { root })!;
    const fresh = verifyManifest(
      manifest({ port: { status: "synced", verifiedAgainst: { "src/Widget.tsx": hash } } }),
      { root },
    );
    expect(fresh.filter((i) => i.field === "port.verifiedAgainst")).toEqual([]);

    const stale = verifyManifest(
      manifest({
        port: {
          status: "drifted",
          drift: ["studio renders a span, prod renders a div"],
          ref: "abc123",
          verifiedAgainst: { "src/Widget.tsx": "000000000000" },
        },
      }),
      { root },
    );
    const warning = stale.find((i) => i.field === "port.verifiedAgainst");
    expect(warning?.level).toBe("warning");
    expect(warning?.message).toContain("abc123");
  });

  test("warns when a ported component records no hashes", () => {
    const issues = verifyManifest(manifest({ port: { status: "partial" } }), { root });
    expect(issues.some((i) => i.field === "port.verifiedAgainst")).toBe(true);
  });
});

describe("verifyRegistry", () => {
  test("errors on duplicate ids", () => {
    const issues = verifyRegistry([manifest(), manifest()]);
    expect(issues.some((i) => i.level === "error" && i.message.includes('"widget"'))).toBe(true);
    expect(verifyRegistry([manifest(), manifest({ id: "other" })])).toEqual([]);
  });
});

describe("hashFile / portHashes / findRepoRoot", () => {
  test("hashFile is deterministic and null for missing files", () => {
    const a = hashFile("src/Widget.tsx", { root });
    expect(a).toHaveLength(12);
    expect(hashFile("src/Widget.tsx", { root })).toBe(a);
    expect(hashFile("src/Gone.tsx", { root })).toBeNull();
  });

  test("portHashes covers the component source and the port target", () => {
    writeFileSync(join(root, "ProdWidget.tsx"), "export const x = 1;\n");
    const hashes = portHashes(
      manifest({ port: { status: "partial", target: "ProdWidget.tsx" } }),
      { root },
    );
    expect(Object.keys(hashes).sort()).toEqual(["ProdWidget.tsx", "src/Widget.tsx"]);
  });

  test("findRepoRoot walks up to the nearest .git", () => {
    mkdirSync(join(root, "src", "deep"), { recursive: true });
    expect(findRepoRoot(join(root, "src", "deep"))).toBe(root);
  });

  test("findRepoRoot throws when there is no .git above", () => {
    const nowhere = mkdtempSync(join(tmpdir(), "studio-noroot-"));
    try {
      expect(() => findRepoRoot(nowhere)).toThrow("no .git found");
    } finally {
      rmSync(nowhere, { recursive: true, force: true });
    }
  });
});
