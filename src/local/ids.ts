export function normalizeStudioId(value: string): string {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id) {
    throw new Error("Studio id must contain at least one letter or number.");
  }
  return id;
}

export function normalizeStudioHost(value: string): string {
  const host = value.trim().replace(/\.$/, "").toLowerCase();
  if (!host || host.includes("/") || /\s/.test(host)) {
    throw new Error(`Invalid studio host: ${value}`);
  }
  return host;
}

export function defaultHostForStudioId(id: string): string {
  return `${normalizeStudioId(id)}.studio.local`;
}

export function normalizeRelativeDir(value: string): string {
  const dir = value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  if (!dir || dir.startsWith("/") || dir.split("/").includes("..")) {
    throw new Error(`Studio directory must be relative to the repo: ${value}`);
  }
  return dir;
}
