import { homedir } from "node:os";
import { join } from "node:path";

export interface StudioSupportPathOptions {
  homeDir?: string;
  supportDir?: string;
}

export interface StudioSupportPaths {
  supportDir: string;
  registryPath: string;
  runtimeDir: string;
  logsDir: string;
  localEdgeDir: string;
  caddyfilePath: string;
}

export function resolveStudioSupportPaths(
  options: StudioSupportPathOptions = {},
): StudioSupportPaths {
  const home = options.homeDir ?? homedir();
  const supportDir =
    options.supportDir ??
    process.env.STUDIO_LOCAL_SUPPORT_DIR?.trim() ??
    (process.platform === "darwin"
      ? join(home, "Library", "Application Support", "Studio")
      : join(home, ".studio-local"));

  const runtimeDir = join(supportDir, "runtime");
  const logsDir = join(supportDir, "logs");
  const localEdgeDir = join(supportDir, "local-edge");

  return {
    supportDir,
    registryPath: join(supportDir, "registry.json"),
    runtimeDir,
    logsDir,
    localEdgeDir,
    caddyfilePath: join(localEdgeDir, "Caddyfile"),
  };
}
