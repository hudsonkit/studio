import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { emptyFile, parseFlowFile, touch, type FlowFile } from "../model";

export function libraryRoot(): string {
  return process.env.STUDIO_FLOWS_ROOT?.trim() || join(homedir(), ".studio", "flows");
}

function filePath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(libraryRoot(), `${safe}.flow.json`);
}

export async function ensureLibrary(): Promise<void> {
  await mkdir(libraryRoot(), { recursive: true });
}

export async function listFiles(): Promise<
  readonly { id: string; name: string; updatedAt: string; pageCount: number; path: string }[]
> {
  await ensureLibrary();
  const root = libraryRoot();
  const names = await readdir(root);
  const out: { id: string; name: string; updatedAt: string; pageCount: number; path: string }[] = [];
  for (const name of names) {
    if (!name.endsWith(".flow.json")) continue;
    const path = join(root, name);
    try {
      const file = parseFlowFile(JSON.parse(await readFile(path, "utf8")));
      out.push({
        id: file.id,
        name: file.name,
        updatedAt: file.updatedAt,
        pageCount: file.pages.length,
        path,
      });
    } catch {
      // skip corrupt
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export async function loadFile(id: string): Promise<FlowFile> {
  const path = filePath(id);
  const raw = await readFile(path, "utf8");
  return parseFlowFile(JSON.parse(raw));
}

export async function saveFile(file: FlowFile): Promise<FlowFile> {
  await ensureLibrary();
  const next = touch(file);
  const path = filePath(next.id);
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tmp, path);
  return next;
}

export async function createFile(name: string, cloneId?: string): Promise<FlowFile> {
  if (cloneId) {
    const source = await loadFile(cloneId);
    const base = emptyFile(name);
    const cloned: FlowFile = {
      ...source,
      id: base.id,
      name,
      createdAt: base.createdAt,
      journeys: JSON.parse(JSON.stringify(source.journeys ?? [])) as FlowFile["journeys"],
      pages: JSON.parse(JSON.stringify(source.pages)) as FlowFile["pages"],
    };
    // Re-id pages/journeys so the clone is independent of the source.
    const pageIdMap = new Map<string, string>();
    for (const page of cloned.pages) {
      const next = `page_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
      pageIdMap.set(page.id, next);
      page.id = next;
    }
    for (const journey of cloned.journeys) {
      journey.id = `journey_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
      journey.pageIds = journey.pageIds.map((id) => pageIdMap.get(id) ?? id);
    }
    const pageToJourney = new Map<string, string>();
    for (const journey of cloned.journeys) {
      for (const pid of journey.pageIds) pageToJourney.set(pid, journey.id);
    }
    for (const page of cloned.pages) {
      page.journeyId = pageToJourney.get(page.id);
    }
    return saveFile(cloned);
  }
  return saveFile(emptyFile(name));
}

export function resolveFilePath(id: string): string {
  return filePath(id);
}
