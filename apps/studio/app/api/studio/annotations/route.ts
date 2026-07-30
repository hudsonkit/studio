import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir, access } from "fs/promises";
import { join, dirname } from "path";

// Annotation sidecar persistence for the canonical Studio.
// Same convention as examples/studio-app: .studio/annotations/<key>.json,
// written at the REPO root (the dir that holds .studio/project.json) so local
// agents read one annotations folder no matter where Next was started from.

async function findStudioRoot(start: string): Promise<string> {
  let dir = start;
  for (;;) {
    try {
      await access(join(dir, ".studio", "project.json"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return start;
      dir = parent;
    }
  }
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { persistKey, slug, annotations, decisions } = body;

    const key = sanitizeKey(persistKey || slug || "unknown");
    const root = await findStudioRoot(process.cwd());
    const dir = join(root, ".studio", "annotations");
    const payload = {
      updatedAt: new Date().toISOString(),
      slug,
      persistKey: key,
      annotations: annotations ?? [],
      decisions: decisions ?? [],
    };

    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${key}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

    return NextResponse.json({ ok: true, key, filePath, written: payload.annotations.length });
  } catch (err) {
    console.error("[studio/api] annotations persist error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawKey = searchParams.get("key") || searchParams.get("slug");
  if (!rawKey) {
    return NextResponse.json({ ok: false, error: "key or slug required" }, { status: 400 });
  }

  const key = sanitizeKey(rawKey);
  const root = await findStudioRoot(process.cwd());
  const filePath = join(root, ".studio", "annotations", `${key}.json`);

  try {
    const content = await readFile(filePath, "utf8");
    return NextResponse.json({ ok: true, key, filePath, data: JSON.parse(content) });
  } catch {
    return NextResponse.json({ ok: true, key, filePath, data: null });
  }
}
