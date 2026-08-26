import type { StudioAgentTarget } from "../agents/types";
import type { StudioScoutManifestConfig } from "../scout/types";

export interface StudioPreviewLink {
  label: string;
  path: string;
}

export interface StudioPreviewWorkspace {
  id: string;
  label: string;
  host: string;
  description?: string;
  links: StudioPreviewLink[];
}

export interface StudioProjectManifest {
  version?: 1;
  id: string;
  label?: string;
  studioDir?: string;
  start?: string;
  healthPath?: string;
  rootPath?: string;
  host?: string;
  preferredPort?: number;
  env?: Record<string, string>;
  previews?: StudioPreviewWorkspace[];
  scout?: StudioScoutManifestConfig;
  /**
   * Agents this Studio may dispatch work to. Absent → consumers fall back to
   * `[scout.identity]`, so single-agent configs keep working unchanged.
   */
  agents?: StudioAgentTarget[];
}

export interface EnabledStudio {
  id: string;
  repo: string;
  enabled: boolean;
  host: string;
  port: number;
  label?: string;
  manifestPath?: string;
  updatedAt?: string;
}

export interface StudioMachineRegistry {
  version: 1;
  studios: EnabledStudio[];
}

export interface ResolvedStudio {
  id: string;
  label: string;
  repo: string;
  manifestPath: string;
  studioDir: string;
  command: string;
  healthPath: string;
  rootPath: string;
  host: string;
  port: number;
  enabled: boolean;
  env: Record<string, string>;
  previews: StudioPreviewWorkspace[];
}

export interface StudioRuntimeStatus {
  id: string;
  label: string;
  host: string;
  port: number;
  repo: string;
  studioDir: string;
  url: string;
  running: boolean;
  supervised: boolean;
  previews: StudioPreviewWorkspace[];
  pid?: number;
}
