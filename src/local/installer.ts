import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  registryToCaddyfileConfig,
  writeStudioLocalCaddyfile,
  type StudioLocalEdgeScheme,
} from "./caddy";
import { resolveStudioSupportPaths, type StudioSupportPaths } from "./paths";
import {
  readStudioMachineRegistry,
  registerStudio,
} from "./registry";
import type { EnabledStudio } from "./types";
import { STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT } from "./urls";

export const STUDIO_LOCAL_SERVICE_LABEL = "dev.studio.local";

export interface StudioLocalCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface StudioLocalRunCommandOptions {
  env?: NodeJS.ProcessEnv;
}

export type StudioLocalRunCommand = (
  command: string,
  args: string[],
  options?: StudioLocalRunCommandOptions,
) => Promise<StudioLocalCommandResult>;

export interface StudioLocalDependencyReport {
  status: "ready" | "installed" | "missing";
  caddyBin: string;
  caddyPath: string | null;
  detail: string;
  installCommand?: string;
}

export interface StudioLocalServiceReport {
  label: string;
  launchAgentPath: string | null;
  installed: boolean;
  changed: boolean;
  started: boolean;
  loaded: boolean | null;
  detail: string;
}

export interface EnsureStudioLocalOptions {
  repo?: string;
  paths?: StudioSupportPaths;
  supervisorPort?: number;
  scheme?: StudioLocalEdgeScheme;
  caddyBin?: string;
  bunBin?: string;
  cliPath?: string;
  startService?: boolean;
  installDependencies?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  runCommand?: StudioLocalRunCommand;
}

export interface EnsureStudioLocalReport {
  paths: StudioSupportPaths;
  registered?: EnabledStudio;
  caddy: StudioLocalDependencyReport;
  service: StudioLocalServiceReport;
  caddyfilePath: string;
}

export interface StudioLocalLaunchAgentConfig {
  label?: string;
  bunBin: string;
  cliPath: string;
  paths: StudioSupportPaths;
  supervisorPort?: number;
  scheme?: StudioLocalEdgeScheme;
  caddyBin: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plistString(value: string): string {
  return `\t\t<string>${escapeXml(value)}</string>\n`;
}

function launchAgentPathEnv(bunBin: string, caddyBin: string): string {
  const dirs = [
    dirname(bunBin),
    dirname(caddyBin),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  return [...new Set(dirs)].join(":");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function currentUid(): number | null {
  return typeof process.getuid === "function" ? process.getuid() : null;
}

function launchctlTarget(label = STUDIO_LOCAL_SERVICE_LABEL): string | null {
  const uid = currentUid();
  return uid === null ? null : `gui/${uid}/${label}`;
}

function launchctlDomain(): string | null {
  const uid = currentUid();
  return uid === null ? null : `gui/${uid}`;
}

function edgePortsForScheme(scheme: StudioLocalEdgeScheme): number[] {
  if (scheme === "both") return [80, 443];
  return scheme === "https" ? [443] : [80];
}

function resolveStudioLocalCliPath(): string {
  return fileURLToPath(new URL("./cli.ts", import.meta.url));
}

function resolveBunBin(options: Pick<EnsureStudioLocalOptions, "bunBin" | "env">): string {
  return options.bunBin ?? options.env?.STUDIO_LOCAL_BUN_BIN ?? process.execPath;
}

async function defaultRunCommand(
  command: string,
  args: string[],
  options: StudioLocalRunCommandOptions = {},
): Promise<StudioLocalCommandResult> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      resolve({ code: null, stdout, stderr, error });
    });
    child.once("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutablePath(
  executable: string,
  runCommand: StudioLocalRunCommand,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (executable.includes("/")) {
    return (await pathExists(executable)) ? executable : null;
  }
  const result = await runCommand("/bin/sh", [
    "-lc",
    `command -v ${shellQuote(executable)}`,
  ], { env });
  if (result.code !== 0) return null;
  return result.stdout.trim().split(/\r?\n/)[0] || null;
}

export async function ensureStudioLocalCaddy(
  options: Pick<
    EnsureStudioLocalOptions,
    "caddyBin" | "env" | "installDependencies" | "platform" | "runCommand"
  > = {},
): Promise<StudioLocalDependencyReport> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const caddyBin = options.caddyBin ?? env.STUDIO_LOCAL_CADDY_BIN ?? "caddy";
  const existing = await resolveExecutablePath(caddyBin, runCommand, env);
  if (existing) {
    return {
      status: "ready",
      caddyBin,
      caddyPath: existing,
      detail: "Caddy is available for the Studio local edge.",
    };
  }

  if (options.installDependencies === false || platform !== "darwin") {
    return {
      status: "missing",
      caddyBin,
      caddyPath: null,
      detail: "Caddy is not installed. Install Caddy or set STUDIO_LOCAL_CADDY_BIN.",
    };
  }

  const brew = await resolveExecutablePath("brew", runCommand, env);
  if (!brew) {
    return {
      status: "missing",
      caddyBin,
      caddyPath: null,
      detail: "Homebrew is not installed, so Studio could not install Caddy automatically.",
      installCommand: "brew install caddy",
    };
  }

  const install = await runCommand(brew, ["install", "caddy"], { env });
  if (install.code !== 0) {
    return {
      status: "missing",
      caddyBin,
      caddyPath: null,
      detail: install.stderr.trim() || "brew install caddy failed.",
      installCommand: "brew install caddy",
    };
  }

  const installed = await resolveExecutablePath(caddyBin, runCommand, env);
  return {
    status: installed ? "installed" : "missing",
    caddyBin,
    caddyPath: installed,
    detail: installed
      ? "Installed Caddy with Homebrew."
      : "Homebrew completed, but Caddy was not found on PATH.",
    installCommand: "brew install caddy",
  };
}

export function renderStudioLocalLaunchAgent(
  config: StudioLocalLaunchAgentConfig,
): string {
  const label = config.label ?? STUDIO_LOCAL_SERVICE_LABEL;
  const port = String(config.supervisorPort ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT);
  const scheme = config.scheme ?? "http";
  const args = [
    config.bunBin,
    config.cliPath,
    "edge",
    "--port",
    port,
    "--scheme",
    scheme,
    "--caddy-bin",
    config.caddyBin,
  ];
  const stdout = join(config.paths.logsDir, "edge.stdout.log");
  const stderr = join(config.paths.logsDir, "edge.stderr.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${escapeXml(label)}</string>
\t<key>ProgramArguments</key>
\t<array>
${args.map(plistString).join("")}\t</array>
\t<key>EnvironmentVariables</key>
\t<dict>
\t\t<key>PATH</key>
\t\t<string>${escapeXml(launchAgentPathEnv(config.bunBin, config.caddyBin))}</string>
\t\t<key>STUDIO_LOCAL_SUPPORT_DIR</key>
\t\t<string>${escapeXml(config.paths.supportDir)}</string>
\t</dict>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<true/>
\t<key>StandardOutPath</key>
\t<string>${escapeXml(stdout)}</string>
\t<key>StandardErrorPath</key>
\t<string>${escapeXml(stderr)}</string>
</dict>
</plist>
`;
}

async function writeFileIfChanged(path: string, content: string): Promise<boolean> {
  let existing: string | null = null;
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  if (existing === content) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

async function launchAgentLoaded(
  label: string,
  runCommand: StudioLocalRunCommand,
  env: NodeJS.ProcessEnv,
): Promise<boolean | null> {
  const target = launchctlTarget(label);
  if (!target) return null;
  const result = await runCommand("launchctl", ["print", target], { env });
  return result.code === 0;
}

async function isTcpPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (listening: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function installStudioLocalService(
  options: EnsureStudioLocalOptions & {
    caddyPath: string;
  },
): Promise<StudioLocalServiceReport> {
  const paths = options.paths ?? resolveStudioSupportPaths();
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const startService = options.startService !== false;
  await Promise.all([
    mkdir(paths.supportDir, { recursive: true }),
    mkdir(paths.runtimeDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.localEdgeDir, { recursive: true }),
  ]);

  if (platform !== "darwin") {
    return {
      label: STUDIO_LOCAL_SERVICE_LABEL,
      launchAgentPath: null,
      installed: false,
      changed: false,
      started: false,
      loaded: null,
      detail: "LaunchAgent installation is only available on macOS.",
    };
  }

  const launchAgentPath = join(
    env.HOME ?? homedir(),
    "Library",
    "LaunchAgents",
    `${STUDIO_LOCAL_SERVICE_LABEL}.plist`,
  );
  const plist = renderStudioLocalLaunchAgent({
    bunBin: resolveBunBin(options),
    cliPath: options.cliPath ?? resolveStudioLocalCliPath(),
    paths,
    supervisorPort: options.supervisorPort,
    scheme: options.scheme,
    caddyBin: options.caddyPath,
  });
  const changed = await writeFileIfChanged(launchAgentPath, plist);
  let loaded = await launchAgentLoaded(STUDIO_LOCAL_SERVICE_LABEL, runCommand, env);
  let started = false;

  if (startService) {
    const domain = launchctlDomain();
    const target = launchctlTarget();
    if (!domain || !target) {
      throw new Error("Unable to resolve launchctl user domain.");
    }
    if (loaded && changed) {
      await runCommand("launchctl", ["bootout", target], { env });
      loaded = false;
    }
    if (!loaded) {
      const busyPorts: number[] = [];
      for (const port of edgePortsForScheme(options.scheme ?? "http")) {
        if (await isTcpPortListening(port)) {
          busyPorts.push(port);
        }
      }
      if (busyPorts.length > 0) {
        return {
          label: STUDIO_LOCAL_SERVICE_LABEL,
          launchAgentPath,
          installed: true,
          changed,
          started: false,
          loaded,
          detail: `Studio local LaunchAgent is installed but not started because port ${busyPorts.join(", ")} is already in use.`,
        };
      }
    }
    if (!loaded) {
      const bootstrap = await runCommand("launchctl", [
        "bootstrap",
        domain,
        launchAgentPath,
      ], { env });
      if (bootstrap.code !== 0 && !/already|exists/i.test(bootstrap.stderr)) {
        throw new Error(bootstrap.stderr.trim() || "launchctl bootstrap failed.");
      }
      loaded = true;
    }
    const kickstart = await runCommand("launchctl", ["kickstart", "-k", target], { env });
    if (kickstart.code !== 0) {
      throw new Error(kickstart.stderr.trim() || "launchctl kickstart failed.");
    }
    started = true;
  }

  return {
    label: STUDIO_LOCAL_SERVICE_LABEL,
    launchAgentPath,
    installed: true,
    changed,
    started,
    loaded,
    detail: startService
      ? "Studio local LaunchAgent is installed and started."
      : "Studio local LaunchAgent is installed.",
  };
}

export async function ensureStudioLocalForProject(
  options: EnsureStudioLocalOptions = {},
): Promise<EnsureStudioLocalReport> {
  const paths = options.paths ?? resolveStudioSupportPaths();
  let registered: EnabledStudio | undefined;
  if (options.repo) {
    registered = await registerStudio({ repo: options.repo, paths });
  }

  const registry = await readStudioMachineRegistry(paths);
  const supervisorPort =
    options.supervisorPort ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT;
  const scheme = options.scheme ?? "http";
  const caddy = await ensureStudioLocalCaddy(options);
  if (!caddy.caddyPath) {
    throw new Error(caddy.detail);
  }
  await writeStudioLocalCaddyfile(paths, {
    ...registryToCaddyfileConfig(registry, supervisorPort),
    scheme,
  });
  const service = await installStudioLocalService({
    ...options,
    paths,
    supervisorPort,
    scheme,
    caddyPath: caddy.caddyPath,
  });

  return {
    paths,
    registered,
    caddy,
    service,
    caddyfilePath: paths.caddyfilePath,
  };
}
