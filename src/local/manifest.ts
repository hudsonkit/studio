import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

import {
  normalizeRelativeDir,
  normalizeStudioHost,
  normalizeStudioId,
} from "./ids";
import type { StudioProjectManifest } from "./types";

export const STUDIO_PROJECT_MANIFEST_PATH = ".studio/project.json";

export interface CreateProjectManifestOptions {
  id: string;
  label?: string;
  studioDir?: string;
  start?: string;
  healthPath?: string;
  rootPath?: string;
  host?: string;
  preferredPort?: number;
  env?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalPath(value: unknown, field: string): string | undefined {
  const text = optionalString(value, field);
  if (!text) return undefined;
  return text.startsWith("/") ? text : `/${text.replace(/^\/+/, "")}`;
}

function optionalPort(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65535
  ) {
    throw new Error(`${field} must be an integer port between 1 and 65535.`);
  }
  return value;
}

function optionalEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("env must be an object of string values.");
  }
  const env: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      throw new Error(`env.${key} must be a string.`);
    }
    env[key] = raw;
  }
  return env;
}

export function parseStudioProjectManifest(
  value: unknown,
  source = STUDIO_PROJECT_MANIFEST_PATH,
): StudioProjectManifest {
  if (!isRecord(value)) {
    throw new Error(`${source} must contain a JSON object.`);
  }
  if (value.version !== undefined && value.version !== 1) {
    throw new Error(`${source} uses unsupported version ${String(value.version)}.`);
  }

  const rawId = optionalString(value.id, "id");
  if (!rawId) {
    throw new Error(`${source} must define id.`);
  }

  const studioDir = optionalString(value.studioDir, "studioDir");
  const host = optionalString(value.host, "host");

  return {
    version: 1,
    id: normalizeStudioId(rawId),
    label: optionalString(value.label, "label"),
    studioDir: studioDir ? normalizeRelativeDir(studioDir) : undefined,
    start: optionalString(value.start, "start"),
    healthPath: optionalPath(value.healthPath, "healthPath"),
    rootPath: optionalPath(value.rootPath, "rootPath"),
    host: host ? normalizeStudioHost(host) : undefined,
    preferredPort: optionalPort(value.preferredPort, "preferredPort"),
    env: optionalEnv(value.env),
  };
}

export function projectManifestPath(repo: string): string {
  return join(resolve(repo), STUDIO_PROJECT_MANIFEST_PATH);
}

export async function readStudioProjectManifest(
  repo: string,
): Promise<StudioProjectManifest> {
  const manifestPath = projectManifestPath(repo);
  const body = await readFile(manifestPath, "utf8");
  return parseStudioProjectManifest(JSON.parse(body), manifestPath);
}

export async function hasStudioProjectManifest(repo: string): Promise<boolean> {
  try {
    await access(projectManifestPath(repo));
    return true;
  } catch {
    return false;
  }
}

export async function writeStudioProjectManifest(
  repo: string,
  options: CreateProjectManifestOptions,
): Promise<StudioProjectManifest> {
  const manifest = parseStudioProjectManifest({
    version: 1,
    ...options,
  });
  const manifestPath = projectManifestPath(repo);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}
