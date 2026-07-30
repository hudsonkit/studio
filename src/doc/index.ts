export { EngMarkdown } from "./EngMarkdown";
export type { EngMarkdownProps } from "./EngMarkdown";

export { EngDocSheet, DataRow } from "./EngDocSheet";
export type { EngDocSheetProps, DataRowProps } from "./EngDocSheet";

export {
  AnnotatableDoc,
  formatDmPayload,
} from "./AnnotatableDoc";
export type {
  AnnotatableDocProps,
  Annotation,
  AnnotationLocation,
  SendPassPayload,
  SendPassTarget,
} from "./AnnotatableDoc";

export {
  AnnotationProvider,
  useAnnotationBlock,
} from "./AnnotationContext";
export type {
  AnnotationBlockKind,
  AnnotationBlockDecoration,
  AnnotationDecorator,
  AnnotationProviderProps,
  MdNode,
} from "./AnnotationContext";

export {
  annotationsToDecisions,
  createWinnerDecision,
  createTurnDecision,
  getActiveTreatment,
} from "./decisions";
export type {
  TreatmentDecision,
  DecisionKind,
  Treatment,
  TreatmentId,
} from "./decisions";

export {
  persistAnnotations,
  fetchPersistedAnnotations,
  getDefaultSidecarPath,
} from "./persist";
export type { PersistPayload, PersistResult } from "./persist";

// Voice integration (re-export types from hudsonkit/voice for convenience when wiring dictation)
export type {
  UseVoiceInputOptions,
  UseVoiceInputResult,
  UseHudsonVoiceInputOptions,
  UseHudsonVoiceInputResult,
} from 'hudsonkit/voice';

export type { VoiceInputShape } from './AnnotatableDoc';
