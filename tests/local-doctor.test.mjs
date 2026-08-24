import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EDGE_PROBE_PATH,
  hostApiRequest,
  startStudioHost,
  studioHostPaths,
} from "../bin/local-host.mjs";
import {
  classifyProbes,
  collectDoctorReport,
  listenersOnPort,
  parseDoctorArgs,
  probeHttp,
  renderDoctorReport,
} from "../bin/local-doctor.mjs";

const hosts = [];
const servers = [];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop({ preserveState: false })));
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

const BODY = "<html>studio upstream</html>";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studio-doctor-test-"));
  temporaryDirectories.push(root);
  const repoRoot = join(root, "repo");
  const workingDirectory = join(repoRoot, "design", "studio");
  await mkdir(workingDirectory, { recursive: true });

  const upstream = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(BODY);
  });
  servers.push(upstream);
  const upstreamPort = await new Promise((listening) => {
    upstream.listen(0, "127.0.0.1", () => listening(upstream.address().port));
  });

  const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
  const host = await startStudioHost({ disableMdns: true, paths, proxyPort: 0, sweepMs: 10_000 });
  hosts.push(host);

  await hostApiRequest("/v1/registrations/sample-repo", {
    paths,
    method: "PUT",
    body: {
      repo: { name: "sample-repo", root: repoRoot },
      workingDirectory,
      upstream: { host: "127.0.0.1", port: upstreamPort },
      process: { pid: process.pid },
      liveness: { ttlMs: 0 },
    },
  });
  return { host, paths, repoRoot, upstreamPort, workingDirectory };
}

describe("probe classification", () => {
  test("passes when the edge returns the same bytes as the upstream", () => {
    const verdict = classifyProbes({
      upstream: { ok: true, status: 200, bytes: 237_256 },
      edge: { ok: true, status: 200, bytes: 237_256 },
    });
    expect(verdict).toMatchObject({ ok: true, code: "ok" });
  });

  test("calls out the 200-with-no-body case by name", () => {
    const verdict = classifyProbes({
      upstream: { ok: true, status: 200, bytes: 237_256 },
      edge: { ok: true, status: 200, bytes: 0 },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("edge-empty");
    expect(verdict.detail).toContain("no route matches the hostname");
  });

  test("fails a byte mismatch even when both sides answer 200", () => {
    const verdict = classifyProbes({
      upstream: { ok: true, status: 200, bytes: 237_256 },
      edge: { ok: true, status: 200, bytes: 1_024 },
    });
    expect(verdict.code).toBe("edge-bytes-mismatch");
  });

  test("separates a dead upstream from a broken edge", () => {
    expect(classifyProbes({
      upstream: { ok: false, error: "ECONNREFUSED" },
      edge: { ok: true, status: 200, bytes: 0 },
    }).code).toBe("upstream-down");
    expect(classifyProbes({
      upstream: { ok: true, status: 200, bytes: 10 },
      edge: { ok: false, error: "ECONNREFUSED" },
    }).code).toBe("edge-unreachable");
  });
});

describe("listener discovery", () => {
  test("reports every process bound to the port, which is how a hijacked edge shows up", () => {
    const runner = () => ({
      status: 0,
      stdout: [
        "COMMAND   PID  USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME",
        "caddy    1670 arach    9u  IPv6  0x8461      0t0  TCP *:80 (LISTEN)",
        "caddy   17457 arach   10u  IPv6  0x3e9f      0t0  TCP *:80 (LISTEN)",
      ].join("\n"),
    });
    expect(listenersOnPort(80, { runner })).toEqual([
      { command: "caddy", pid: 1670 },
      { command: "caddy", pid: 17457 },
    ]);
  });
});

describe("studio doctor", () => {
  test("passes when the edge serves the same bytes as the upstream", async () => {
    const values = await fixture();
    const report = await collectDoctorReport({ paths: values.paths });

    expect(report.registrations).toHaveLength(1);
    const [entry] = report.registrations;
    expect(entry.verdict.ok).toBe(true);
    expect(entry.checks.edge.bytes).toBe(BODY.length);
    expect(entry.checks.upstream.bytes).toBe(BODY.length);
    expect(report.summary.ok).toBe(true);
    expect(renderDoctorReport(report)).toContain("All registrations serve the same bytes");
  }, 20_000);

  test("fails, loudly, when the edge answers 200 with nothing in it", async () => {
    const values = await fixture();
    const report = await collectDoctorReport({
      paths: values.paths,
      // Stands in for a proxy that owns the public port but has no route for
      // this hostname: it answers, it answers 200, and it answers nothing.
      probe: ({ port }) => Promise.resolve(port === values.upstreamPort
        ? { ok: true, status: 200, bytes: BODY.length }
        : { ok: true, status: 200, bytes: 0 }),
    });

    expect(report.summary.ok).toBe(false);
    expect(report.summary.failing).toBe(1);
    expect(report.registrations[0].verdict.code).toBe("edge-empty");
    expect(renderDoctorReport(report)).toContain("FAIL");
  }, 20_000);

  test("warns when more than one process is bound to the public port", async () => {
    const values = await fixture();
    const report = await collectDoctorReport({
      paths: values.paths,
      listeners: () => [
        { command: "caddy", pid: 1670 },
        { command: "caddy", pid: 17457 },
      ],
    });
    expect(report.warnings[0]).toContain("2 processes are listening");
    expect(report.summary.ok).toBe(false);
  }, 20_000);

  test("parses its options", () => {
    expect(parseDoctorArgs([])).toEqual({ json: false, path: "/" });
    expect(parseDoctorArgs(["--json", "--path", "mac-meeting-kimi"]))
      .toEqual({ json: true, path: "/mac-meeting-kimi" });
    expect(() => parseDoctorArgs(["--nope"])).toThrow("Unknown studio doctor option");
  });
});

describe("edge verification", () => {
  test("the host answers its own probe and reports the edge as verified", async () => {
    const values = await fixture();
    const status = (await hostApiRequest("/v1/status", { paths: values.paths })).body;
    expect(status.edgeVerified).toBe(true);

    const probe = await probeHttp({
      port: status.publicPort,
      path: EDGE_PROBE_PATH,
      hostHeader: "studio-edge-probe.studio.local",
    });
    expect(probe.status).toBe(200);
    expect(probe.bytes).toBeGreaterThan(0);
  }, 20_000);
});
