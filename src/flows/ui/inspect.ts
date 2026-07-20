/**
 * Flow inspection model — page + in-surface region selection.
 *
 * Not design primitives. These let you select a page (or a region inside a
 * live embed) and get a discussable brief without opening Studio.
 *
 * Live surfaces opt in with:
 *   data-flow-region="slug"
 *   data-flow-label="Human label"
 *   data-flow-role="eyebrow|title|section|control|ledger|…"
 *   data-flow-note="optional intent"
 */

import type { CompNode } from "../render";
import type { CanvasPage } from "./types";
import {
  embedSlugFromSrc,
  type FlowEmbedRegistry,
  type FlowSurfaceRegion,
} from "./embedSurfaces";

export type FlowSelection =
  | { kind: "page"; pageId: string }
  | {
      kind: "region";
      pageId: string;
      regionId: string;
      label: string;
      role: string | null;
      note: string | null;
      text: string | null;
    }
  | {
      kind: "node";
      pageId: string;
      nodeId: string;
      type: string;
      path: string;
      props: Record<string, unknown>;
    };

export type SurfaceRegionMeta = FlowSurfaceRegion;

export function surfaceRegionsForPage(
  page: CanvasPage | null,
  embeds: FlowEmbedRegistry,
): readonly SurfaceRegionMeta[] {
  if (!page || page.root.type !== "Embed") return [];
  const src = String(page.root.props?.src ?? "");
  const slug = embedSlugFromSrc(src);
  if (!slug) return [];
  return embeds[slug]?.regions ?? [];
}

export function pageEmbedSlug(page: CanvasPage | null): string | null {
  if (!page || page.root.type !== "Embed") return null;
  return embedSlugFromSrc(String(page.root.props?.src ?? ""));
}

export type CompNodeOutline = {
  id: string;
  type: string;
  depth: number;
  summary: string;
  path: string;
  props: Record<string, unknown>;
  childCount: number;
};

function nodeSummary(node: CompNode): string {
  const p = node.props ?? {};
  if (typeof p.text === "string" && p.text.trim())
    return p.text.trim().slice(0, 72);
  if (typeof p.label === "string" && p.label.trim())
    return p.label.trim().slice(0, 72);
  if (typeof p.title === "string" && p.title.trim())
    return p.title.trim().slice(0, 72);
  if (typeof p.src === "string") return p.src.slice(0, 72);
  return "";
}

export function outlineCompTree(
  root: CompNode,
  max = 80,
): CompNodeOutline[] {
  const out: CompNodeOutline[] = [];
  const walk = (node: CompNode, depth: number, path: string) => {
    if (out.length >= max) return;
    out.push({
      id: node.id,
      type: node.type,
      depth,
      summary: nodeSummary(node),
      path,
      props: node.props ?? {},
      childCount: node.children?.length ?? 0,
    });
    (node.children ?? []).forEach((child, i) => {
      walk(child, depth + 1, `${path}/${child.type}[${i}]`);
    });
  };
  walk(root, 0, root.type);
  return out;
}

export function findCompNode(
  root: CompNode,
  id: string,
): CompNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findCompNode(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Compact brief for pasting into an agent chat. */
export function formatSelectionBrief(args: {
  mapName: string | null;
  page: CanvasPage | null;
  selection: FlowSelection | null;
  embeds?: FlowEmbedRegistry;
}): string {
  const { mapName, page, selection, embeds = {} } = args;
  if (!page) return "No page selected in Studio Flows.";

  const lines: string[] = [
    `Studio flow: ${mapName ?? "(unnamed)"}`,
    `Page: ${[page.journeyName, page.name].filter(Boolean).join(" · ")}`,
    `Page id: ${page.id}`,
    `Root: ${page.root.type}`,
    `World: ${Math.round(page.x)},${Math.round(page.y)} · ${page.width}×${page.height}`,
  ];

  if (page.root.type === "Embed") {
    lines.push(`Embed src: ${String(page.root.props?.src ?? "")}`);
    const slug = pageEmbedSlug(page);
    if (slug) lines.push(`Surface: ${slug}`);
  }

  if (!selection || selection.kind === "page") {
    lines.push("", "Selection: entire page");
    if (page.root.type === "Embed") {
      const regions = surfaceRegionsForPage(page, embeds);
      if (regions.length) {
        lines.push("Tagged regions:");
        for (const r of regions) {
          lines.push(
            `  - ${r.id}: ${r.label}${r.note ? ` — ${r.note}` : ""}`,
          );
        }
      }
    } else {
      const outline = outlineCompTree(page.root, 24);
      lines.push(`Comp tree (${outline.length} nodes, truncated):`);
      for (const n of outline.slice(0, 16)) {
        const pad = "  ".repeat(n.depth);
        lines.push(
          `${pad}- ${n.type}${n.summary ? `: ${n.summary}` : ""} (${n.id})`,
        );
      }
    }
    return lines.join("\n");
  }

  if (selection.kind === "region") {
    lines.push(
      "",
      `Selection: region \`${selection.regionId}\``,
      `Label: ${selection.label}`,
    );
    if (selection.role) lines.push(`Role: ${selection.role}`);
    if (selection.note) lines.push(`Note: ${selection.note}`);
    if (selection.text) lines.push(`Text: ${selection.text.slice(0, 400)}`);
    return lines.join("\n");
  }

  lines.push(
    "",
    `Selection: node \`${selection.nodeId}\``,
    `Type: ${selection.type}`,
    `Path: ${selection.path}`,
    `Props: ${JSON.stringify(selection.props).slice(0, 400)}`,
  );
  return lines.join("\n");
}

/** Event targets are often Text nodes — those have no `.closest`. */
export function eventTargetElement(target: EventTarget | null): Element | null {
  if (!target || !(target instanceof Node)) return null;
  if (target instanceof Element) return target;
  return target.parentElement;
}

export function regionFromElement(
  el: Element | null,
): {
  regionId: string;
  label: string;
  role: string | null;
  note: string | null;
  text: string | null;
} | null {
  if (!el) return null;
  const host = el.closest("[data-flow-region]") as HTMLElement | null;
  if (!host) return null;
  const regionId = host.getAttribute("data-flow-region");
  if (!regionId) return null;
  return {
    regionId,
    label:
      host.getAttribute("data-flow-label") ??
      regionId.replace(/-/g, " "),
    role: host.getAttribute("data-flow-role"),
    note: host.getAttribute("data-flow-note"),
    text: (host.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 280) ||
      null,
  };
}
