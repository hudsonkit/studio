import type { Annotation } from "./AnnotatableDoc";
import type { TreatmentDecision } from "./decisions";

/**
 * Recommended persistence shape for studio annotations + decisions.
 *
 * Because agents are local (Cursor, scout, terminal, etc.), the primary
 * integration point is **files on disk**. The `onAnnotationsChange` callback
 * (and your decision handlers) are the hook where you decide how to write.
 *
 * This file gives you a small, copy-pasteable pattern + types.
 *
 * Typical usage in a Next.js app:
 *
 *   <AnnotatableDoc
 *     ...
 *     persistKey={page.href}
 *     onAnnotationsChange={(anns) =>
 *       persistAnnotations({
 *         persistKey: page.href,
 *         slug: page.href,
 *         annotations: anns,
 *         decisions: annotationsToDecisions(page.href, anns),
 *       })
 *     }
 *   />
 *
 * The `persistAnnotations` function below is just an example that POSTs to
 * a local API route. The route (see the studio-app example) does the actual
 * `fs.writeFile` to a conventional sidecar location.
 *
 * Local agents can then:
 *   - Read `.studio/annotations/<key>.json` directly from the filesystem
 *   - Or call the same GET endpoint if they have HTTP access
 */

export interface PersistPayload {
  persistKey?: string;
  slug: string;
  annotations: Annotation[];
  decisions?: TreatmentDecision[];
}

export interface PersistResult {
  ok: boolean;
  key: string;
  filePath?: string;
  written?: any;
  error?: string;
}

/**
 * Example persister that ships the current annotations/decisions to a
 * conventional local endpoint.
 *
 * In a real consumer you would:
 * - Call this (or a similar function) from onAnnotationsChange
 * - Have your API route write the sidecar using fs/promises
 * - Optionally also update in-memory state, a small local index, etc.
 *
 * The endpoint can be anything. The studio-app example uses:
 *   POST /api/studio/annotations
 */
export async function persistAnnotations(
  payload: PersistPayload,
  endpoint = '/api/studio/annotations',
): Promise<PersistResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, key: payload.persistKey || payload.slug, error: text || res.statusText };
    }

    return (await res.json()) as PersistResult;
  } catch (err) {
    return {
      ok: false,
      key: payload.persistKey || payload.slug,
      error: String(err),
    };
  }
}

/**
 * Convenience: fetch the current persisted sidecar for a key.
 * Useful for agents or for hydrating UI on load.
 */
export async function fetchPersistedAnnotations(
  keyOrSlug: string,
  endpoint = '/api/studio/annotations',
): Promise<any | null> {
  try {
    const res = await fetch(`${endpoint}?key=${encodeURIComponent(keyOrSlug)}`);
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Suggested sidecar location (for documentation and for agents that want
 * to know the convention without going through the API).
 *
 * Real apps can put this anywhere, but a common layout is:
 *   <repo-root>/.studio/annotations/<sanitized-key>.json
 * or next to the source treatment:
 *   docs/treatments/my-foo.treatment.annotations.json
 */
export function getDefaultSidecarPath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').toLowerCase();
  return `.studio/annotations/${safe}.json`;
}
