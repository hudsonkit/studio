import {
  applyScaffold,
  DEFAULT_PAGE_H,
  DEFAULT_PAGE_W,
  emptyRoot,
  findNode,
  getPack,
  isPrimitive,
  layoutJourneys,
  newId,
  PRIMITIVE_HINTS,
  PRIMITIVES,
  PRODUCT_PACKS,
  summarizeTree,
  type CompNode,
  type JourneySpec,
  type PageScaffold,
  type FlowFile,
  type FlowJourney,
  type FlowPage,
  type PrimitiveType,
} from "../model";
import * as store from "./store";
import { getOpenFileId, setOpenFile } from "./session";
import {
  DEFAULT_STUDIO_BASE,
  flowPageApiUrl,
  studioPageUrl,
  writeHandoff,
} from "./http-api";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Injected by the HTTP server so open_in_studio can mint absolute URLs. */
let serverCtx: { host: string; port: number } = {
  host: "127.0.0.1",
  port: 29980,
};

export function setServerContext(ctx: { host: string; port: number }): void {
  serverCtx = ctx;
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function requireFile(sessionId: string, fileId?: string): Promise<FlowFile> {
  const id = fileId?.trim() || getOpenFileId(sessionId);
  if (!id) throw new Error("No file open. Call open_file or create_file first.");
  return store.loadFile(id);
}

async function write(sessionId: string, file: FlowFile): Promise<FlowFile> {
  const saved = await store.saveFile(file);
  setOpenFile(sessionId, saved.id);
  return saved;
}

function pageById(file: FlowFile, id: string): FlowPage | undefined {
  return file.pages.find((p) => p.id === id);
}

function nextPageOrigin(file: FlowFile): { x: number; y: number } {
  if (file.pages.length === 0) return { x: 0, y: 0 };
  const maxX = Math.max(...file.pages.map((p) => p.x + p.width));
  return { x: maxX + 80, y: file.pages[0]?.y ?? 0 };
}

function parsePx(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/px$/i, "").trim());
    if (Number.isFinite(n)) return Math.round(n);
  }
  return fallback;
}

export const TOOL_DEFS = [
  {
    name: "list_files",
    description: "List Studio Flows files (pages + primitive trees), newest first.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 200 } },
      additionalProperties: false,
    },
  },
  {
    name: "create_file",
    description: "Create a new composition file. Sticky-opens it.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        cloneFileId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "open_file",
    description: "Open a file by id for subsequent tool calls.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string", minLength: 1 } },
      required: ["fileId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_primitives",
    description: "Closed allowlist of layout + hudsonkit primitives and prop hints.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_basic_info",
    description: "Pages on the canvas with sizes/positions + token map.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "list_packs",
    description: "List built-in product packs (multi-journey blueprints) for one-shot layout.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_product_map",
    description:
      "FASTEST PATH: lay out an entire product experience in one call — multiple journeys (rows) with ordered pages. Pass a pack id from list_packs or a journeys array. Creates a file if none open.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "File name when creating a new file (default from pack or 'Product map')",
        },
        pack: {
          type: "string",
          description: "Built-in pack id from list_packs (for example product-core)",
        },
        journeys: {
          type: "array",
          description: "Custom journeys when not using a pack",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              pages: { type: "array", items: { type: "string" } },
              scaffold: { type: "string", enum: ["blank", "app-shell", "doc", "modal"] },
            },
            required: ["name", "pages"],
          },
        },
        scaffold: {
          type: "string",
          enum: ["blank", "app-shell", "doc", "modal"],
          description: "Default scaffold for journeys that omit one",
        },
        fileId: { type: "string", description: "Append to existing file instead of creating" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_journey",
    description:
      "Create a named user journey (canvas row) and optional ordered pages. Prefer create_product_map for whole products; use this to add one flow.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "e.g. Candidate, Interviewer, Review, Producer" },
        pages: {
          type: "array",
          items: { type: "string" },
          description: "Ordered page names left→right",
        },
        scaffold: {
          type: "string",
          enum: ["blank", "app-shell", "doc", "modal"],
          description: "Chrome recipe for each new page (default app-shell)",
        },
        y: { type: "number", description: "Optional row Y; default stacks under existing journeys" },
        fileId: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_journeys",
    description: "List journeys with ordered page ids and names.",
    inputSchema: {
      type: "object",
      properties: { fileId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "add_pages",
    description: "Append pages to an existing journey (left→right).",
    inputSchema: {
      type: "object",
      properties: {
        journeyId: { type: "string" },
        pages: { type: "array", items: { type: "string" } },
        scaffold: { type: "string", enum: ["blank", "app-shell", "doc", "modal"] },
        fileId: { type: "string" },
      },
      required: ["journeyId", "pages"],
      additionalProperties: false,
    },
  },
  {
    name: "layout_journeys",
    description: "Re-grid all journeys: each journey a row, pages left→right. Call after bulk creates for glance layout.",
    inputSchema: {
      type: "object",
      properties: {
        pageGap: { type: "number" },
        rowGap: { type: "number" },
        fileId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "scaffold_page",
    description: "Apply chrome recipe to a page root: blank | app-shell | doc | modal.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        scaffold: { type: "string", enum: ["blank", "app-shell", "doc", "modal"] },
        fileId: { type: "string" },
      },
      required: ["pageId", "scaffold"],
      additionalProperties: false,
    },
  },
  {
    name: "create_page",
    description:
      "Create a single page on the canvas. Prefer create_journey for whole flows.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        journeyId: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        scaffold: { type: "string", enum: ["blank", "app-shell", "doc", "modal"] },
        fileId: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tree",
    description: "Return the primitive tree for a page (or a subtree if nodeId is set).",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        nodeId: { type: "string" },
        fileId: { type: "string" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tree_summary",
    description: "Compact text hierarchy for a page.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        depth: { type: "number" },
        fileId: { type: "string" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "upsert_node",
    description:
      "Create or update a primitive node. If nodeId omitted, creates under parentId. type must be in list_primitives.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        parentId: { type: "string", description: "Parent node id (required when creating)" },
        nodeId: { type: "string", description: "Existing node to update" },
        type: { type: "string" },
        props: { type: "object" },
        index: { type: "integer", minimum: 0 },
        fileId: { type: "string" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "update_props",
    description: "Merge props onto an existing node.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        nodeId: { type: "string" },
        props: { type: "object" },
        fileId: { type: "string" },
      },
      required: ["pageId", "nodeId", "props"],
      additionalProperties: false,
    },
  },
  {
    name: "set_text",
    description: "Set props.text on a Text node (or any node with a text prop).",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        nodeId: { type: "string" },
        text: { type: "string" },
        fileId: { type: "string" },
      },
      required: ["pageId", "nodeId", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "move_page",
    description: "Reposition a page on the canvas (x/y) and optional width/height.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        fileId: { type: "string" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "rename_page",
    description: "Rename a page.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        name: { type: "string" },
        fileId: { type: "string" },
      },
      required: ["pageId", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_pages",
    description: "Delete one or more pages.",
    inputSchema: {
      type: "object",
      properties: {
        pageIds: { type: "array", items: { type: "string" } },
        fileId: { type: "string" },
      },
      required: ["pageIds"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_nodes",
    description: "Delete nodes (and descendants) within a page. Cannot delete the page root.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        nodeIds: { type: "array", items: { type: "string" } },
        fileId: { type: "string" },
      },
      required: ["pageId", "nodeIds"],
      additionalProperties: false,
    },
  },
  {
    name: "export_tree",
    description: "Export page JSON (primitive tree) for handoff or review.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        fileId: { type: "string" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "export_page",
    description:
      "Export a single page with tokens + Studio/API URLs (read-only; does not write handoff).",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        fileId: { type: "string" },
        studioBase: { type: "string", description: "Override Studio origin (default http://localhost:3033)" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
  {
    name: "open_in_studio",
    description:
      "Bring an individual page into Studio for focused work. Writes a handoff record and returns the Studio deep-link URL. Agent workflow: lay out journey in Flows → open_in_studio for the page to refine.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        fileId: { type: "string" },
        studioBase: {
          type: "string",
          description: "Studio origin (default http://localhost:3033 or STUDIO_FLOWS_STUDIO_URL)",
        },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
  },
] as const;

export async function callTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "list_files": {
        const limit = typeof args.limit === "number" ? args.limit : 50;
        const files = (await store.listFiles()).slice(0, limit);
        return ok({ files, count: files.length, root: store.libraryRoot() });
      }
      case "create_file": {
        const nameArg =
          typeof args.name === "string" && args.name.trim() ? args.name.trim() : "Untitled";
        const clone = typeof args.cloneFileId === "string" ? args.cloneFileId : undefined;
        const file = await store.createFile(nameArg, clone);
        setOpenFile(sessionId, file.id);
        return ok({ fileId: file.id, name: file.name, path: store.resolveFilePath(file.id) });
      }
      case "open_file": {
        const file = await store.loadFile(String(args.fileId ?? ""));
        setOpenFile(sessionId, file.id);
        return ok(basicInfo(file));
      }
      case "list_primitives": {
        return ok({
          primitives: PRIMITIVES.map((type) => ({ type, props: PRIMITIVE_HINTS[type] })),
        });
      }
      case "get_basic_info": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        return ok(basicInfo(file));
      }
      case "list_packs": {
        return ok({
          packs: PRODUCT_PACKS.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            journeyCount: p.journeys.length,
            pageCount: p.journeys.reduce((n, j) => n + j.pages.length, 0),
            journeys: p.journeys.map((j) => ({
              name: j.name,
              pages: j.pages,
              scaffold: j.scaffold ?? "app-shell",
            })),
          })),
        });
      }
      case "create_product_map": {
        const defaultScaffold = parseScaffold(args.scaffold) ?? "app-shell";
        let specs: JourneySpec[] = [];
        let fileName =
          typeof args.name === "string" && args.name.trim() ? args.name.trim() : "Product map";

        if (typeof args.pack === "string" && args.pack.trim()) {
          const pack = getPack(args.pack.trim());
          if (!pack) {
            return err(
              `Unknown pack: ${args.pack}. Call list_packs. Known: ${PRODUCT_PACKS.map((p) => p.id).join(", ")}`,
            );
          }
          specs = pack.journeys;
          if (!args.name) fileName = pack.name;
        } else if (Array.isArray(args.journeys) && args.journeys.length) {
          specs = (args.journeys as unknown[]).map((raw) => {
            const j = raw as Record<string, unknown>;
            return {
              name: String(j.name ?? "Journey"),
              pages: Array.isArray(j.pages) ? j.pages.map(String).filter(Boolean) : [],
              scaffold: parseScaffold(j.scaffold) ?? undefined,
            };
          });
        } else {
          return err("Provide a pack id from list_packs or journeys: [{ name, pages }].");
        }

        if (!specs.length) return err("No journeys to create");

        // New file by default; pass fileId to append journeys to an existing map.
        let file: FlowFile;
        if (typeof args.fileId === "string" && args.fileId.trim()) {
          file = await requireFile(sessionId, args.fileId);
        } else {
          file = await store.createFile(fileName);
          setOpenFile(sessionId, file.id);
        }

        ensureJourneys(file);
        const created = appendJourneys(file, specs, defaultScaffold);
        layoutJourneys(file);
        await write(sessionId, file);
        return ok({
          fileId: file.id,
          fileName: file.name,
          path: store.resolveFilePath(file.id),
          pack: typeof args.pack === "string" ? args.pack : null,
          journeys: created,
          pageCount: file.pages.length,
          journeyCount: file.journeys.length,
          hint: "Fill pages with upsert_node under each rootId (app-shell body = root.children[1]).",
        });
      }
      case "create_journey": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        ensureJourneys(file);
        const nameArg = typeof args.name === "string" ? args.name : "Journey";
        const pageNames = Array.isArray(args.pages)
          ? (args.pages as unknown[]).map(String).filter(Boolean)
          : [];
        const scaffold = parseScaffold(args.scaffold) ?? "app-shell";
        const y =
          typeof args.y === "number"
            ? args.y
            : nextJourneyY(file);
        const journey: FlowJourney = {
          id: newId("journey"),
          name: nameArg,
          y,
          pageIds: [],
        };
        const createdPages: { pageId: string; rootId: string; name: string }[] = [];
        let x = 0;
        for (const pageName of pageNames) {
          const page = makePage(pageName, x, y, scaffold);
          page.journeyId = journey.id;
          file.pages.push(page);
          journey.pageIds.push(page.id);
          createdPages.push({ pageId: page.id, rootId: page.root.id, name: page.name });
          x += page.width + 80;
        }
        file.journeys.push(journey);
        layoutJourneys(file);
        await write(sessionId, file);
        return ok({
          journeyId: journey.id,
          name: journey.name,
          pages: createdPages,
          hint: "Fill each page with upsert_node under rootId. Call layout_journeys after more journeys.",
        });
      }
      case "list_journeys": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        ensureJourneys(file);
        const byId = new Map(file.pages.map((p) => [p.id, p]));
        return ok({
          journeys: file.journeys.map((j) => ({
            id: j.id,
            name: j.name,
            y: j.y,
            pages: j.pageIds.map((id) => {
              const p = byId.get(id);
              return p
                ? { pageId: p.id, name: p.name, rootId: p.root.id, x: p.x, y: p.y }
                : { pageId: id, missing: true };
            }),
          })),
        });
      }
      case "add_pages": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        ensureJourneys(file);
        const journey = file.journeys.find((j) => j.id === args.journeyId);
        if (!journey) return err(`Journey not found: ${String(args.journeyId)}`);
        const scaffold = parseScaffold(args.scaffold) ?? "app-shell";
        const pageNames = Array.isArray(args.pages)
          ? (args.pages as unknown[]).map(String).filter(Boolean)
          : [];
        const created: { pageId: string; rootId: string; name: string }[] = [];
        for (const pageName of pageNames) {
          const page = makePage(pageName, 0, journey.y, scaffold);
          page.journeyId = journey.id;
          file.pages.push(page);
          journey.pageIds.push(page.id);
          created.push({ pageId: page.id, rootId: page.root.id, name: page.name });
        }
        layoutJourneys(file);
        await write(sessionId, file);
        return ok({ journeyId: journey.id, pages: created });
      }
      case "layout_journeys": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        ensureJourneys(file);
        layoutJourneys(file, {
          pageGap: typeof args.pageGap === "number" ? args.pageGap : undefined,
          rowGap: typeof args.rowGap === "number" ? args.rowGap : undefined,
        });
        await write(sessionId, file);
        return ok(basicInfo(file));
      }
      case "scaffold_page": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const scaffold = parseScaffold(args.scaffold);
        if (!scaffold) return err("scaffold must be blank|app-shell|doc|modal");
        applyScaffold(page, scaffold);
        await write(sessionId, file);
        return ok({ pageId: page.id, rootId: page.root.id, scaffold });
      }
      case "create_page": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        ensureJourneys(file);
        const scaffold = parseScaffold(args.scaffold) ?? "blank";
        const origin = nextPageOrigin(file);
        const page = makePage(
          typeof args.name === "string" ? args.name : "Page",
          typeof args.x === "number" ? args.x : origin.x,
          typeof args.y === "number" ? args.y : origin.y,
          scaffold,
        );
        if (typeof args.width === "number") page.width = args.width;
        if (typeof args.height === "number") page.height = args.height;
        if (typeof args.journeyId === "string") {
          const journey = file.journeys.find((j) => j.id === args.journeyId);
          if (journey) {
            page.journeyId = journey.id;
            journey.pageIds.push(page.id);
            page.y = journey.y;
          }
        }
        file.pages.push(page);
        if (page.journeyId) layoutJourneys(file);
        await write(sessionId, file);
        return ok({
          pageId: page.id,
          rootId: page.root.id,
          name: page.name,
          worldX: page.x,
          worldY: page.y,
          width: page.width,
          height: page.height,
        });
      }
      case "get_tree": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        if (typeof args.nodeId === "string" && args.nodeId) {
          const node = findNode(page.root, args.nodeId);
          if (!node) return err(`Node not found: ${args.nodeId}`);
          return ok({ pageId: page.id, node });
        }
        return ok({ pageId: page.id, name: page.name, root: page.root });
      }
      case "get_tree_summary": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const depth = typeof args.depth === "number" ? args.depth : 4;
        return ok({
          pageId: page.id,
          name: page.name,
          summary: summarizeTree(page.root, 0, depth),
        });
      }
      case "upsert_node": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const props =
          args.props && typeof args.props === "object"
            ? (args.props as Record<string, unknown>)
            : {};

        if (typeof args.nodeId === "string" && args.nodeId) {
          const node = findNode(page.root, args.nodeId);
          if (!node) return err(`Node not found: ${args.nodeId}`);
          if (typeof args.type === "string" && args.type) {
            if (!isPrimitive(args.type)) return err(`Unknown primitive: ${args.type}`);
            node.type = args.type;
          }
          node.props = { ...node.props, ...props };
          await write(sessionId, file);
          return ok({ pageId: page.id, node });
        }

        const parentId = String(args.parentId ?? "");
        if (!parentId) return err("parentId required when creating a node");
        const parent = findNode(page.root, parentId);
        if (!parent) return err(`Parent not found: ${parentId}`);
        const type = String(args.type ?? "");
        if (!isPrimitive(type)) return err(`Unknown primitive: ${type}. Call list_primitives.`);
        const node: CompNode = {
          id: newId("n"),
          type: type as PrimitiveType,
          props: { ...props },
          children: [],
        };
        parent.children = parent.children ?? [];
        const index = typeof args.index === "number" ? args.index : parent.children.length;
        parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, node);
        await write(sessionId, file);
        return ok({ pageId: page.id, node, parentId });
      }
      case "update_props": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const node = findNode(page.root, String(args.nodeId ?? ""));
        if (!node) return err(`Node not found: ${String(args.nodeId)}`);
        const props =
          args.props && typeof args.props === "object"
            ? (args.props as Record<string, unknown>)
            : {};
        node.props = { ...node.props, ...props };
        await write(sessionId, file);
        return ok({ pageId: page.id, node });
      }
      case "set_text": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const node = findNode(page.root, String(args.nodeId ?? ""));
        if (!node) return err(`Node not found: ${String(args.nodeId)}`);
        node.props = { ...node.props, text: String(args.text ?? "") };
        if (node.type === "HudButton" || node.type === "HudBadge") {
          node.props.label = String(args.text ?? "");
        }
        await write(sessionId, file);
        return ok({ pageId: page.id, node });
      }
      case "move_page": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        if (typeof args.x === "number") page.x = Math.round(args.x);
        if (typeof args.y === "number") page.y = Math.round(args.y);
        if (typeof args.width === "number") page.width = Math.round(args.width);
        if (typeof args.height === "number") page.height = Math.round(args.height);
        await write(sessionId, file);
        return ok({
          pageId: page.id,
          x: page.x,
          y: page.y,
          width: page.width,
          height: page.height,
        });
      }
      case "rename_page": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        page.name = String(args.name ?? page.name).slice(0, 80);
        await write(sessionId, file);
        return ok({ pageId: page.id, name: page.name });
      }
      case "delete_pages": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        ensureJourneys(file);
        const ids = new Set((args.pageIds as string[] | undefined) ?? []);
        file.pages = file.pages.filter((p) => !ids.has(p.id));
        for (const journey of file.journeys) {
          journey.pageIds = journey.pageIds.filter((id) => !ids.has(id));
        }
        file.journeys = file.journeys.filter((j) => j.pageIds.length > 0);
        layoutJourneys(file);
        await write(sessionId, file);
        return ok({ deleted: [...ids] });
      }
      case "delete_nodes": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const ids = new Set((args.nodeIds as string[] | undefined) ?? []);
        if (ids.has(page.root.id)) return err("Cannot delete page root; delete_pages instead");
        const remove = (node: CompNode): CompNode => ({
          ...node,
          children: (node.children ?? [])
            .filter((c) => !ids.has(c.id))
            .map(remove),
        });
        page.root = remove(page.root);
        await write(sessionId, file);
        return ok({ deleted: [...ids] });
      }
      case "export_tree": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        return ok({ page });
      }
      case "export_page": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const studioBase =
          typeof args.studioBase === "string" && args.studioBase.trim()
            ? args.studioBase.trim()
            : DEFAULT_STUDIO_BASE;
        const journey = file.journeys.find((j) => j.id === page.journeyId);
        return ok({
          fileId: file.id,
          fileName: file.name,
          journeyId: journey?.id ?? null,
          journeyName: journey?.name ?? null,
          page,
          tokens: file.tokens,
          studioUrl: studioPageUrl(file.id, page.id, studioBase),
          flowApiUrl: flowPageApiUrl(file.id, page.id, serverCtx.port, serverCtx.host),
          flowViewRedirect: `http://${serverCtx.host}:${serverCtx.port}/view/${file.id}/${page.id}`,
        });
      }
      case "open_in_studio": {
        const file = await requireFile(sessionId, args.fileId as string | undefined);
        const page = pageById(file, String(args.pageId ?? ""));
        if (!page) return err(`Page not found: ${String(args.pageId)}`);
        const studioBase =
          typeof args.studioBase === "string" && args.studioBase.trim()
            ? args.studioBase.trim()
            : DEFAULT_STUDIO_BASE;
        const handoff = await writeHandoff(file, page, {
          port: serverCtx.port,
          host: serverCtx.host,
          studioBase,
        });
        return ok({
          ...handoff,
          hint: "Open studioUrl in Studio Flows (bun run dev:studio) to inspect the journey map and its live screens.",
        });
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

function ensureJourneys(file: FlowFile): void {
  if (!Array.isArray(file.journeys)) file.journeys = [];
}

function parseScaffold(v: unknown): PageScaffold | null {
  if (v === "blank" || v === "app-shell" || v === "doc" || v === "modal") return v;
  return null;
}

function nextJourneyY(file: FlowFile): number {
  if (!file.journeys.length) return 0;
  const maxY = Math.max(...file.journeys.map((j) => j.y));
  return maxY + DEFAULT_PAGE_H + 120;
}

function makePage(name: string, x: number, y: number, scaffold: PageScaffold): FlowPage {
  const page: FlowPage = {
    id: newId("page"),
    name,
    x,
    y,
    width: DEFAULT_PAGE_W,
    height: DEFAULT_PAGE_H,
    root: emptyRoot(),
  };
  applyScaffold(page, scaffold);
  return page;
}

/** Append journey specs to a file (does not layout or save). */
function appendJourneys(
  file: FlowFile,
  specs: JourneySpec[],
  defaultScaffold: PageScaffold,
): {
  journeyId: string;
  name: string;
  pages: { pageId: string; rootId: string; name: string }[];
}[] {
  const created: {
    journeyId: string;
    name: string;
    pages: { pageId: string; rootId: string; name: string }[];
  }[] = [];
  let y = nextJourneyY(file);
  for (const spec of specs) {
    const scaffold = spec.scaffold ?? defaultScaffold;
    const journey: FlowJourney = {
      id: newId("journey"),
      name: spec.name,
      y,
      pageIds: [],
    };
    const pages: { pageId: string; rootId: string; name: string }[] = [];
    let x = 0;
    for (const pageName of spec.pages) {
      const page = makePage(pageName, x, y, scaffold);
      page.journeyId = journey.id;
      file.pages.push(page);
      journey.pageIds.push(page.id);
      pages.push({ pageId: page.id, rootId: page.root.id, name: page.name });
      x += page.width + 80;
    }
    file.journeys.push(journey);
    created.push({ journeyId: journey.id, name: journey.name, pages });
    y += DEFAULT_PAGE_H + 120;
  }
  return created;
}

function basicInfo(file: FlowFile) {
  ensureJourneys(file);
  return {
    fileId: file.id,
    fileName: file.name,
    path: store.resolveFilePath(file.id),
    journeyCount: file.journeys.length,
    pageCount: file.pages.length,
    journeys: file.journeys.map((j) => ({
      id: j.id,
      name: j.name,
      y: j.y,
      pageIds: j.pageIds,
    })),
    pages: file.pages.map((p) => ({
      id: p.id,
      name: p.name,
      journeyId: p.journeyId ?? null,
      width: p.width,
      height: p.height,
      worldX: p.x,
      worldY: p.y,
      rootId: p.root.id,
      rootType: p.root.type,
    })),
    tokens: file.tokens,
    primitives: [...PRIMITIVES],
    updatedAt: file.updatedAt,
  };
}
