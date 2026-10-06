import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studioHostPaths } from "../bin/local-host.mjs";
import {
  allocateDevPort,
  commandUsesPortToken,
  derivedPortForId,
  devPortsPath,
  isPortToken,
  localBinDirectories,
  pathWithLocalBins,
  readDevPortAssignments,
  rememberDevPort,
  STUDIO_DEV_PORT_RANGE,
  substitutePortToken,
} from "../bin/local-ports.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studio-ports-test-"));
  temporaryDirectories.push(root);
  const repoRoot = join(root, "repo");
  const workingDirectory = join(repoRoot, "design", "studio");
  await mkdir(workingDirectory, { recursive: true });
  return {
    root,
    repoRoot,
    workingDirectory,
    paths: studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") }),
  };
}

const allFree = () => Promise.resolve(true);

describe("port token substitution", () => {
  test("replaces the token without touching the rest of the command", () => {
    expect(substitutePortToken(["next", "dev", "--port", "{port}"], 43_217))
      .toEqual(["next", "dev", "--port", "43217"]);
    expect(substitutePortToken(["bun", "serve", "--url=http://localhost:{port}/app"], 43_217))
      .toEqual(["bun", "serve", "--url=http://localhost:43217/app"]);
  });

  test("leaves a port the user wrote alone", () => {
    expect(substitutePortToken(["next", "dev", "--port", "3070"], 43_217))
      .toEqual(["next", "dev", "--port", "3070"]);
  });

  test("recognises the token in either case", () => {
    expect(isPortToken("{port}")).toBe(true);
    expect(isPortToken("{PORT}")).toBe(true);
    expect(isPortToken("3070")).toBe(false);
    expect(commandUsesPortToken(["next", "dev", "-p", "{port}"])).toBe(true);
    expect(commandUsesPortToken(["next", "dev"])).toBe(false);
  });
});

describe("derived project port", () => {
  test("is stable per project and inside the dedicated range", () => {
    const port = derivedPortForId("talkie");
    expect(derivedPortForId("talkie")).toBe(port);
    expect(port).toBeGreaterThanOrEqual(STUDIO_DEV_PORT_RANGE.start);
    expect(port).toBeLessThanOrEqual(STUDIO_DEV_PORT_RANGE.end);
  });

  test("spreads projects that would otherwise all pick 3070", () => {
    expect(derivedPortForId("talkie")).not.toBe(derivedPortForId("action"));
  });
});

describe("allocateDevPort", () => {
  test("allocates a free port and remembers it for next time", async () => {
    const values = await fixture();
    const first = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      workingDirectory: values.workingDirectory,
      paths: values.paths,
      available: allFree,
    });
    expect(first.port).toBe(derivedPortForId("talkie"));
    expect(first.source).toBe("derived");

    await rememberDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      port: first.port,
      paths: values.paths,
    });

    const second = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      workingDirectory: values.workingDirectory,
      paths: values.paths,
      available: allFree,
    });
    expect(second).toEqual({ port: first.port, source: "remembered" });
  });

  test("keeps the remembered port even when it is no longer the derived one", async () => {
    const values = await fixture();
    await rememberDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      port: 43_299,
      paths: values.paths,
    });
    const allocation = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      paths: values.paths,
      available: allFree,
    });
    expect(allocation).toEqual({ port: 43_299, source: "remembered" });
  });

  test("skips a port another registered project already holds", async () => {
    const values = await fixture();
    const home = derivedPortForId("talkie");
    const allocation = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      paths: values.paths,
      taken: new Set([home]),
      available: allFree,
    });
    expect(allocation.port).not.toBe(home);
    expect(allocation.source).toBe("scan");
  });

  test("skips a port that is not bindable right now", async () => {
    const values = await fixture();
    const home = derivedPortForId("talkie");
    const allocation = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      paths: values.paths,
      available: (port) => Promise.resolve(port !== home),
    });
    expect(allocation.port).not.toBe(home);
  });

  test("honours an explicitly excluded port after a lost race", async () => {
    const values = await fixture();
    const home = derivedPortForId("talkie");
    await rememberDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      port: home,
      paths: values.paths,
    });
    const allocation = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      paths: values.paths,
      exclude: new Set([home]),
      available: allFree,
    });
    expect(allocation.port).not.toBe(home);
  });

  test("prefers preferredPort from .studio/project.json over the derived port", async () => {
    const values = await fixture();
    await mkdir(join(values.repoRoot, ".studio"), { recursive: true });
    await writeFile(
      join(values.repoRoot, ".studio", "project.json"),
      JSON.stringify({ version: 1, id: "talkie", preferredPort: 43_255 }),
      "utf8",
    );
    const allocation = await allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      workingDirectory: values.workingDirectory,
      paths: values.paths,
      available: allFree,
    });
    expect(allocation).toEqual({ port: 43_255, source: "manifest" });
  });

  test("reports a clear failure when the whole range is busy", async () => {
    const values = await fixture();
    await expect(allocateDevPort({
      id: "talkie",
      repoRoot: values.repoRoot,
      paths: values.paths,
      available: () => Promise.resolve(false),
    })).rejects.toThrow("No free port available for talkie");
  });
});

describe("remembered port storage", () => {
  test("never drops another project's assignment", async () => {
    const values = await fixture();
    await rememberDevPort({ id: "talkie", repoRoot: values.repoRoot, port: 43_201, paths: values.paths });
    await rememberDevPort({ id: "action", repoRoot: "/Users/dev/code/action", port: 43_202, paths: values.paths });
    const stored = await readDevPortAssignments(values.paths);
    expect(stored.assignments.talkie.port).toBe(43_201);
    expect(stored.assignments.action.port).toBe(43_202);
    expect(stored.assignments.talkie.repoRoot).toBe(values.repoRoot);
  });

  test("treats a corrupt or absent store as empty rather than failing a dev run", async () => {
    const values = await fixture();
    expect((await readDevPortAssignments(values.paths)).assignments).toEqual({});
    await mkdir(values.paths.root, { recursive: true });
    await writeFile(devPortsPath(values.paths), "{ not json", "utf8");
    expect((await readDevPortAssignments(values.paths)).assignments).toEqual({});
  });
});

describe("local bin resolution", () => {
  test("puts the repository's node_modules/.bin ahead of the inherited PATH", () => {
    const studioRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
    const directories = localBinDirectories(join(studioRoot, "apps", "studio"));
    expect(directories).toContain(join(studioRoot, "node_modules", ".bin"));

    const path = pathWithLocalBins(join(studioRoot, "apps", "studio"), { PATH: "/usr/bin" });
    expect(path.startsWith(directories[0])).toBe(true);
    expect(path.endsWith(":/usr/bin")).toBe(true);
  });
});
