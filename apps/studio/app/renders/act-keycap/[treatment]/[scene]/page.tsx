import { notFound } from "next/navigation";
import { ActionStage } from "@/studio/studies/actKeycap/ActionStage";
import {
  SCENE_KEYS,
  type KeyCaptionScene,
} from "@/studio/studies/actKeycap/scenes";
import {
  KeyCaptionOpusA,
  KeyCaptionOpusB,
} from "@/studio/studies/actKeycap/KeyCaptions";

const TREATMENTS = { a: KeyCaptionOpusA, b: KeyCaptionOpusB } as const;
type TreatmentKey = keyof typeof TREATMENTS;

/**
 * Bare 960x540 capture route for the ACT-KEYCAP treatments.
 *
 * /renders/act-keycap/a/return
 * /renders/act-keycap/a/chord
 * /renders/act-keycap/b/return
 * /renders/act-keycap/b/chord
 *
 * The stage is pinned to the top-left of the document so a 960x540 viewport
 * screenshot is byte-comparable with the Action reference renders.
 */

export function generateStaticParams() {
  return (["a", "b"] as const).flatMap((treatment) =>
    (["return", "chord"] as const).map((scene) => ({ treatment, scene })),
  );
}

export default async function KeyCaptionCaptureRoute({
  params,
}: {
  params: Promise<{ treatment: string; scene: string }>;
}) {
  const { treatment, scene } = await params;

  if (!(treatment in TREATMENTS) || !(scene in SCENE_KEYS)) {
    notFound();
  }

  const Caption = TREATMENTS[treatment as TreatmentKey];
  const keys = SCENE_KEYS[scene as KeyCaptionScene];

  return (
    <main style={{ margin: 0, padding: 0, width: 960, height: 540, overflow: "hidden" }}>
      <ActionStage caption={<Caption keys={keys} />} />
    </main>
  );
}
