import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findStudioManifest,
  resolveDevRoot,
  resolveMcpPort,
} from "../bin/local-discovery.mjs";
import { hostApiRequest, startStudioHost, studioHostPaths } from "../bin/local-host.mjs";

const hosts = [];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop({ preserveState: false })));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "studio-disc-"));
  temporaryDirectories.push(root);
  return root;
}

async function register(paths, id, repoRoot) {
  await hostApiRequest(`/v1/registrations/${id}`, {
    paths,
    method: "PUT",
    body: {
      repo: { name: id, root: repoRoot },
      workingDirectory: repoRoot,
      upstream: { host: "127.0.0.1", port: 3_060 },
      process: { pid: process.pid },
      liveness: { ttlMs: 0 },
    },
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function eventually(read, predicate, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read().catch(() => undefined);
    if (value !== undefined && predicate(value)) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`condition not met; last value: ${JSON.stringify(value)}`);
}

describe("studio discovery files", () => {
  test("the host writes config, manifest, inventory and README into its home and keeps them current", async () => {
    const root = await temporaryRoot();
    const repoRoot = join(root, "repo");
    await mkdir(join(repoRoot, ".studio"), { recursive: true });
    await writeFile(join(repoRoot, ".studio", "project.json"), JSON.stringify({ id: "sample-repo", label: "Sample Repo" }));
    const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
    const host = await startStudioHost({ disableMdns: true, paths, proxyPort: 0, mcpPort: 0, sweepMs: 10_000 });
    hosts.push(host);

    // Home is the host dir's parent, so tests never touch the real ~/.studio.
    expect(host.home).toBe(root);
    const config = await readJson(join(root, "config.json"));
    expect(config.mcp).toEqual({ enabled: true, port: null });
    expect((await stat(join(root, "config.json"))).mode & 0o777).toBe(0o644);

    const manifest = await readJson(join(root, "studio.json"));
    expect(manifest.kind).toBe("studio-home");
    expect(manifest.server.running).toBe(true);
    expect(manifest.server.pid).toBe(process.pid);
    expect(manifest.server.controlSocket).toBe(paths.socket);
    expect(manifest.server.commands.start).toBe("studio host start");
    expect(manifest.mcp.url).toBe(host.mcpUrl());
    expect(manifest.mcp.transport).toBe("streamable-http");
    expect(manifest.mcp.tools).toContain("create_page");
    expect(manifest.mcp.connect.mcpJson.mcpServers.studio.url).toBe(host.mcpUrl());
    expect(manifest.devRoot).toBeNull();
    expect(await readFile(join(root, "README.md"), "utf8")).toContain("studio.json");

    await register(paths, "sample-repo", repoRoot);
    const inventoryPath = join(root, "inventory.json");
    let inventory = await eventually(() => readJson(inventoryPath), (value) => value.spaces.length === 1);
    expect(inventory.spaces[0]).toMatchObject({ id: "sample-repo", label: "Sample Repo", root: repoRoot, live: true, pages: [] });

    const session = { id: "test-session", cursors: new Map() };
    await host.agentService.callTool(session, "create_page", { title: "Pick a direction", body: "# Options", agent: "tester" });
    await host.agentService.stores.get("sample-repo").addReviewerEvent("pick-a-direction", {
      kind: "comment",
      body: "Go with B",
      author: { name: "Ada" },
    });
    inventory = await eventually(
      () => readJson(inventoryPath),
      (value) => value.spaces[0].pages[0]?.feedback.open === 1,
    );
    expect(inventory.spaces[0].pages[0]).toMatchObject({
      slug: "pick-a-direction",
      title: "Pick a direction",
      status: "review",
      owner: { name: "tester" },
      feedback: { open: 1, total: 1 },
    });
    expect(inventory.spaces[0].pages[0].url).toEndWith(inventory.spaces[0].pages[0].href);
    expect(inventory.totals).toMatchObject({ spaces: 1, live: 1, pages: 1, openFeedback: 1 });

    const status = await hostApiRequest("/v1/status", { paths });
    expect(status.body.manifest).toBe(join(root, "studio.json"));

    await host.stop({ preserveState: false });
    const stopped = await readJson(join(root, "studio.json"));
    expect(stopped.server.running).toBe(false);
    expect(stopped.server.pid).toBeNull();
    expect(stopped.server.stoppedAt).toBeString();
    expect(stopped.mcp.available).toBe(false);
  });

  test("config.json can turn the MCP off and is never overwritten", async () => {
    const root = await temporaryRoot();
    const userConfig = `${JSON.stringify({ mcp: { enabled: false }, note: "mine" })}\n`;
    await writeFile(join(root, "config.json"), userConfig);
    const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
    const host = await startStudioHost({ disableMdns: true, environment: {}, paths, proxyPort: 0, sweepMs: 10_000 });
    hosts.push(host);
    expect(host.mcpUrl()).toBeNull();
    expect(await readFile(join(root, "config.json"), "utf8")).toBe(userConfig);
    const manifest = await readJson(join(root, "studio.json"));
    expect(manifest.mcp.available).toBe(false);
    expect(manifest.mcp.connect).toBeNull();
  });

  test("the real home mirrors its files into the derived dev root", async () => {
    const root = await temporaryRoot();
    const userHome = join(root, "u");
    const repoRoot = join(userHome, "dev", "repo");
    await mkdir(repoRoot, { recursive: true });
    const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
    const host = await startStudioHost({
      disableMdns: true,
      paths,
      home: join(userHome, ".studio"),
      userHome,
      proxyPort: 0,
      mcpPort: 0,
      sweepMs: 10_000,
    });
    hosts.push(host);
    await register(paths, "repo", repoRoot);

    const mirrored = join(userHome, "dev", ".studio");
    const manifest = await eventually(() => readJson(join(mirrored, "studio.json")), Boolean);
    expect(manifest.devRoot).toBe(join(userHome, "dev"));
    expect(manifest.locations).toEqual([join(userHome, ".studio"), mirrored]);
    expect(manifest.mcp.url).toBe(host.mcpUrl());
    expect((await readJson(join(mirrored, "inventory.json"))).spaces[0].id).toBe("repo");

    // An agent working inside the repo finds the dev root's manifest on its way up.
    const found = await findStudioManifest(join(repoRoot, "src"), { userHome });
    expect(found.path).toBe(join(mirrored, "studio.json"));
  });
  test("studios recovered from stale registrations survive the next restart", async () => {
    const root = await temporaryRoot();
    const repoRoot = join(root, "repo");
    await mkdir(repoRoot, { recursive: true });
    const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
    const options = { disableMdns: true, paths, proxyPort: 0, mcpPort: 0, sweepMs: 10_000 };
    const first = await startStudioHost(options);
    await register(paths, "gone-repo", repoRoot);
    await first.stop({ preserveState: true });
    // Simulate a host from before studios.json existed, then let the registration go stale.
    await rm(paths.studios, { force: true });
    await rm(repoRoot, { recursive: true, force: true });

    const second = await startStudioHost(options);
    await second.stop({ preserveState: true });
    expect(second.registrations.size).toBe(0);
    expect((await readJson(paths.studios)).studios.map((studio) => studio.id)).toEqual(["gone-repo"]);

    const third = await startStudioHost(options);
    hosts.push(third);
    expect(third.listStudios().map((studio) => studio.id)).toEqual(["gone-repo"]);
  });
});

describe("discovery helpers", () => {
  test("resolveDevRoot uses the common parent of repos, only strictly inside the user's home", () => {
    const userHome = "/Users/someone";
    expect(resolveDevRoot({ repoRoots: ["/Users/someone/dev/a", "/Users/someone/dev/b"], userHome })).toBe("/Users/someone/dev");
    expect(resolveDevRoot({ repoRoots: ["/Users/someone/dev/a", "/Users/someone/dev/x/b"], userHome })).toBe("/Users/someone/dev");
    expect(resolveDevRoot({ repoRoots: ["/Users/someone/a"], userHome })).toBeNull();
    expect(resolveDevRoot({ repoRoots: ["/Users/someone/dev/a", "/tmp/b"], userHome })).toBeNull();
    expect(resolveDevRoot({ repoRoots: [], userHome })).toBeNull();
    expect(resolveDevRoot({ configured: "/work", repoRoots: ["/Users/someone/dev/a"], userHome })).toBe("/work");
  });

  test("resolveMcpPort prefers the option, then env, then config", () => {
    const config = { mcp: { enabled: true, port: 50_000 } };
    expect(resolveMcpPort({ option: 0, environment: { STUDIO_MCP_PORT: "1" }, config, fallback: 43_148 })).toBe(0);
    expect(resolveMcpPort({ environment: { STUDIO_MCP_PORT: "off" }, config, fallback: 43_148 })).toBeNull();
    expect(resolveMcpPort({ environment: { STUDIO_MCP_PORT: "44000" }, config, fallback: 43_148 })).toBe(44_000);
    expect(resolveMcpPort({ environment: {}, config, fallback: 43_148 })).toBe(50_000);
    expect(resolveMcpPort({ environment: {}, config: { mcp: { enabled: true, port: null } }, fallback: 43_148 })).toBe(43_148);
    expect(resolveMcpPort({ environment: {}, config: { mcp: { enabled: false, port: 50_000 } }, fallback: 43_148 })).toBeNull();
  });

  test("findStudioManifest walks up, then falls back to the user's ~/.studio", async () => {
    const root = await temporaryRoot();
    const userHome = join(root, "home");
    await mkdir(join(userHome, ".studio"), { recursive: true });
    await writeFile(join(userHome, ".studio", "studio.json"), JSON.stringify({ kind: "studio-home", where: "home" }));
    const deep = join(root, "work", "repo", "src");
    await mkdir(deep, { recursive: true });
    expect((await findStudioManifest(deep, { userHome })).manifest.where).toBe("home");

    await mkdir(join(root, "work", ".studio"), { recursive: true });
    await writeFile(join(root, "work", ".studio", "studio.json"), JSON.stringify({ kind: "studio-home", where: "work" }));
    const found = await findStudioManifest(deep, { userHome });
    expect(found.manifest.where).toBe("work");
    expect(found.path).toBe(join(root, "work", ".studio", "studio.json"));
  });
});
