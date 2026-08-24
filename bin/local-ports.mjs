/**
 * Port allocation for `studio dev`.
 *
 * Projects should not hardcode a port. Two repos that both pick 3070 race for
 * it, and the loser never registers, so its `{repo}.studio.local` hostname
 * silently resolves to nothing. Instead every project gets a port out of a
 * dedicated range, derived from its own identity, remembered across restarts,
 * and verified as bindable before it is handed to the child process.
 *
 * State lives next to the rest of the host state (`~/.studio/host/dev-ports.json`)
 * because a port assignment is machine state, not repository source.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { studioHostPaths } from "./local-host.mjs";

/**
 * A dedicated range, deliberately away from the 3000-block every framework
 * reaches for and below the ephemeral range macOS assigns (49152+), so an
 * allocation cannot be stolen by an outbound socket.
 */
export const STUDIO_DEV_PORT_RANGE = Object.freeze({ start: 43_200, end: 43_299 });

/** Token a child command can use to reference the allocated port. */
export const STUDIO_DEV_PORT_TOKEN = "{port}";

const PORT_TOKEN_GLOBAL = /\{port\}/gi;
const PORT_TOKEN_ANY = /\{port\}/i;
const PORT_TOKEN_EXACT = /^\{port\}$/i;

export function isPortToken(value) {
  return PORT_TOKEN_EXACT.test(String(value));
}

export function commandUsesPortToken(command) {
  return command.some((argument) => PORT_TOKEN_ANY.test(String(argument)));
}

/**
 * Replaces `{port}` in the child command. Nothing else about the command the
 * user wrote is touched: an explicit `--port 3070` stays 3070.
 */
export function substitutePortToken(command, port) {
  return command.map((argument) => String(argument).replace(PORT_TOKEN_GLOBAL, String(port)));
}

export function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolveAvailable) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveAvailable(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolveAvailable(true));
    });
  });
}

function rangeSpan(range) {
  return range.end - range.start + 1;
}

/**
 * A stable, collision-spread starting point per project. `talkie` lands on the
 * same port on a fresh machine as it does here, before anything is persisted.
 */
export function derivedPortForId(id, range = STUDIO_DEV_PORT_RANGE) {
  const digest = createHash("sha256").update(String(id)).digest();
  return range.start + (digest.readUInt32BE(0) % rangeSpan(range));
}

export function devPortsPath(paths = studioHostPaths()) {
  return paths.devPorts || join(paths.root, "dev-ports.json");
}

function emptyAssignments() {
  return { version: 1, assignments: {} };
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65_535;
}

export async function readDevPortAssignments(paths = studioHostPaths()) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(devPortsPath(paths), "utf8"));
  } catch {
    return emptyAssignments();
  }
  if (!parsed || parsed.version !== 1 || typeof parsed.assignments !== "object" || parsed.assignments === null) {
    return emptyAssignments();
  }
  const assignments = {};
  for (const [id, entry] of Object.entries(parsed.assignments)) {
    if (!entry || typeof entry !== "object" || !validPort(entry.port)) continue;
    assignments[id] = {
      port: entry.port,
      repoRoot: typeof entry.repoRoot === "string" ? entry.repoRoot : undefined,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    };
  }
  return { version: 1, assignments };
}

async function writeAtomic(path, contents) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

/**
 * Re-reads before writing so two concurrent `studio dev` runs cannot drop each
 * other's assignment; only this project's entry is rewritten.
 */
export async function rememberDevPort({ id, repoRoot, port, paths = studioHostPaths(), now = () => new Date() }) {
  const current = await readDevPortAssignments(paths);
  const next = {
    version: 1,
    assignments: {
      ...current.assignments,
      [id]: { port, repoRoot, updatedAt: now().toISOString() },
    },
  };
  await writeAtomic(devPortsPath(paths), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function manifestPreferredPort(directory) {
  try {
    const manifest = JSON.parse(await readFile(join(directory, ".studio", "project.json"), "utf8"));
    return validPort(manifest?.preferredPort) ? manifest.preferredPort : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Candidate ports, best first: what this project used last time, then what its
 * `.studio/project.json` asks for, then its derived home, then the rest of the
 * range walked from that home.
 */
export async function devPortCandidates({
  id,
  repoRoot,
  workingDirectory,
  paths = studioHostPaths(),
  range = STUDIO_DEV_PORT_RANGE,
}) {
  const candidates = [];
  const seen = new Set();
  const push = (port, source) => {
    if (!validPort(port) || seen.has(port)) return;
    seen.add(port);
    candidates.push({ port, source });
  };

  const stored = await readDevPortAssignments(paths);
  push(stored.assignments[id]?.port, "remembered");

  for (const directory of [workingDirectory, repoRoot].filter(Boolean)) {
    push(await manifestPreferredPort(directory), "manifest");
  }

  const home = derivedPortForId(id, range);
  push(home, "derived");
  const span = rangeSpan(range);
  const offset = home - range.start;
  for (let step = 1; step < span; step += 1) {
    push(range.start + ((offset + step) % span), "scan");
  }
  return candidates;
}

/**
 * Picks the first candidate that is neither claimed by another registered
 * project nor currently bindable-by-something-else. The bind check is a
 * point-in-time answer, so callers must still cope with losing the race — see
 * the conflict retry in `runLocalDev`.
 */
export async function allocateDevPort({
  id,
  repoRoot,
  workingDirectory,
  paths = studioHostPaths(),
  range = STUDIO_DEV_PORT_RANGE,
  taken = new Set(),
  exclude = new Set(),
  available = isPortAvailable,
}) {
  const candidates = await devPortCandidates({ id, repoRoot, workingDirectory, paths, range });
  for (const candidate of candidates) {
    if (exclude.has(candidate.port) || taken.has(candidate.port)) continue;
    if (!(await available(candidate.port))) continue;
    return candidate;
  }
  throw new Error(
    `No free port available for ${id} in the Studio dev range ${range.start}-${range.end}.`,
  );
}

/**
 * Local `node_modules/.bin` directories, nearest first. Without these the CLI
 * can only spawn `next` when a package manager already put them on PATH, which
 * is why `studio dev` invoked directly failed with `spawn next ENOENT`.
 */
export function localBinDirectories(cwd) {
  const directories = [];
  let current = resolve(cwd);
  while (true) {
    const candidate = join(current, "node_modules", ".bin");
    if (existsSync(candidate)) directories.push(candidate);
    const parent = dirname(current);
    if (parent === current) return directories;
    current = parent;
  }
}

export function pathWithLocalBins(cwd, environment = process.env) {
  const directories = localBinDirectories(cwd);
  if (directories.length === 0) return environment.PATH;
  return [...directories, environment.PATH].filter(Boolean).join(":");
}
