import {
  ActionControllerStudy,
  type PreviewPhase,
} from "@/studio/studies/actController/ActionControllerStudy";

const previewPhases = new Set<PreviewPhase>([
  "staging",
  "countdown",
  "recording",
  "completing",
  "completed",
]);

export default async function ActionControllerRenderPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>;
}) {
  const requestedPhase = (await searchParams).phase;
  const initialPhase = previewPhases.has(requestedPhase as PreviewPhase)
    ? requestedPhase as PreviewPhase
    : "recording";

  return <ActionControllerStudy initialPhase={initialPhase} />;
}
