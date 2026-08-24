import { afterEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostApiRequest, startStudioHost, studioHostPaths } from "../bin/local-host.mjs";
import { readDevPortAssignments, STUDIO_DEV_PORT_RANGE } from "../bin/local-ports.mjs";

const STUDIO_BIN = fileURLToPath(new URL("../bin/studio.mjs", import.meta.url));
const IDLE_CHILD = "setInterval(() => {}, 1000)";

/**
 * Waits, then takes the port it was handed. Used to open the exact race the
 * allocator cannot rule out: the port is free when studio dev checks it and
 * gone by the time the child binds.
 */
const LATE_BINDING_CHILD = `setTimeout(() => {
  const server = require("node:net").createServer();
  server.on("error", () => process.exit(1));
  server.listen(Number(process.env.PORT), "127.0.0.1", () => setInterval(() => {}, 1000));
}, 1200)`;

const hosts = [];
const children = [];
const servers = [];
const temporaryDirectories = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  await Promise.all(hosts.splice(0).map((host) => host.stop({ preserveState: false })));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

async function fixture(repoName) {
  const root = await mkdtemp(join(tmpdir(), "studio-dev-test-"));
  temporaryDirectories.push(root);
  const repoRoot = join(root, repoName);
  const workingDirectory = join(repoRoot, "design", "studio");
  await mkdir(workingDirectory, { recursive: true });
  spawnSync("git", ["init", "-q", repoRoot], { encoding: "utf8" });

  const hostDir = join(root, "host");
  const paths = studioHostPaths({ STUDIO_HOST_DIR: hostDir });
  const host = await startStudioHost({
    disableMdns: true,
    paths,
    proxyPort: 0,
    sweepMs: 10_000,
  });
  hosts.push(host);
  return { host, hostDir, paths, repoRoot, root, workingDirectory };
}

function startDev(values, extraArgs = [], script = IDLE_CHILD) {
  const child = spawn(process.execPath, [STUDIO_BIN, "dev", ...extraArgs, "--", process.execPath, "-e", script], {
    cwd: values.workingDirectory,
    env: { ...process.env, STUDIO_HOST_DIR: values.hostDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.output = output;
  child.exited = new Promise((resolveExit) => child.once("close", (code, signal) => {
    resolveExit({ code, signal });
  }));
  return child;
}

async function registrationFor(paths, id) {
  const result = await hostApiRequest("/v1/registrations", { paths, timeoutMs: 1_000 });
  return result.body.registrations.find((registration) => registration.id === id) || null;
}

async function waitFor(predicate, { timeoutMs = 15_000, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

describe("studio dev without a port", () => {
  test("allocates a port, registers it, and remembers it for the next run", async () => {
    const values = await fixture("sample-studio");

    const first = startDev(values);
    const registration = await waitFor(
      () => registrationFor(values.paths, "sample-studio"),
      { label: "the first registration" },
    );
    const port = registration.upstream.port;
    expect(port).toBeGreaterThanOrEqual(STUDIO_DEV_PORT_RANGE.start);
    expect(port).toBeLessThanOrEqual(STUDIO_DEV_PORT_RANGE.end);
    expect(registration.hostname).toBe("sample-studio.studio.local");

    const stored = await readDevPortAssignments(values.paths);
    expect(stored.assignments["sample-studio"].port).toBe(port);

    first.kill("SIGINT");
    await first.exited;

    const second = startDev(values);
    const reused = await waitFor(
      () => registrationFor(values.paths, "sample-studio"),
      { label: "the second registration" },
    );
    expect(reused.upstream.port).toBe(port);
    second.kill("SIGINT");
    await second.exited;
  }, 40_000);

  test("unregisters on Ctrl-C instead of leaving a stale route", async () => {
    const values = await fixture("ctrlc-studio");
    const child = startDev(values);
    await waitFor(
      () => registrationFor(values.paths, "ctrlc-studio"),
      { label: "the registration" },
    );

    child.kill("SIGINT");
    const exit = await child.exited;
    expect(exit.code === 130 || exit.signal === "SIGINT").toBe(true);

    await waitFor(
      async () => (await registrationFor(values.paths, "ctrlc-studio")) === null,
      { label: "the registration to be removed" },
    );
  }, 40_000);

  test("unregisters on SIGTERM as well", async () => {
    const values = await fixture("sigterm-studio");
    const child = startDev(values);
    await waitFor(
      () => registrationFor(values.paths, "sigterm-studio"),
      { label: "the registration" },
    );

    child.kill("SIGTERM");
    await child.exited;
    await waitFor(
      async () => (await registrationFor(values.paths, "sigterm-studio")) === null,
      { label: "the registration to be removed" },
    );
  }, 40_000);

  test("reallocates when something steals the port between the check and the bind", async () => {
    const values = await fixture("race-studio");
    const child = startDev(values, [], LATE_BINDING_CHILD);

    const firstPort = Number(await waitFor(() => {
      const match = child.output.join("").match(/http:\/\/127\.0\.0\.1:(\d+)/);
      return match ? match[1] : null;
    }, { label: "the first allocated port" }));

    const thief = createServer();
    servers.push(thief);
    await new Promise((listening) => thief.listen(firstPort, "127.0.0.1", listening));

    const registration = await waitFor(async () => {
      const found = await registrationFor(values.paths, "race-studio");
      return found && found.upstream.port !== firstPort ? found : null;
    }, { label: "a reallocated registration", timeoutMs: 20_000 });

    expect(registration.upstream.port).not.toBe(firstPort);
    expect(child.exitCode).toBeNull();
    expect(child.output.join("")).toContain(`port ${firstPort} was taken`);
    expect((await readDevPortAssignments(values.paths)).assignments["race-studio"].port)
      .toBe(registration.upstream.port);

    child.kill("SIGINT");
    await child.exited;
  }, 60_000);

  test("still honours an explicit --port exactly as before", async () => {
    const values = await fixture("explicit-studio");
    const child = startDev(values, ["--port", "43199"]);
    const registration = await waitFor(
      () => registrationFor(values.paths, "explicit-studio"),
      { label: "the registration" },
    );
    expect(registration.upstream.port).toBe(43_199);

    // An explicit port is the caller's standing choice, not an allocation, so
    // it must not be written into the remembered-port store.
    expect((await readDevPortAssignments(values.paths)).assignments["explicit-studio"]).toBeUndefined();

    child.kill("SIGINT");
    await child.exited;
  }, 40_000);
});
