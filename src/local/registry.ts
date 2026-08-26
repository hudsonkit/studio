import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  defaultHostForStudioId,
  normalizeRelativeDir,
  normalizeStudioHost,
  normalizeStudioId,
} from "./ids";
import {
  projectManifestPath,
  readStudioProjectManifest,
  STUDIO_PROJECT_MANIFEST_PATH,
} from "./manifest";
import { resolveStudioSupportPaths, type StudioSupportPaths } from "./paths";
import type {
  EnabledStudio,
  ResolvedStudio,
  StudioMachineRegistry,
} from "./types";

export interface RegisterStudioOptions {
  repo: string;
  id?: string;
  host?: string;
  port?: number;
  enabled?: boolean;
  paths?: StudioSupportPaths;
}

export interface DiscoverStudioOptions {
  root: string;
  maxDepth?: number;
  includeHidden?: boolean;
}

export interface DiscoveredStudioProject {
  repo: string;
  manifestPath: string;
}

const DEFAULT_COMMAND = "bun dev";
const DEFAULT_STUDIO_DIR = "studio";

function emptyRegistry(): StudioMachineRegistry {
  return { version: 1, studios: [] };
}

function parseRegistry(value: unknown, source: string): StudioMachineRegistry {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== 1 ||
    !Array.isArray((value as { studios?: unknown }).studios)
  ) {
    throw new Error(`${source} must be a Studio registry v1 JSON object.`);
  }

  const studios = (value as { studios: unknown[] }).studios.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${source} contains an invalid studio entry.`);
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string") throw new Error("registry entry id must be a string.");
    if (typeof raw.repo !== "string") throw new Error("registry entry repo must be a string.");
    if (typeof raw.host !== "string") throw new Error("registry entry host must be a string.");
    if (!Number.isInteger(raw.port)) throw new Error("registry entry port must be an integer.");
    return {
      id: normalizeStudioId(raw.id),
      repo: resolve(raw.repo),
      enabled: raw.enabled !== false,
      host: normalizeStudioHost(raw.host),
      port: raw.port as number,
      label: typeof raw.label === "string" ? raw.label : undefined,
      manifestPath: typeof raw.manifestPath === "string"
        ? raw.manifestPath
        : undefined,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    } satisfies EnabledStudio;
  });

  studios.sort((left, right) => left.id.localeCompare(right.id));
  return { version: 1, studios };
}

export async function readStudioMachineRegistry(
  paths = resolveStudioSupportPaths(),
): Promise<StudioMachineRegistry> {
  try {
    const body = await readFile(paths.registryPath, "utf8");
    return parseRegistry(JSON.parse(body), paths.registryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyRegistry();
    }
    throw error;
  }
}

export async function writeStudioMachineRegistry(
  registry: StudioMachineRegistry,
  paths = resolveStudioSupportPaths(),
): Promise<void> {
  await mkdir(dirname(paths.registryPath), { recursive: true });
  const sorted = {
    version: 1,
    studios: [...registry.studios].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  } satisfies StudioMachineRegistry;
  await writeFile(paths.registryPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

export function allocateStudioPort(
  registry: StudioMachineRegistry,
  preferredPort?: number,
  startPort = 5200,
): number {
  const used = new Set(registry.studios.map((studio) => studio.port));
  if (preferredPort && !used.has(preferredPort)) {
    return preferredPort;
  }
  let port = startPort;
  while (used.has(port)) port += 1;
  return port;
}

export async function registerStudio(
  options: RegisterStudioOptions,
): Promise<EnabledStudio> {
  const paths = options.paths ?? resolveStudioSupportPaths();
  const repo = resolve(options.repo);
  const manifest = await readStudioProjectManifest(repo);
  const registry = await readStudioMachineRegistry(paths);
  const existing = registry.studios.find((entry) => entry.repo === repo);
  const id = normalizeStudioId(options.id ?? existing?.id ?? manifest.id);
  const host = normalizeStudioHost(
    options.host ?? existing?.host ?? manifest.host ?? defaultHostForStudioId(id),
  );
  const port =
    options.port ??
    existing?.port ??
    allocateStudioPort(registry, manifest.preferredPort);

  const entry: EnabledStudio = {
    id,
    repo,
    enabled: options.enabled ?? existing?.enabled ?? true,
    host,
    port,
    label: manifest.label ?? existing?.label,
    manifestPath: projectManifestPath(repo),
    updatedAt: new Date().toISOString(),
  };

  const nextStudios = registry.studios.filter(
    (studio) => studio.id !== id && studio.repo !== repo,
  );
  nextStudios.push(entry);
  await writeStudioMachineRegistry({ version: 1, studios: nextStudios }, paths);
  return entry;
}

export async function setStudioEnabled(
  id: string,
  enabled: boolean,
  paths = resolveStudioSupportPaths(),
): Promise<EnabledStudio> {
  const registry = await readStudioMachineRegistry(paths);
  const normalizedId = normalizeStudioId(id);
  const entry = registry.studios.find((studio) => studio.id === normalizedId);
  if (!entry) {
    throw new Error(`Unknown studio: ${id}`);
  }
  entry.enabled = enabled;
  entry.updatedAt = new Date().toISOString();
  await writeStudioMachineRegistry(registry, paths);
  return entry;
}

export async function resolveStudio(
  entry: EnabledStudio,
): Promise<ResolvedStudio> {
  const manifest = await readStudioProjectManifest(entry.repo);
  const studioDir = normalizeRelativeDir(manifest.studioDir ?? DEFAULT_STUDIO_DIR);
  return {
    id: entry.id,
    label: manifest.label ?? entry.label ?? entry.id,
    repo: entry.repo,
    manifestPath: entry.manifestPath ?? projectManifestPath(entry.repo),
    studioDir: join(entry.repo, studioDir),
    command: manifest.start ?? DEFAULT_COMMAND,
    healthPath: manifest.healthPath ?? "/",
    rootPath: manifest.rootPath ?? "/",
    host: entry.host,
    port: entry.port,
    enabled: entry.enabled,
    env: manifest.env ?? {},
    previews: manifest.previews ?? [],
  };
}

export async function listResolvedStudios(
  paths = resolveStudioSupportPaths(),
): Promise<ResolvedStudio[]> {
  const registry = await readStudioMachineRegistry(paths);
  const resolved: ResolvedStudio[] = [];
  for (const entry of registry.studios) {
    resolved.push(await resolveStudio(entry));
  }
  return resolved;
}

export async function discoverStudioProjects(
  options: DiscoverStudioOptions,
): Promise<DiscoveredStudioProject[]> {
  const root = resolve(options.root);
  const maxDepth = options.maxDepth ?? 3;
  const includeHidden = options.includeHidden ?? false;
  const discovered: DiscoveredStudioProject[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const manifestPath = join(dir, STUDIO_PROJECT_MANIFEST_PATH);
    try {
      await readFile(manifestPath, "utf8");
      discovered.push({ repo: dir, manifestPath });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      if (!includeHidden && entry.name.startsWith(".")) continue;
      await walk(join(dir, entry.name), depth + 1);
    }
  }

  await walk(root, 0);
  return discovered.sort((left, right) => left.repo.localeCompare(right.repo));
}
