/**
 * `studio doctor` — proves that a registration is actually being served.
 *
 * Registration, routing, and serving are three different things, and this
 * system had no check that they agreed. A project could hold a live lease in
 * `studio list` while requests to its hostname returned 200 with a zero-byte
 * body, because the route had been installed into a Caddy process that does not
 * receive the traffic. A status code cannot catch that. Byte equality between a
 * request through the edge and the same request straight to the upstream can,
 * so that is the assertion this makes.
 */

import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { hostApiRequest, studioHostPaths } from "./local-host.mjs";

const DEFAULT_PROBE_PATH = "/";
const DEFAULT_TIMEOUT_MS = 5_000;

export async function probeHttp({
  host = "127.0.0.1",
  port,
  path = DEFAULT_PROBE_PATH,
  hostHeader,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  return new Promise((resolveProbe) => {
    const settle = (value) => resolveProbe(value);
    const probe = httpRequest({
      host,
      port,
      path,
      method: "GET",
      headers: hostHeader ? { host: hostHeader } : undefined,
    }, (response) => {
      let bytes = 0;
      response.on("data", (chunk) => { bytes += chunk.length; });
      response.on("end", () => settle({
        ok: true,
        status: response.statusCode || 0,
        bytes,
        server: response.headers.server,
      }));
      response.on("error", (error) => settle({ ok: false, error: error.message }));
    });
    probe.setTimeout(timeoutMs, () => probe.destroy(new Error("timed out")));
    probe.once("error", (error) => settle({ ok: false, error: error.message }));
    probe.end();
  });
}

/**
 * Turns two probes into a verdict. The empty-200 case gets its own code because
 * it is the signature of a hostname reaching a proxy that has no route for it,
 * and it is the one failure that reads as success everywhere else.
 */
export function classifyProbes({ upstream, edge }) {
  if (!upstream?.ok) {
    return {
      ok: false,
      code: "upstream-down",
      detail: `The registered upstream did not answer (${upstream?.error || "no response"}).`,
    };
  }
  if (!edge?.ok) {
    return {
      ok: false,
      code: "edge-unreachable",
      detail: `The edge did not answer (${edge?.error || "no response"}).`,
    };
  }
  if (edge.status === 200 && edge.bytes === 0 && upstream.bytes > 0) {
    return {
      ok: false,
      code: "edge-empty",
      detail: "The edge returned 200 with an empty body, which is what a proxy"
        + " does when no route matches the hostname. The registration is not in"
        + " the config of whichever process is actually serving this port.",
    };
  }
  if (edge.status !== upstream.status) {
    return {
      ok: false,
      code: "edge-status-mismatch",
      detail: `The edge answered ${edge.status} where the upstream answered ${upstream.status}.`,
    };
  }
  if (edge.bytes !== upstream.bytes) {
    return {
      ok: false,
      code: "edge-bytes-mismatch",
      detail: `The edge returned ${edge.bytes} bytes where the upstream returned ${upstream.bytes}.`,
    };
  }
  return { ok: true, code: "ok", detail: `${edge.bytes} bytes through the edge and direct.` };
}

export async function diagnoseRegistration(registration, {
  publicPort,
  path = DEFAULT_PROBE_PATH,
  probe = probeHttp,
} = {}) {
  const upstream = await probe({
    host: registration.upstream.host,
    port: registration.upstream.port,
    path,
  });
  const edge = await probe({
    host: "127.0.0.1",
    port: publicPort,
    path,
    hostHeader: registration.hostname,
  });
  return {
    id: registration.id,
    hostname: registration.hostname,
    upstream: registration.upstream,
    path,
    checks: { upstream, edge },
    verdict: classifyProbes({ upstream, edge }),
  };
}

/**
 * Every process listening on a port. More than one is legal — Caddy sets
 * SO_REUSEPORT — and is exactly the trap here: the kernel hands connections to
 * one of them, and routes installed in the others are silently dark.
 */
export function listenersOnPort(port, { runner = spawnSync } = {}) {
  const result = runner("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (!result || result.status !== 0 || typeof result.stdout !== "string") return [];
  const seen = new Map();
  for (const line of result.stdout.split("\n").slice(1)) {
    const [command, pid] = line.trim().split(/\s+/);
    if (!command || !/^\d+$/.test(pid || "")) continue;
    seen.set(pid, { command, pid: Number(pid) });
  }
  return [...seen.values()].sort((left, right) => left.pid - right.pid);
}

export function summarizeReport(report) {
  const failing = report.registrations.filter((entry) => !entry.verdict.ok);
  return { ok: failing.length === 0 && report.warnings.length === 0, failing: failing.length };
}

export async function collectDoctorReport({
  paths = studioHostPaths(),
  path = DEFAULT_PROBE_PATH,
  probe = probeHttp,
  listeners = listenersOnPort,
} = {}) {
  const status = (await hostApiRequest("/v1/status", { paths, timeoutMs: 2_000 })).body;
  const listed = (await hostApiRequest("/v1/registrations", { paths, timeoutMs: 2_000 })).body;
  const warnings = [];

  const bound = listeners(status.publicPort);
  if (bound.length > 1) {
    warnings.push(
      `${bound.length} processes are listening on port ${status.publicPort}`
      + ` (${bound.map((entry) => `${entry.command}:${entry.pid}`).join(", ")}).`
      + " Only one of them receives connections; routes installed in the others"
      + " never see traffic. Stop the ones that should not own this port.",
    );
  }

  const registrations = [];
  for (const registration of listed.registrations) {
    registrations.push(await diagnoseRegistration(registration, {
      publicPort: status.publicPort,
      path,
      probe,
    }));
  }

  // A registration that works through the host's own proxy but not through the
  // public port localises the fault precisely: the host is fine, the edge in
  // front of it is not ours.
  if (status.edge === "shared-caddy" && status.proxyPort !== status.publicPort) {
    for (const entry of registrations) {
      if (entry.verdict.ok) continue;
      const viaHost = await probe({
        host: "127.0.0.1",
        port: status.proxyPort,
        path,
        hostHeader: entry.hostname,
      });
      entry.checks.hostProxy = viaHost;
      if (viaHost.ok && viaHost.bytes === entry.checks.upstream.bytes) {
        entry.verdict = {
          ...entry.verdict,
          detail: `${entry.verdict.detail} The Studio host proxy on ${status.proxyPort}`
            + " serves this hostname correctly, so the shared Caddy edge that owns"
            + ` port ${status.publicPort} is not the one Studio installed its route into.`,
        };
      }
    }
  }

  const report = { status, listeners: bound, warnings, registrations, path };
  return { ...report, summary: summarizeReport(report) };
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

export function renderDoctorReport(report) {
  const lines = [];
  lines.push(
    `edge      ${report.status.edge}, public port ${report.status.publicPort},`
    + ` host proxy ${report.status.proxyPort}`,
  );
  lines.push(
    `listeners ${report.listeners.map((entry) => `${entry.command}(${entry.pid})`).join(", ") || "none found"}`,
  );
  for (const warning of report.warnings) lines.push(`  ! ${warning}`);
  lines.push("");

  if (report.registrations.length === 0) lines.push("No Studio projects are registered.");
  for (const entry of report.registrations) {
    lines.push(`${pad(entry.hostname, 34)} ${entry.verdict.ok ? "ok" : "FAIL"}  ${entry.verdict.code}`);
    const rows = [
      ["upstream", `${entry.upstream.host}:${entry.upstream.port}`, entry.checks.upstream],
      ["via edge", `127.0.0.1:${report.status.publicPort}`, entry.checks.edge],
    ];
    if (entry.checks.hostProxy) {
      rows.splice(1, 0, ["via host", `127.0.0.1:${report.status.proxyPort}`, entry.checks.hostProxy]);
    }
    for (const [label, target, check] of rows) {
      lines.push(`  ${pad(label, 10)} ${pad(target, 22)} ${
        check.ok ? `${pad(check.status, 4)} ${check.bytes} bytes` : `error: ${check.error}`
      }`);
    }
    if (!entry.verdict.ok) lines.push(`  → ${entry.verdict.detail}`);
    lines.push("");
  }
  lines.push(report.summary.ok
    ? "All registrations serve the same bytes through the edge as direct."
    : `${report.summary.failing} of ${report.registrations.length} registrations are not served correctly.`);
  return lines.join("\n");
}

export function parseDoctorArgs(args) {
  const parsed = { json: false, path: DEFAULT_PROBE_PATH };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--path") {
      if (!args[index + 1]) throw new Error("--path requires a value.");
      parsed.path = args[++index];
    } else if (arg.startsWith("--path=")) parsed.path = arg.slice(7);
    else throw new Error(`Unknown studio doctor option: ${arg}`);
  }
  if (!parsed.path.startsWith("/")) parsed.path = `/${parsed.path}`;
  return parsed;
}

export function doctorHelp() {
  return `studio doctor — check that every registration is actually being served

Usage:
  studio doctor [--path <path>] [--json]

For each registered project it requests <path> straight from the upstream and
again through the edge, then compares status and byte count. A hostname that
answers 200 with an empty body is reported as a failure, not as success.`;
}

export async function runDoctor(args, options = {}) {
  const parsed = parseDoctorArgs(args);
  if (parsed.help) {
    console.log(doctorHelp());
    return 0;
  }
  const report = await collectDoctorReport({ ...options, path: parsed.path });
  console.log(parsed.json ? JSON.stringify(report, null, 2) : renderDoctorReport(report));
  return report.summary.ok ? 0 : 1;
}
