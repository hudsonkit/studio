/**
 * This repo's own component registry — the specimen that proves the
 * `@arach/studio/components` schema survives contact with a real component,
 * and the file `studio components <cmd>` loads when run from this repo.
 *
 * Consumers copy this convention: one `studio.components.ts` at the repo
 * root exporting `manifests`, each manifest a sidecar beside its component.
 */
import type { ComponentManifest } from "./src/components/manifest";
import { statusPillManifest } from "./src/atoms/StatusPill.manifest";

export const manifests: ComponentManifest[] = [statusPillManifest];
