import { existsSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import {
  distancesFrom,
  entryHops,
  pageSlug,
  parsePathAliases,
  parseRefs,
  resolveImport,
  resolvePublicRef,
  type ParsedRefs,
  type PathAlias,
  type ResolveContext,
} from "./graph";
import type {
  LiveCandidate,
  LiveChange,
  LivePageRef,
  LiveServerEvent,
  LiveSubscribeRequest,
} from "./types";

/**
 * Host route for the study live view. Mount it once per host:
 *
 *   // app/api/studio/live/route.ts
 *   export { POST } from "studio/live/server";
 *
 * The view posts the pages it can render and keeps the response open; the
 * route streams one server-sent event per file change, naming the pages the
 * file belongs to. One recursive watcher per host root is shared by every
 * open view and survives route reloads.
 */

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".studio",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "coverage",
]);
const IGNORED_FILES = new Set(["next-env.d.ts"]);
const WATCHED_EXT = /\.(?:[cm]?[jt]sx?|css|mdx?|html?|svg|json)$/i;
/** Registry `source` files outside the host root count only as content, never as native code. */
const SOURCE_CONTENT_EXT = /\.(?:mdx?|html?|css|svg)$/i;
const PARSED_EXT = /\.(?:[cm]?[jt]sx?|css)$/i;
const SETTLE_MS = 120;
const PING_MS = 15_000;
const LOG_LIMIT = 500;
const MAX_PARSE_BYTES = 1_000_000;

interface FileRecord {
  mtimeMs: number;
  refs: ParsedRefs;
}

interface RawChange {
  id: number;
  at: number;
  file: string;
  removed: boolean;
}

interface Subscriber {
  pages: LivePageRef[];
  send(event: LiveServerEvent): void;
  memo?: { version: number; dists: Map<string, Map<string, number>> };
}

interface WatchState {
  root: string;
  repoRoot: string;
  publicDir: string;
  aliases: PathAlias[];
  files: Map<string, FileRecord>;
  /** Source files outside the root, watched through their directory. */
  outside: Set<string>;
  outsideDirs: Map<string, FSWatcher>;
  watcher?: FSWatcher;
  error?: string;
  log: RawChange[];
  nextId: number;
  version: number;
  edges?: { version: number; map: Map<string, string[]> };
  timers: Map<string, ReturnType<typeof setTimeout>>;
  subscribers: Set<Subscriber>;
}

const GLOBAL_KEY = "__studioLiveWatchers_v1";
const states: Map<string, WatchState> =
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<string, WatchState> | undefined) ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<string, WatchState>());

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function isInside(file: string, dir: string): boolean {
  return file === dir || file.startsWith(`${dir}${path.sep}`);
}

function isWatchedHostFile(state: WatchState, file: string): boolean {
  const rel = path.relative(state.root, file);
  if (!rel || rel.startsWith("..")) return false;
  const segments = rel.split(path.sep);
  if (segments.some((segment) => IGNORED_DIRS.has(segment))) return false;
  const base = segments[segments.length - 1]!;
  return WATCHED_EXT.test(base) && !IGNORED_FILES.has(base);
}

function readRecord(file: string): FileRecord | undefined {
  try {
    const stat = statSync(file);
    if (!stat.isFile()) return undefined;
    let refs: ParsedRefs = { imports: [], publicRefs: [] };
    if (PARSED_EXT.test(file) && stat.size <= MAX_PARSE_BYTES) {
      refs = parseRefs(readFileSync(file, "utf8"), file);
    }
    return { mtimeMs: stat.mtimeMs, refs };
  } catch {
    return undefined;
  }
}

function scan(state: WatchState, dir: string) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) scan(state, full);
    } else if (entry.isFile() && isWatchedHostFile(state, full)) {
      const record = readRecord(full);
      if (record) state.files.set(full, record);
    }
  }
}

function loadAliases(root: string): PathAlias[] {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    try {
      return parsePathAliases(readFileSync(path.join(root, name), "utf8"), root);
    } catch {
      // try the next config
    }
  }
  return [];
}

function stateFor(root: string): WatchState {
  const existing = states.get(root);
  if (existing) return existing;
  const state: WatchState = {
    root,
    repoRoot: findRepoRoot(root),
    publicDir: path.join(root, "public"),
    aliases: loadAliases(root),
    files: new Map(),
    outside: new Set(),
    outsideDirs: new Map(),
    log: [],
    nextId: 1,
    version: 0,
    timers: new Map(),
    subscribers: new Set(),
  };
  scan(state, root);
  try {
    state.watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const file = path.join(root, filename.toString());
      if (isWatchedHostFile(state, file)) queueSettle(state, file);
    });
    state.watcher.on("error", (error) => {
      state.error = error instanceof Error ? error.message : String(error);
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  states.set(root, state);
  return state;
}

function watchOutside(state: WatchState, file: string) {
  if (state.outside.has(file)) return;
  state.outside.add(file);
  const dir = path.dirname(file);
  if (!state.outsideDirs.has(dir)) {
    try {
      // Watch the directory, not the file: editors that save by rename would
      // otherwise orphan a file watcher after the first write.
      const watcher = watch(dir, (_event, filename) => {
        if (!filename) return;
        const changed = path.join(dir, filename.toString());
        if (state.outside.has(changed)) queueSettle(state, changed);
      });
      watcher.on("error", () => {});
      state.outsideDirs.set(dir, watcher);
    } catch {
      // Missing directory: the source entry points nowhere, nothing to watch.
    }
  }
  // Each source needs a record even when another source shares its watcher.
  const record = readRecord(file);
  if (record) {
    state.files.set(file, record);
    state.version += 1;
  }
}

function queueSettle(state: WatchState, file: string) {
  const pending = state.timers.get(file);
  if (pending) clearTimeout(pending);
  state.timers.set(
    file,
    setTimeout(() => {
      state.timers.delete(file);
      settle(state, file);
    }, SETTLE_MS),
  );
}

function settle(state: WatchState, file: string) {
  const known = state.files.get(file);
  const record = readRecord(file);
  let removed = false;
  if (record) {
    // FSEvents repeats itself; an unchanged mtime is not a change.
    if (known && known.mtimeMs === record.mtimeMs) return;
    state.files.set(file, record);
  } else {
    if (!known) return;
    state.files.delete(file);
    removed = true;
  }
  state.version += 1;
  const change: RawChange = { id: state.nextId++, at: Date.now(), file, removed };
  state.log.push(change);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  for (const subscriber of state.subscribers) {
    subscriber.send({ type: "change", change: describe(state, subscriber, change) });
  }
}

function edgesFor(state: WatchState): Map<string, string[]> {
  if (state.edges?.version === state.version) return state.edges.map;
  const context: ResolveContext = {
    aliases: state.aliases,
    publicDir: state.publicDir,
    has: (file) => state.files.has(file),
  };
  const map = new Map<string, string[]>();
  for (const [file, record] of state.files) {
    const targets = new Set<string>();
    for (const spec of record.refs.imports) {
      const target = resolveImport(spec, file, context);
      if (target && target !== file) targets.add(target);
    }
    for (const ref of record.refs.publicRefs) {
      const target = resolvePublicRef(ref, context);
      if (target) targets.add(target);
    }
    if (targets.size > 0) map.set(file, [...targets]);
  }
  state.edges = { version: state.version, map };
  return map;
}

function sourceFiles(state: WatchState, page: LivePageRef): string[] {
  const files: string[] = [];
  for (const source of page.source ?? []) {
    const file = path.resolve(state.repoRoot, source);
    if (!isInside(file, state.repoRoot)) continue;
    if (isInside(file, state.root)) {
      if (state.files.has(file)) files.push(file);
    } else if (SOURCE_CONTENT_EXT.test(file)) {
      watchOutside(state, file);
      if (state.files.has(file)) files.push(file);
    }
  }
  return files;
}

function distancesFor(state: WatchState, subscriber: Subscriber): Map<string, Map<string, number>> {
  // Source files may register new outside watches, which bumps the version,
  // so collect them before checking the memo.
  const sources = subscriber.pages.map((page) => sourceFiles(state, page));
  if (subscriber.memo?.version === state.version) return subscriber.memo.dists;
  const edges = edgesFor(state);
  const dists = new Map<string, Map<string, number>>();
  subscriber.pages.forEach((page, index) => {
    const slug = pageSlug(page.href);
    const entries = new Map<string, number>();
    for (const file of state.files.keys()) {
      if (!isInside(file, state.root)) continue;
      const hops = entryHops(slug, path.relative(state.root, file));
      if (hops !== undefined) entries.set(file, hops);
    }
    for (const file of sources[index]!) entries.set(file, 0);
    if (entries.size > 0) dists.set(page.href, distancesFrom(entries, edges));
  });
  subscriber.memo = { version: state.version, dists };
  return dists;
}

function describe(state: WatchState, subscriber: Subscriber, change: RawChange): LiveChange {
  const dists = distancesFor(state, subscriber);
  const pages: LiveCandidate[] = [];
  for (const page of subscriber.pages) {
    const hops = dists.get(page.href)?.get(change.file);
    if (hops !== undefined) pages.push({ href: page.href, hops });
  }
  // Stable sort keeps registry order among equally near pages.
  pages.sort((a, b) => a.hops - b.hops);
  return {
    id: change.id,
    at: change.at,
    file: toPosix(path.relative(state.repoRoot, change.file)),
    ...(change.removed ? { removed: true } : {}),
    pages,
  };
}

function parseRequest(body: unknown): LiveSubscribeRequest | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { pages, since } = body as Record<string, unknown>;
  if (!Array.isArray(pages)) return undefined;
  const refs: LivePageRef[] = [];
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const { href, source } = page as Record<string, unknown>;
    if (typeof href !== "string" || !href.startsWith("/")) continue;
    refs.push({
      href,
      source: Array.isArray(source)
        ? source.filter((item): item is string => typeof item === "string")
        : undefined,
    });
  }
  return { pages: refs, since: typeof since === "number" ? since : undefined };
}

export interface StudioLiveHandlerOptions {
  /** Host root to watch. Defaults to the server's working directory. */
  root?: string;
}

export function createStudioLiveHandler(options: StudioLiveHandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const subscription = parseRequest(await request.json().catch(() => undefined));
    if (!subscription) {
      return Response.json({ error: "Expected { pages: [{ href, source? }], since? }" }, { status: 400 });
    }
    const state = stateFor(path.resolve(options.root ?? process.cwd()));
    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        const subscriber: Subscriber = {
          pages: subscription.pages,
          send(event) {
            if (!open) return;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } catch {
              cleanup();
            }
          },
        };
        const ping = setInterval(() => subscriber.send({ type: "ping", now: Date.now() }), PING_MS);
        cleanup = () => {
          if (!open) return;
          open = false;
          clearInterval(ping);
          state.subscribers.delete(subscriber);
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        };
        request.signal.addEventListener("abort", () => cleanup());

        const dists = distancesFor(state, subscriber);
        const watched = new Set<string>();
        for (const dist of dists.values()) for (const file of dist.keys()) watched.add(file);
        subscriber.send({
          type: "hello",
          now: Date.now(),
          watching: watched.size,
          resolved: dists.size,
          root: toPosix(path.relative(state.repoRoot, state.root)) || ".",
        });
        const since = subscription.since ?? Date.now();
        for (const change of state.log) {
          if (change.at >= since) {
            subscriber.send({ type: "change", change: describe(state, subscriber, change) });
          }
        }
        state.subscribers.add(subscriber);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        connection: "keep-alive",
      },
    });
  };
}

/** Ready-made handler for hosts whose server runs from the host root. */
export const POST = createStudioLiveHandler();

/** For tests: stop every watcher this process started. */
export function closeStudioLiveWatchers() {
  for (const state of states.values()) {
    state.watcher?.close();
    for (const watcher of state.outsideDirs.values()) watcher.close();
    for (const timer of state.timers.values()) clearTimeout(timer);
  }
  states.clear();
}
