/**
 * Studies that are also published as Claude artifacts.
 *
 * Each entry names the module and export that render the study. The artifact
 * builder bundles that component, React, the app's CSS and fonts into one
 * self-contained HTML page (`bun src/artifacts/cli.ts build <id>`).
 * Mirrors `StudySpec` in src/artifacts/buildStudy.ts.
 */
export interface ArtifactStudy {
  /** Artifact id, and the registry page id unless `page` says otherwise. */
  id: string;
  /** Module path, relative to the repo root. */
  entry: string;
  /** Named export rendered with `{ page }`. */
  export: string;
  /** Registry page id or href. */
  page?: string;
  /** "app" (default) brings globals.css and fonts; "own" relies on the study's CSS imports. */
  css?: "app" | "own";
}

export const artifactStudies: readonly ArtifactStudy[] = [
  {
    id: "talkie-one-thought",
    entry: "apps/studio/src/studio/studies/TalkieOneThought.tsx",
    export: "TalkieOneThoughtStudy",
  },
];
