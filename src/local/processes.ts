import { createWriteStream, mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import type { StudioSupportPaths } from "./paths";
import type { ResolvedStudio, StudioRuntimeStatus } from "./types";
import { studioAppOrigin, urlForLocalPath } from "./urls";

export interface StudioProcessSupervisorOptions {
  paths: StudioSupportPaths;
}

interface SupervisedProcess {
  child: ChildProcess;
  startedAt: number;
}

function renderCommand(template: string, studio: ResolvedStudio): string {
  return template
    .replace(/\{id\}/g, studio.id)
    .replace(/\{host\}/g, studio.host)
    .replace(/\{port\}/g, String(studio.port));
}

async function fetchWithTimeout(
  url: URL,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "text/html,application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function isStudioReachable(
  studio: Pick<ResolvedStudio, "port" | "healthPath">,
): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      urlForLocalPath(studioAppOrigin(studio.port), studio.healthPath),
      800,
    );
    return response.status < 500;
  } catch {
    return false;
  }
}

export class StudioProcessSupervisor {
  private readonly paths: StudioSupportPaths;
  private readonly children = new Map<string, SupervisedProcess>();

  constructor(options: StudioProcessSupervisorOptions) {
    this.paths = options.paths;
    mkdirSync(this.paths.logsDir, { recursive: true });
  }

  status(studio: ResolvedStudio): Promise<StudioRuntimeStatus> {
    return this.resolveStatus(studio);
  }

  async start(studio: ResolvedStudio): Promise<StudioRuntimeStatus> {
    const current = await this.resolveStatus(studio);
    if (current.running) return current;

    await mkdir(this.paths.logsDir, { recursive: true });
    const logPath = join(this.paths.logsDir, `${studio.id}.log`);
    const log = createWriteStream(logPath, { flags: "a" });
    log.write(`\n[studio-local] ${new Date().toISOString()} start ${studio.id}\n`);
    log.write(`[studio-local] cwd ${studio.studioDir}\n`);
    log.write(`[studio-local] command ${renderCommand(studio.command, studio)}\n`);

    const child = spawn("sh", ["-lc", renderCommand(studio.command, studio)], {
      cwd: studio.studioDir,
      env: {
        ...process.env,
        ...studio.env,
        PORT: String(studio.port),
        STUDIO_PORT: String(studio.port),
        HOST: "0.0.0.0",
        STUDIO_HOST: studio.host,
        NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    this.children.set(studio.id, { child, startedAt: Date.now() });

    child.once("exit", (code, signal) => {
      log.write(`[studio-local] exit code=${String(code)} signal=${String(signal)}\n`);
      log.end();
      const current = this.children.get(studio.id);
      if (current?.child === child) {
        this.children.delete(studio.id);
      }
    });

    child.once("error", (error) => {
      log.write(`[studio-local] spawn error ${error.message}\n`);
    });

    return this.waitForStatus(studio, 20_000);
  }

  stop(id: string): void {
    const current = this.children.get(id);
    if (!current) return;
    current.child.kill("SIGTERM");
    this.children.delete(id);
  }

  dispose(): void {
    for (const id of [...this.children.keys()]) {
      this.stop(id);
    }
  }

  private async waitForStatus(
    studio: ResolvedStudio,
    timeoutMs: number,
  ): Promise<StudioRuntimeStatus> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.resolveStatus(studio);
      if (status.running) return status;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return this.resolveStatus(studio);
  }

  private async resolveStatus(studio: ResolvedStudio): Promise<StudioRuntimeStatus> {
    const supervised = this.children.get(studio.id);
    const running = await isStudioReachable(studio);
    return {
      id: studio.id,
      label: studio.label,
      host: studio.host,
      port: studio.port,
      repo: studio.repo,
      studioDir: studio.studioDir,
      url: `http://${studio.host}${studio.rootPath}`,
      running,
      supervised: Boolean(supervised),
      previews: studio.previews,
      pid: supervised?.child.pid,
    };
  }
}
