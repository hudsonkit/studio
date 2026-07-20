/** Studio Flows v2 — pages on a canvas as primitive trees with props. */

export const FLOW_VERSION = 2 as const;
export const DEFAULT_PORT = 29982;
export const DEFAULT_HOST = "127.0.0.1";

export type FlowTokens = Record<string, string>;

/** Closed allowlist — agents cannot invent components. */
export const PRIMITIVES = [
  "Box",
  "Stack",
  "Text",
  "Spacer",
  "HudButton",
  "HudBadge",
  "HudInput",
  "HudTextarea",
  "HudPanelSection",
  "HudListItem",
  "HudCheckbox",
  "HudToolbar",
  "Embed",
] as const;

export type PrimitiveType = (typeof PRIMITIVES)[number];

export type CompNode = {
  id: string;
  type: PrimitiveType;
  props: Record<string, unknown>;
  children?: CompNode[];
};

export type FlowPage = {
  id: string;
  name: string;
  /** Optional journey this page belongs to (canvas row). */
  journeyId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  root: CompNode;
};

/** Named left→right flow of pages (one canvas row). */
export type FlowJourney = {
  id: string;
  name: string;
  /** Canvas row baseline (page.y). */
  y: number;
  pageIds: string[];
};

export type FlowFile = {
  version: typeof FLOW_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tokens: FlowTokens;
  journeys: FlowJourney[];
  pages: FlowPage[];
};

/** Layout constants for glanceable multi-journey canvases. */
export const PAGE_GAP = 80;
export const ROW_GAP = 120;
export const DEFAULT_PAGE_W = 1440;
export const DEFAULT_PAGE_H = 900;

export const DEFAULT_TOKENS: FlowTokens = {
  "--room": "#ece9e2",
  "--raised": "#f8f6f1",
  "--ink": "#211f1c",
  "--soft": "#5b5952",
  "--faint": "#8c897f",
  "--instr": "#1b1c20",
  "--instr-ink": "#e7e6e2",
  "--instr-faint": "#8d8b86",
  "--capture": "#5a7d86",
  "--voice": "#b0512f",
  "--pause": "#c08a2e",
  "--proof-pass": "#3f8f6b",
};

export const PRIMITIVE_HINTS: Record<PrimitiveType, string> = {
  Box: "padding, gap, background, border, radius, width, height, flex, align, justify",
  Stack: "direction(row|column), gap, align, justify, padding, flex, background, width, height",
  Text: "text, size(px), weight, color, mono, serif, tracking, uppercase, lineHeight",
  Spacer: "size(px)",
  HudButton: "label, tone, variant, density, disabled",
  HudBadge: "label, tone, density, dot",
  HudInput: "value, placeholder, density",
  HudTextarea: "value, placeholder, rows",
  HudPanelSection: "title, defaultOpen",
  HudListItem: "title, description",
  HudCheckbox: "checked, label",
  HudToolbar: "density",
  Embed: "src(url), title — mounts a live design surface (e.g. a Studio route) as an iframe filling the page",
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function isPrimitive(type: string): type is PrimitiveType {
  return (PRIMITIVES as readonly string[]).includes(type);
}

export function emptyRoot(): CompNode {
  return {
    id: newId("n"),
    type: "Stack",
    props: {
      direction: "column",
      gap: 0,
      padding: 0,
      flex: 1,
      width: "100%",
      height: "100%",
    },
    children: [],
  };
}

export function emptyFile(name: string, id?: string): FlowFile {
  const stamp = nowIso();
  return {
    version: FLOW_VERSION,
    id: id ?? newId("file"),
    name,
    createdAt: stamp,
    updatedAt: stamp,
    tokens: { ...DEFAULT_TOKENS },
    journeys: [],
    pages: [],
  };
}

export function layoutJourneys(
  file: FlowFile,
  opts?: { pageGap?: number; rowGap?: number; startX?: number; startY?: number },
): FlowFile {
  const pageGap = opts?.pageGap ?? PAGE_GAP;
  const rowGap = opts?.rowGap ?? ROW_GAP;
  const startX = opts?.startX ?? 0;
  let y = opts?.startY ?? 0;
  const byId = new Map(file.pages.map((p) => [p.id, p]));

  for (const journey of file.journeys) {
    journey.y = y;
    let x = startX;
    for (const pageId of journey.pageIds) {
      const page = byId.get(pageId);
      if (!page) continue;
      page.x = x;
      page.y = y;
      page.journeyId = journey.id;
      x += page.width + pageGap;
    }
    const rowH = Math.max(
      DEFAULT_PAGE_H,
      ...journey.pageIds.map((id) => byId.get(id)?.height ?? DEFAULT_PAGE_H),
    );
    y += rowH + rowGap;
  }

  // Orphan pages (no journey) get a final row
  const claimed = new Set(file.journeys.flatMap((j) => j.pageIds));
  const orphans = file.pages.filter((p) => !claimed.has(p.id));
  if (orphans.length) {
    let x = startX;
    for (const page of orphans) {
      page.x = x;
      page.y = y;
      page.journeyId = undefined;
      x += page.width + pageGap;
    }
  }

  return file;
}

/** Chrome recipes so agents fill content, not re-derive shells. */
export type PageScaffold = "blank" | "app-shell" | "doc" | "modal";

/** Named multi-journey blueprint for one-shot product maps. */
export type JourneySpec = {
  name: string;
  pages: string[];
  scaffold?: PageScaffold;
};

export type ProductPack = {
  id: string;
  name: string;
  description: string;
  journeys: JourneySpec[];
};

/** Built-in packs — agent picks a pack to lay out a whole product at once. */
export const PRODUCT_PACKS: readonly ProductPack[] = [
  {
    id: "product-core",
    name: "Core product experience",
    description: "Acquisition → core loop → return journey",
    journeys: [
      {
        name: "Acquisition",
        pages: ["Landing", "Sign up", "Welcome"],
        scaffold: "app-shell",
      },
      {
        name: "Core loop",
        pages: ["Home", "Start task", "Work", "Complete"],
        scaffold: "app-shell",
      },
      {
        name: "Return",
        pages: ["Activity", "Notifications", "Settings"],
        scaffold: "app-shell",
      },
    ],
  },
] as const;

export function getPack(id: string): ProductPack | undefined {
  return PRODUCT_PACKS.find((p) => p.id === id);
}

export function applyScaffold(page: FlowPage, scaffold: PageScaffold): void {
  const root = emptyRoot();
  root.props = {
    direction: "column",
    gap: 0,
    padding: 0,
    flex: 1,
    width: "100%",
    height: "100%",
    background: "var(--room)",
  };

  if (scaffold === "blank") {
    page.root = root;
    return;
  }

  if (scaffold === "modal") {
    root.props = {
      ...root.props,
      align: "center",
      justify: "center",
      background: "rgba(25,24,21,0.35)",
      padding: 40,
    };
    const card: CompNode = {
      id: newId("n"),
      type: "Stack",
      props: {
        direction: "column",
        gap: 16,
        padding: 28,
        background: "var(--raised)",
        radius: 12,
        width: 480,
      },
      children: [
        {
          id: newId("n"),
          type: "Text",
          props: { text: page.name, size: 18, weight: 600, color: "var(--ink)" },
        },
        {
          id: newId("n"),
          type: "Text",
          props: {
            text: "Modal body — replace with content",
            size: 13,
            color: "var(--soft)",
          },
        },
      ],
    };
    root.children = [card];
    page.root = root;
    return;
  }

  if (scaffold === "doc") {
    root.props = { ...root.props, background: "var(--raised)", padding: 36, gap: 20 };
    root.children = [
      {
        id: newId("n"),
        type: "Text",
        props: {
          text: page.name,
          size: 28,
          weight: 700,
          serif: true,
          color: "var(--ink)",
        },
      },
      {
        id: newId("n"),
        type: "Text",
        props: {
          text: "Document spine — shares and moments go here",
          size: 14,
          color: "var(--soft)",
        },
      },
    ];
    page.root = root;
    return;
  }

  // app-shell: header + body
  const header: CompNode = {
    id: newId("n"),
    type: "Stack",
    props: {
      direction: "row",
      align: "center",
      justify: "space-between",
      padding: 16,
      height: 56,
      background: "var(--raised)",
      border: "0 0 1px 0 solid rgba(33,31,28,0.12)",
    },
    children: [
      {
        id: newId("n"),
        type: "Text",
        props: { text: page.name, size: 14, weight: 600, color: "var(--ink)" },
      },
      {
        id: newId("n"),
        type: "HudBadge",
        props: { label: "Screen", tone: "neutral", density: "compact" },
      },
    ],
  };
  const body: CompNode = {
    id: newId("n"),
    type: "Stack",
    props: {
      direction: "column",
      gap: 12,
      padding: 24,
      flex: 1,
      background: "var(--room)",
    },
    children: [
      {
        id: newId("n"),
        type: "Text",
        props: {
          text: "Body — upsert content under this Stack",
          size: 13,
          color: "var(--soft)",
        },
      },
    ],
  };
  root.children = [header, body];
  page.root = root;
}

export function touch(file: FlowFile): FlowFile {
  return { ...file, updatedAt: nowIso() };
}

export function parseFlowFile(raw: unknown): FlowFile {
  if (!raw || typeof raw !== "object") throw new Error("Invalid flow file: not an object");
  const o = raw as Record<string, unknown>;

  if (o.version !== 2) throw new Error(`Unsupported flow version: ${String(o.version)}`);
  if (typeof o.id !== "string" || typeof o.name !== "string") {
    throw new Error("Invalid flow file: missing id/name");
  }
  if (!Array.isArray(o.pages)) throw new Error("Invalid flow file: pages must be array");
  const file = o as FlowFile;
  if (!Array.isArray(file.journeys)) file.journeys = [];
  return file;
}

export function findNode(root: CompNode, id: string): CompNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(root: CompNode, id: string): CompNode | null {
  for (const child of root.children ?? []) {
    if (child.id === id) return root;
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return null;
}

export function summarizeTree(node: CompNode, depth = 0, maxDepth = 4): string {
  const pad = "  ".repeat(depth);
  const propKeys = Object.keys(node.props).slice(0, 6).join(",");
  const line = `${pad}${node.type}#${node.id.slice(0, 10)} {${propKeys}}`;
  if (depth >= maxDepth) {
    const n = node.children?.length ?? 0;
    return n ? `${line} …(${n} children)` : line;
  }
  const kids = (node.children ?? []).map((c) => summarizeTree(c, depth + 1, maxDepth));
  return [line, ...kids].join("\n");
}
