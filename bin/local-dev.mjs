import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HEARTBEAT_TTL_MS,
  formatLocalUrl,
  hostApiRequest,
  hostnameForRepo,
  normalizeRepoName,
  processStartedAt,
  readPort,
  startStudioHost,
  studioHostPaths,
  waitForStudioHost,
} from "./local-host.mjs";
import {
  allocateDevPort,
  isPortAvailable,
  isPortToken,
  pathWithLocalBins,
  rememberDevPort,
  STUDIO_DEV_PORT_RANGE,
  STUDIO_DEV_PORT_TOKEN,
  substitutePortToken,
} from "./local-ports.mjs";

const DEFAULT_PORT = 3_000;
/**
 * A child that dies this fast, on a port something else now holds, lost an
 * allocation race rather than failing on its own merits.
 */
const PORT_CONFLICT_WINDOW_MS = 15_000;
const PORT_CONFLICT_ATTEMPTS = 4;
const DEFAULT_EDGE_PORT = 43_150;
const ADMIN_ADDRESS = "127.0.0.1:20219";
const STUDIO_BIN = fileURLToPath(new URL("./studio.mjs", import.meta.url));

export { formatLocalUrl, hostnameForRepo, normalizeRepoName };
export { STUDIO_DEV_PORT_RANGE, STUDIO_DEV_PORT_TOKEN, substitutePortToken };

/**
 * A literal port written into the child command is still an explicit choice and
 * wins. `{port}` is a placeholder, not a port, so it defers to the allocator.
 */
export function inferPortFromCommand(command) {
  const nextIndex = command.findIndex((arg) => /(^|\/)next$/.test(arg));
  if (nextIndex === -1) return undefined;
  for (let index = nextIndex + 1; index < command.length; index += 1) {
    const arg = command[index];
    if ((arg === "--port" || arg === "-p") && command[index + 1]) {
      if (isPortToken(command[index + 1])) return undefined;
      return readPort(command[index + 1], arg);
    }
    if (arg.startsWith("--port=")) {
      if (isPortToken(arg.slice(7))) return undefined;
      return readPort(arg.slice(7), "--port");
    }
  }
  return undefined;
}

export function parseDevArgs(args) {
  const separatorIndex = args.indexOf("--");
  const optionArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const command = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);
  let port;
  let help = false;

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--port" || arg === "-p") {
      if (!optionArgs[index + 1]) throw new Error(`${arg} requires a value.`);
      const value = optionArgs[++index];
      if (!isPortToken(value)) port = readPort(value, arg);
    } else if (arg.startsWith("--port=")) {
      if (!isPortToken(arg.slice(7))) port = readPort(arg.slice(7), "--port");
    } else throw new Error(`Unknown studio dev option: ${arg}`);
  }

  const commandPort = inferPortFromCommand(command);
  if (port && commandPort && port !== commandPort) {
    throw new Error(`studio dev port ${port} does not match child command port ${commandPort}.`);
  }
  return { command, help, port: port ?? commandPort };
}

export function resolveRepoRoot(cwd, gitBin = "git") {
  const result = spawnSync(gitBin, ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Studio commands must run inside a Git repository.");
  return resolve(result.stdout.trim());
}

export function repoNameFromRemote(remoteUrl) {
  const normalized = remoteUrl.trim().replace(/[\\/]+$/, "");
  const lastSegment = normalized.split(/[\\/:]/).at(-1) || "";
  return lastSegment.replace(/\.git$/i, "");
}

export function resolveRepoName(repoRoot, gitBin = "git") {
  const result = spawnSync(gitBin, [
    "-C", repoRoot, "config", "--get", "remote.origin.url",
  ], { encoding: "utf8" });
  const remoteName = result.status === 0 ? repoNameFromRemote(result.stdout) : "";
  return remoteName || basename(repoRoot);
}

export async function findAvailablePort(preferredPort = DEFAULT_PORT) {
  for (let port = preferredPort; port <= 65_535; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found at or above ${preferredPort}.`);
}

// Kept as small compatibility helpers for consumers/tests that imported the
// first-generation local edge renderers. The persistent host no longer writes
// a per-project Caddyfile.
export function renderCaddyfile(routes, adminAddress = ADMIN_ADDRESS, edgePort = DEFAULT_EDGE_PORT) {
  const routeBlocks = [...routes]
    .sort((left, right) => left.hostname.localeCompare(right.hostname))
    .map(({ hostname, port }) => (
      `http://${hostname}:${edgePort} {\n\treverse_proxy 127.0.0.1:${port}\n}`
    ))
    .join("\n\n");
  return `{\n\tadmin ${adminAddress}\n\tauto_https off\n\tdefault_bind 127.0.0.1\n}\n\n${routeBlocks}\n`;
}

export function sharedRouteId(hostname) {
  return `studio_local_${hostname.replace(/[^a-z0-9]+/g, "_")}`;
}

export function renderSharedCaddyRoute({ hostname, port, routeId = sharedRouteId(hostname) }) {
  return {
    "@id": routeId,
    match: [{ host: [hostname] }],
    handle: [{ handler: "reverse_proxy", upstreams: [{ dial: `127.0.0.1:${port}` }] }],
    terminal: true,
  };
}

export function parseDuration(value, source = "duration") {
  const match = String(value).match(/^(\d+)(ms|s|m)?$/);
  if (!match) throw new Error(`${source} must be a non-negative duration such as 15000, 15s, or 1m.`);
  const multiplier = match[2] === "m" ? 60_000 : match[2] === "s" ? 1_000 : 1;
  return Number(match[1]) * multiplier;
}

function takeOption(args, index, name) {
  if (!args[index + 1]) throw new Error(`${name} requires a value.`);
  return args[index + 1];
}

export function parseRegistrationArgs(args, { heartbeat = false } = {}) {
  const parsed = { upstreamHost: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--port" || arg === "-p") parsed.port = readPort(takeOption(args, index++, arg), arg);
    else if (arg.startsWith("--port=")) parsed.port = readPort(arg.slice(7), "--port");
    else if (arg === "--host") parsed.upstreamHost = takeOption(args, index++, arg);
    else if (arg === "--repo") parsed.repoName = takeOption(args, index++, arg);
    else if (arg === "--root") parsed.repoRoot = resolve(takeOption(args, index++, arg));
    else if (arg === "--cwd") parsed.cwd = resolve(takeOption(args, index++, arg));
    else if (arg === "--pid") {
      const pid = Number(takeOption(args, index++, arg));
      if (!Number.isInteger(pid) || pid < 1) throw new Error("--pid must be a positive integer.");
      parsed.pid = pid;
    } else if (arg === "--ttl") parsed.ttlMs = parseDuration(takeOption(args, index++, arg), "--ttl");
    else throw new Error(`Unknown studio ${heartbeat ? "heartbeat" : "register"} option: ${arg}`);
  }
  return parsed;
}

function repoContext(parsed, cwd = process.cwd()) {
  const workingDirectory = resolve(parsed.cwd || cwd);
  const repoRoot = parsed.repoRoot || resolveRepoRoot(workingDirectory);
  const repoName = parsed.repoName || resolveRepoName(repoRoot);
  const id = normalizeRepoName(repoName);
  return { id, repoName, repoRoot, workingDirectory };
}

function leasePath(repoRoot, paths = studioHostPaths()) {
  const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 24);
  return join(paths.leases, `${key}.json`);
}

async function readLease(repoRoot, paths) {
  try {
    return JSON.parse(await readFile(leasePath(repoRoot, paths), "utf8"));
  } catch {
    return null;
  }
}

async function writeLease(repoRoot, value, paths = studioHostPaths()) {
  await mkdir(paths.leases, { recursive: true, mode: 0o700 });
  await writeFile(leasePath(repoRoot, paths), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function removeLease(repoRoot, paths = studioHostPaths()) {
  await rm(leasePath(repoRoot, paths), { force: true });
}

export async function startHostDaemon(options = {}) {
  const paths = options.paths || studioHostPaths(options.environment);
  try {
    return (await hostApiRequest("/v1/health", { paths, timeoutMs: 400 })).body;
  } catch {
    // Start below.
  }
  mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const logFd = openSync(paths.log, "a", 0o600);
  const child = spawn(process.execPath, [STUDIO_BIN, "host", "run"], {
    detached: true,
    env: options.environment || process.env,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  return (await waitForStudioHost({ paths, timeoutMs: options.timeoutMs || 5_000 })).body;
}

export async function ensureStudioHost(options = {}) {
  try {
    return (await hostApiRequest("/v1/health", { ...options, timeoutMs: 500 })).body;
  } catch {
    return startHostDaemon(options);
  }
}

function registrationBody(context, parsed, leaseId) {
  const processMetadata = parsed.pid
    ? {
        pid: parsed.pid,
        startedAt: processStartedAt(parsed.pid),
        command: parsed.command,
      }
    : null;
  const ttlMs = parsed.ttlMs ?? (processMetadata ? 0 : 30_000);
  return {
    repo: { name: context.repoName, root: context.repoRoot },
    workingDirectory: context.workingDirectory,
    upstream: { host: parsed.upstreamHost || "127.0.0.1", port: parsed.port },
    process: processMetadata,
    liveness: { ttlMs },
    leaseId,
    client: { name: parsed.clientName || "studio-cli", pid: process.pid },
  };
}

export async function registerProject(parsed, options = {}) {
  if (!parsed.port) throw new Error("studio register requires --port <port>.");
  const paths = options.paths || studioHostPaths(options.environment);
  await ensureStudioHost({ ...options, paths });
  const context = repoContext(parsed, options.cwd);
  const storedLease = await readLease(context.repoRoot, paths);
  const result = await hostApiRequest(`/v1/registrations/${context.id}`, {
    paths,
    method: "PUT",
    body: registrationBody(context, parsed, storedLease?.id === context.id ? storedLease.leaseId : undefined),
  });
  await writeLease(context.repoRoot, {
    id: context.id,
    leaseId: result.body.leaseId,
    repoRoot: context.repoRoot,
    registration: result.body.registration,
    updatedAt: new Date().toISOString(),
  }, paths);
  return result.body;
}

export async function heartbeatProject(parsed, options = {}) {
  const paths = options.paths || studioHostPaths(options.environment);
  const context = repoContext(parsed, options.cwd);
  const lease = await readLease(context.repoRoot, paths);
  if (!lease?.leaseId || lease.id !== context.id) {
    throw new Error("No local registration lease was found. Run `studio register` first.");
  }
  const body = { leaseId: lease.leaseId };
  if (parsed.port || parsed.upstreamHost) {
    if (!parsed.port) throw new Error("Changing the upstream requires --port.");
    body.upstream = { host: parsed.upstreamHost || "127.0.0.1", port: parsed.port };
  }
  if (parsed.pid) {
    body.process = { pid: parsed.pid, startedAt: processStartedAt(parsed.pid) };
  }
  if (parsed.ttlMs !== undefined) body.liveness = { ttlMs: parsed.ttlMs };
  await ensureStudioHost({ ...options, paths });
  let result;
  try {
    result = await hostApiRequest(`/v1/registrations/${context.id}/heartbeat`, {
      paths,
      method: "POST",
      body,
    });
  } catch (error) {
    if (error?.status !== 404 || !lease.registration) throw error;
    const restored = {
      ...lease.registration,
      repo: { name: context.repoName, root: context.repoRoot },
      workingDirectory: context.workingDirectory,
      leaseId: lease.leaseId,
    };
    if (body.upstream) restored.upstream = body.upstream;
    if (body.process) restored.process = body.process;
    if (body.liveness) restored.liveness = body.liveness;
    result = await hostApiRequest(`/v1/registrations/${context.id}`, {
      paths,
      method: "PUT",
      body: restored,
    });
  }
  await writeLease(context.repoRoot, {
    ...lease,
    leaseId: result.body.leaseId,
    registration: result.body.registration,
    updatedAt: new Date().toISOString(),
  }, paths);
  return result.body;
}

export async function unregisterProject(parsed, options = {}) {
  const paths = options.paths || studioHostPaths(options.environment);
  const context = repoContext(parsed, options.cwd);
  const lease = await readLease(context.repoRoot, paths);
  if (!lease?.leaseId || lease.id !== context.id) {
    throw new Error("No local registration lease was found for this repository.");
  }
  await ensureStudioHost({ ...options, paths });
  let result;
  try {
    result = await hostApiRequest(`/v1/registrations/${context.id}`, {
      paths,
      method: "DELETE",
      body: { leaseId: lease.leaseId },
    });
  } catch (error) {
    if (error?.status !== 404) throw error;
    result = { body: { ok: true, alreadyAbsent: true } };
  }
  await removeLease(context.repoRoot, paths);
  return result.body;
}

export function devHelp() {
  return `studio dev — run a Studio app at {repo}.studio.local

Usage:
  studio dev [--port <port>] [-- <command>]

Examples:
  studio dev -- next dev --port {port}
  studio dev -- bun run custom-dev
  studio dev --port 3060 -- next dev

With no --port, studio dev allocates one: the port this project used last time
if it is still free, otherwise a free port from ${STUDIO_DEV_PORT_RANGE.start}-${STUDIO_DEV_PORT_RANGE.end} derived from the
repository name. The choice is remembered under the Studio host directory so
the loopback URL stays stable across restarts. Nothing in a project needs to
hardcode a port, and two projects can no longer collide on one.

The allocated port reaches the child two ways: the literal ${STUDIO_DEV_PORT_TOKEN} token is
substituted anywhere it appears in the command, and PORT is set in its
environment (Next.js honours it). A port you write yourself is never rewritten.

The persistent Studio host is started automatically. This wrapper registers the
child upstream, refreshes its lease, forwards SIGINT/SIGTERM to that child only,
and unregisters on exit, including Ctrl-C, so no stale route is left behind.`;
}

/**
 * Ports other registered projects are already using. Advisory: it prevents
 * handing out a port that belongs to a studio which is merely idle between
 * restarts, which the bind check alone cannot see.
 */
async function registeredPorts(id, paths) {
  try {
    const listed = await hostApiRequest("/v1/registrations", { paths, timeoutMs: 1_000 });
    return new Set(
      (listed.body?.registrations || [])
        .filter((registration) => registration.id !== id)
        .map((registration) => registration.upstream?.port)
        .filter((port) => Number.isInteger(port)),
    );
  } catch {
    return new Set();
  }
}

/**
 * One registration + child process lifetime. Returns the exit code alongside
 * how long the child survived, which is what lets the caller tell a lost port
 * race apart from a child that failed on its own.
 */
async function runDevAttempt({ id, repoName, repoRoot, cwd, port, childCommand, paths, options }) {
  const context = { id, repoName, repoRoot, workingDirectory: resolve(cwd) };
  const describe = (leaseId) => registrationBody(context, {
    port,
    pid: process.pid,
    ttlMs: DEFAULT_HEARTBEAT_TTL_MS,
    clientName: "studio-dev",
    command: childCommand.join(" "),
  }, leaseId);

  const registration = await hostApiRequest(`/v1/registrations/${id}`, {
    paths,
    method: "PUT",
    body: describe(),
  });
  let leaseId = registration.body.leaseId;
  console.log(`Studio: ${registration.body.url} → http://127.0.0.1:${port}`);

  let child;
  let heartbeat;
  let maintenance = Promise.resolve();
  const startedAt = Date.now();
  try {
    child = spawn(childCommand[0], childCommand.slice(1), {
      cwd,
      env: {
        ...process.env,
        PATH: pathWithLocalBins(cwd),
        PORT: String(port),
        STUDIO_URL: registration.body.url,
        // Lets the browser find its agent pages when opened on the raw port.
        NEXT_PUBLIC_STUDIO_ID: id,
      },
      stdio: "inherit",
    });
    heartbeat = setInterval(() => {
      maintenance = maintenance.then(async () => {
        try {
          await hostApiRequest(`/v1/registrations/${id}/heartbeat`, {
            paths,
            method: "POST",
            body: { leaseId },
            timeoutMs: 1_000,
          });
        } catch {
          await ensureStudioHost({ ...options, paths });
          const restored = await hostApiRequest(`/v1/registrations/${id}`, {
            paths,
            method: "PUT",
            body: describe(leaseId),
          });
          leaseId = restored.body.leaseId;
        }
      }).catch(() => {});
    }, Math.floor(DEFAULT_HEARTBEAT_TTL_MS / 3));

    // `on`, not `once`: a second Ctrl-C must reach a child that ignored the
    // first one rather than killing this wrapper before it can unregister.
    let signals = 0;
    const forward = (signal) => () => {
      signals += 1;
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      child.kill(signals >= 3 ? "SIGKILL" : signal);
    };
    const interrupt = forward("SIGINT");
    const terminate = forward("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    let result;
    try {
      result = await new Promise((resolveChild, rejectChild) => {
        child.once("error", rejectChild);
        child.once("close", (code, signal) => resolveChild({ code, signal }));
      });
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    }
    const ranForMs = Date.now() - startedAt;
    if (result.signal) return { code: 128 + (result.signal === "SIGINT" ? 2 : 15), ranForMs, signal: result.signal };
    return { code: result.code ?? 1, ranForMs, signal: null };
  } finally {
    clearInterval(heartbeat);
    await maintenance.catch(() => {});
    await hostApiRequest(`/v1/registrations/${id}`, {
      paths,
      method: "DELETE",
      body: { leaseId },
      timeoutMs: 1_000,
    }).catch(() => {});
  }
}

export async function runLocalDev(args, options = {}) {
  const { command, help, port: requestedPort } = parseDevArgs(args);
  if (help) {
    console.log(devHelp());
    return 0;
  }
  const cwd = options.cwd || process.cwd();
  const repoRoot = resolveRepoRoot(cwd);
  const repoName = resolveRepoName(repoRoot);
  const id = normalizeRepoName(repoName);
  const baseCommand = command.length > 0 ? command : ["bunx", "--bun", "next", "dev"];
  const paths = options.paths || studioHostPaths(options.environment);
  await ensureStudioHost({ ...options, paths });

  const attempts = requestedPort ? 1 : PORT_CONFLICT_ATTEMPTS;
  const exclude = new Set();
  for (let attempt = 1; ; attempt += 1) {
    let port = requestedPort;
    if (!port) {
      const allocation = await allocateDevPort({
        id,
        repoRoot,
        workingDirectory: resolve(cwd),
        paths,
        taken: await registeredPorts(id, paths),
        exclude,
      });
      port = allocation.port;
      // Written now rather than on clean exit: the preference is re-verified on
      // every run, so a stale entry costs one skipped candidate, while a
      // SIGKILLed run would otherwise forget the port it had been using.
      await rememberDevPort({ id, repoRoot, port, paths }).catch(() => {});
    }

    const childCommand = substitutePortToken(baseCommand, port);
    const result = await runDevAttempt({
      id, repoName, repoRoot, cwd, port, childCommand, paths, options,
    });

    const lostRace = !requestedPort
      && result.code !== 0
      && !result.signal
      && result.ranForMs < PORT_CONFLICT_WINDOW_MS
      && !(await isPortAvailable(port));
    if (lostRace && attempt < attempts) {
      console.error(`Studio: port ${port} was taken by another process; reallocating.`);
      exclude.add(port);
      continue;
    }
    return result.code;
  }
}

export async function runHostForeground(options = {}) {
  const host = await startStudioHost(options);
  console.log(
    `Studio host ${host.status().edge} edge on ${formatLocalUrl("{repo}.studio.local", host.publicPort)}`,
  );
  const stop = () => host.stop({ preserveState: true });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await host.waitUntilStopped();
  return 0;
}
