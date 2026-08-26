import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { findStudioProjectRoot } from "../local/manifest";

export interface StudioReviewPairing {
  pairedAgent: string | null;
  pairedAt: string | null;
}

const PAIRING_FILENAME = "review-pairing.json";

/**
 * Review sessions pair with one Scout agent so feedback routes without
 * re-picking. The pairing is project state, not source: it lives in a
 * sidecar next to the annotations, never in the manifest.
 */
export async function readStudioReviewPairing(
  startDirectory = process.cwd(),
): Promise<StudioReviewPairing> {
  try {
    const repo = await findStudioProjectRoot(startDirectory);
    const raw = await readFile(join(repo, ".studio", PAIRING_FILENAME), "utf8");
    const parsed = JSON.parse(raw) as Partial<StudioReviewPairing>;
    return {
      pairedAgent: typeof parsed.pairedAgent === "string" ? parsed.pairedAgent : null,
      pairedAt: typeof parsed.pairedAt === "string" ? parsed.pairedAt : null,
    };
  } catch {
    return { pairedAgent: null, pairedAt: null };
  }
}

export async function writeStudioReviewPairing(
  agent: string,
  startDirectory = process.cwd(),
): Promise<StudioReviewPairing> {
  const repo = await findStudioProjectRoot(startDirectory);
  const dir = join(repo, ".studio");
  await mkdir(dir, { recursive: true });
  const pairing: StudioReviewPairing = {
    pairedAgent: agent,
    pairedAt: new Date().toISOString(),
  };
  await writeFile(join(dir, PAIRING_FILENAME), `${JSON.stringify(pairing, null, 2)}\n`);
  return pairing;
}
