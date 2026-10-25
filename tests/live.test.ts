import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { distancesFrom, entryHops, parsePathAliases, parseRefs, resolveImport } from "../src/live/graph";
import { attributeChange, foldStage } from "../src/live/stage";
import { closeStudioLiveWatchers, createStudioLiveHandler } from "../src/live/server";
import type { LiveChange, LiveServerEvent } from "../src/live/types";

const change = (id: number, pages: LiveChange["pages"], at = id): LiveChange => ({
  id, at, file: "study.tsx", pages,
});

describe("live page attribution", () => {
  test("matches route names without confusing unrelated single-word components", () => {
    expect(entryHops("cross-app-tabs", "src/CrossAppTabsStudy.tsx")).toBe(0);
    expect(entryHops("cross-app-tabs", "src/cross-app-tabs/Panel.tsx")).toBe(0);
    expect(entryHops("cross-app-tabs", "src/CrossApp.tsx")).toBe(1);
    expect(entryHops("cross-app-tabs", "src/Tabs.tsx")).toBeUndefined();
  });

  test("resolves aliases, extensionless imports, and public study assets", () => {
    const aliases = parsePathAliases(`{
      // An ordinary Next host configuration.
      "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, },
    }`, "/host");
    const files = new Set(["/host/src/shared/index.tsx", "/host/src/theme.css"]);
    const context = { aliases, publicDir: "/host/public", has: (file: string) => files.has(file) };
    expect(resolveImport("@/shared", "/host/src/Study.tsx", context)).toBe("/host/src/shared/index.tsx");
    expect(resolveImport("./theme.css?inline", "/host/src/Study.tsx", context)).toBe("/host/src/theme.css");
    expect(resolveImport("react", "/host/src/Study.tsx", context)).toBeUndefined();
    expect(parseRefs(`import "./theme.css"; export { x } from "@/shared"; const src = "/study/board.html";`, "Study.tsx"))
      .toEqual({ imports: ["@/shared", "./theme.css"], publicRefs: ["/study/board.html"] });
  });

  test("keeps shortest distances through cyclic imports", () => {
    const edges = new Map([["entry", ["shared", "other"]], ["shared", ["other"]], ["other", ["entry"]]]);
    expect([...distancesFrom(new Map([["entry", 0]]), edges)])
      .toEqual([["entry", 0], ["shared", 1], ["other", 1]]);
  });

  test("shared changes keep the current stage but do not choose among many unrelated pages", () => {
    const shared = change(1, ["/a", "/b", "/c"].map((href) => ({ href, hops: 1 })));
    expect(attributeChange(shared, undefined)).toBeUndefined();
    expect(attributeChange(shared, "/b")).toBe("/b");
  });

  test("pins survive unrelated changes and release for a newer attributed study", () => {
    const first = change(1, [{ href: "/a", hops: 0 }], 10);
    const unowned = change(2, [], 30);
    const held = foldStage([unowned, first], { href: "/b", at: 20 });
    expect(held).toMatchObject({ href: "/b", latest: "/a", pinned: true, unattributed: 1 });
    const next = change(3, [{ href: "/c", hops: 0 }], 40);
    expect(foldStage([next, first, unowned], { href: "/b", at: 20 }))
      .toMatchObject({ href: "/c", latest: "/c", pinned: false, unattributed: 1 });
  });
});

const roots: string[] = [];
const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
afterEach(async () => {
  await Promise.all(readers.splice(0).map((reader) => reader.cancel()));
  closeStudioLiveWatchers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const repo = mkdtempSync(path.join(os.tmpdir(), "studio-live-"));
  roots.push(repo);
  const host = path.join(repo, "design/studio");
  mkdirSync(path.join(repo, ".git"));
  mkdirSync(path.join(host, "src"), { recursive: true });
  mkdirSync(path.join(repo, "docs"));
  return { repo, host };
}

async function subscribe(host: string, body: unknown) {
  const response = await createStudioLiveHandler({ root: host })(new Request("http://studio.local/api/studio/live", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  readers.push(reader);
  return async function next(): Promise<LiveServerEvent> {
    const timeout = setTimeout(() => void reader.cancel(), 4000);
    try {
      const { done, value } = await reader.read();
      if (done) throw new Error("Live stream closed before the expected event");
      return JSON.parse(new TextDecoder().decode(value).slice("data: ".length).trim());
    } finally {
      clearTimeout(timeout);
    }
  };
}

describe("live host stream", () => {
  test("rejects malformed subscriptions", async () => {
    const { host } = fixture();
    const response = await createStudioLiveHandler({ root: host })(new Request("http://studio.local", {
      method: "POST", body: JSON.stringify({ pages: "invalid" }),
    }));
    expect(response.status).toBe(400);
  });

  test("streams and replays an imported component edit to its owning page", async () => {
    const { host } = fixture();
    writeFileSync(path.join(host, "src/CrossAppTabs.tsx"), 'import "./shared";');
    const shared = path.join(host, "src/shared.tsx");
    writeFileSync(shared, "export const value = 1;");
    const pages = [{ href: "/studio/studies/cross-app-tabs" }];
    const next = await subscribe(host, { pages });
    expect(await next()).toMatchObject({ type: "hello", watching: 2, resolved: 1, root: "design/studio" });
    // macOS installs its native recursive watcher asynchronously, without a ready event.
    await Bun.sleep(250);
    writeFileSync(shared, "export const value = 2;");
    const event = await next();
    expect(event).toMatchObject({ type: "change", change: {
      file: "design/studio/src/shared.tsx", pages: [{ href: pages[0]!.href, hops: 1 }],
    } });
    if (event.type !== "change") throw new Error("Expected file change");
    const replay = await subscribe(host, { pages, since: event.change.at });
    expect((await replay()).type).toBe("hello");
    expect(await replay()).toEqual(event);
  });

  test("watches every registered document in one outside directory and excludes native or escaping sources", async () => {
    const { repo, host } = fixture();
    const second = path.join(repo, "docs/second.md");
    writeFileSync(path.join(repo, "docs/first.md"), "First");
    writeFileSync(second, "Second");
    writeFileSync(path.join(repo, "docs/Native.swift"), "// native");
    const next = await subscribe(host, { pages: [
      { href: "/first", source: ["docs/first.md"] },
      { href: "/second", source: ["docs/second.md"] },
      { href: "/native", source: ["docs/Native.swift"] },
      { href: "/escape", source: ["../outside.md"] },
    ] });
    expect(await next()).toMatchObject({ type: "hello", watching: 2, resolved: 2 });
    await Bun.sleep(250);
    writeFileSync(second, "Second updated");
    expect(await next()).toMatchObject({ type: "change", change: {
      file: "docs/second.md", pages: [{ href: "/second", hops: 0 }],
    } });
  });
});
