import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EDGE_CATCH_ALL,
  hostApiRequest,
  renderSharedStudioRoute,
  startStudioHost,
  studioHostPaths,
} from "../bin/local-host.mjs";
import { parseDuration, parseRegistrationArgs } from "../bin/local-dev.mjs";

const hosts = [];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop({ preserveState: false })));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studio-host-test-"));
  temporaryDirectories.push(root);
  const repoRoot = join(root, "repo");
  const workingDirectory = join(repoRoot, "design", "studio");
  await mkdir(workingDirectory, { recursive: true });
  const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
  const host = await startStudioHost({
    disableMdns: true,
    paths,
    proxyPort: 0,
    sweepMs: 10_000,
  });
  hosts.push(host);
  return { host, paths, repoRoot, root, workingDirectory };
}

function registrationBody(fixtureValues, overrides = {}) {
  return {
    repo: { name: "sample-repo", root: fixtureValues.repoRoot },
    workingDirectory: fixtureValues.workingDirectory,
    upstream: { host: "127.0.0.1", port: 3_060 },
    process: { pid: process.pid },
    liveness: { ttlMs: 0 },
    ...overrides,
  };
}

async function register(fixtureValues, overrides) {
  return hostApiRequest("/v1/registrations/sample-repo", {
    paths: fixtureValues.paths,
    method: "PUT",
    body: registrationBody(fixtureValues, overrides),
  });
}

function listen(server) {
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

function getViaProxy(port, hostname, path = "/") {
  return new Promise((resolveRequest, rejectRequest) => {
    const proxyRequest = request({
      host: "127.0.0.1",
      port,
      path,
      headers: { host: hostname },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    proxyRequest.once("error", rejectRequest);
    proxyRequest.end();
  });
}

describe("Studio host registration API", () => {
  test("registers the bare portal hostname", async () => {
    const values = await fixture();
    const response = await register(values, { hostname: "studio.local" });
    expect(response.body.registration.hostname).toBe("studio.local");
    expect(response.body.url).toContain("studio.local");
  });

  test("idempotently registers and updates a repository route", async () => {
    const values = await fixture();
    const first = await register(values);
    const second = await register(values, {
      upstream: { host: "127.0.0.1", port: 4_321 },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.leaseId).toBe(first.body.leaseId);
    expect(second.body.registration.upstream.port).toBe(4_321);
    expect(second.body.url).toContain("sample-repo.studio.local");

    const list = await hostApiRequest("/v1/registrations", { paths: values.paths });
    expect(list.body.registrations).toHaveLength(1);
    expect(list.body.registrations[0].leaseId).toBeUndefined();
  });

  test("heartbeats refresh liveness, update ports, and reject stale leases", async () => {
    const values = await fixture();
    const first = await register(values, {
      process: null,
      liveness: { ttlMs: 5_000 },
    });
    const heartbeat = await hostApiRequest("/v1/registrations/sample-repo/heartbeat", {
      paths: values.paths,
      method: "POST",
      body: {
        leaseId: first.body.leaseId,
        upstream: { host: "localhost", port: 4_444 },
      },
    });
    expect(heartbeat.body.registration.upstream).toEqual({ host: "localhost", port: 4_444 });
    expect(heartbeat.body.registration.lastHeartbeatAt >= first.body.registration.lastHeartbeatAt).toBe(true);

    const stale = await hostApiRequest("/v1/registrations/sample-repo", {
      paths: values.paths,
      method: "DELETE",
      body: { leaseId: "not-the-lease" },
      throwOnError: false,
    });
    expect(stale.status).toBe(409);
  });

  test("explicit unregister removes only the matching lease", async () => {
    const values = await fixture();
    const first = await register(values);
    const removed = await hostApiRequest("/v1/registrations/sample-repo", {
      paths: values.paths,
      method: "DELETE",
      body: { leaseId: first.body.leaseId },
    });
    expect(removed.body.ok).toBe(true);
    const list = await hostApiRequest("/v1/registrations", { paths: values.paths });
    expect(list.body.registrations).toEqual([]);
  });

  test("rejects a hostname collision from a different repository root", async () => {
    const values = await fixture();
    await register(values);
    const otherRoot = join(values.root, "other-repo");
    await mkdir(otherRoot);
    const conflict = await hostApiRequest("/v1/registrations/sample-repo", {
      paths: values.paths,
      method: "PUT",
      body: {
        ...registrationBody(values),
        repo: { name: "sample-repo", root: otherRoot },
        workingDirectory: otherRoot,
      },
      throwOnError: false,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.details.repoRoot).toBe(values.repoRoot);
  });
});

describe("Studio host reconciliation and proxy", () => {
  test("returns a diagnostic body naming an unmatched host", async () => {
    const values = await fixture();
    const response = await getViaProxy(values.host.proxyPort, "missing.studio.local");
    expect(response.status).toBe(404);
    expect(response.body).toContain("missing.studio.local");
    expect(Buffer.byteLength(response.body)).toBeGreaterThan(0);
  });

  test("proxies requests by canonical Host header", async () => {
    const upstream = createServer((request, response) => {
      response.setHeader("x-upstream-host", request.headers.host);
      response.end(`upstream:${request.url}`);
    });
    const upstreamPort = await listen(upstream);
    const values = await fixture();
    await register(values, { upstream: { host: "127.0.0.1", port: upstreamPort } });

    const response = await getViaProxy(
      values.host.proxyPort,
      "sample-repo.studio.local",
      "/health?full=1",
    );
    expect(response.status).toBe(200);
    expect(response.body).toBe("upstream:/health?full=1");
    expect(response.headers["x-upstream-host"]).toBe("sample-repo.studio.local");
    await new Promise((resolveClose) => upstream.close(resolveClose));
  });

  test("survives dropped upgraded sockets and stops with one still open", async () => {
    const child = spawn("node", [join(import.meta.dir, "fixtures", "upgrade-drop.mjs")]);
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const code = await new Promise((resolveExit) => child.on("exit", resolveExit));
    expect(output).toContain("survived alive");
    expect(output).toContain("stopped");
    expect(code).toBe(0);
  }, 20_000);

  test("restores live desired registrations after a host restart", async () => {
    const values = await fixture();
    const first = await register(values);
    await values.host.stop({ preserveState: true });
    hosts.splice(hosts.indexOf(values.host), 1);

    const restarted = await startStudioHost({
      disableMdns: true,
      paths: values.paths,
      proxyPort: 0,
      sweepMs: 10_000,
    });
    hosts.push(restarted);
    const list = await hostApiRequest("/v1/registrations", { paths: values.paths });
    expect(list.body.registrations).toHaveLength(1);
    const refreshed = await hostApiRequest("/v1/registrations/sample-repo/heartbeat", {
      paths: values.paths,
      method: "POST",
      body: { leaseId: first.body.leaseId },
    });
    expect(refreshed.status).toBe(200);
  });

  test("cleans up when a project directory disappears", async () => {
    const values = await fixture();
    await register(values);
    await rm(values.repoRoot, { recursive: true });
    const reconciliation = await values.host.reconcile();
    expect(reconciliation.removed).toEqual(["sample-repo.studio.local"]);
    expect(values.host.registrations.size).toBe(0);
  });

  test("cleans up when the exact owner process exits", async () => {
    const values = await fixture();
    const child = spawn("sleep", ["10"]);
    await new Promise((resolveSpawn) => child.once("spawn", resolveSpawn));
    await register(values, { process: { pid: child.pid }, liveness: { ttlMs: 0 } });
    child.kill("SIGTERM");
    await new Promise((resolveClose) => child.once("close", resolveClose));

    await values.host.reconcile();
    expect(values.host.registrations.size).toBe(0);
  });

  test("cleans up a heartbeat-only client after its TTL", async () => {
    const values = await fixture();
    await register(values, { process: null, liveness: { ttlMs: 5 } });
    await Bun.sleep(10);
    await values.host.reconcile();
    expect(values.host.registrations.size).toBe(0);
  });
});

test("renders the shared port-80 edge route to the persistent proxy", () => {
  expect(renderSharedStudioRoute("sample-repo.studio.local", 43_150)).toEqual({
    "@id": "studio_host_sample_repo_studio_local",
    match: [{
      host: ["sample-repo.studio.local"],
      remote_ip: { ranges: ["127.0.0.0/8", "::1/128"] },
    }],
    handle: [{
      handler: "reverse_proxy",
      upstreams: [{ dial: "127.0.0.1:43150" }],
    }],
    terminal: true,
  });
});

test("renders a terminal diagnostic catch-all for unmatched local hosts", () => {
  expect(renderSharedStudioRoute(EDGE_CATCH_ALL, 43_150)).toEqual({
    "@id": "studio_host_unmatched_local",
    match: [{ remote_ip: { ranges: ["127.0.0.0/8", "::1/128"] } }],
    handle: [{
      handler: "reverse_proxy",
      upstreams: [{ dial: "127.0.0.1:43150" }],
    }],
    terminal: true,
  });
});

test("parses registration metadata and heartbeat durations", () => {
  expect(parseDuration("15s")).toBe(15_000);
  expect(parseDuration("1m")).toBe(60_000);
  expect(parseRegistrationArgs([
    "--port=3060", "--host", "localhost", "--pid", "123", "--ttl", "30s", "--json",
  ])).toEqual({
    upstreamHost: "localhost",
    port: 3_060,
    pid: 123,
    ttlMs: 30_000,
    json: true,
  });
});
