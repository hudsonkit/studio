#!/usr/bin/env bun
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import {
  previewRoutesForStudios,
  registryToCaddyfileConfig,
  renderStudioLocalCaddyfile,
  writeStudioLocalCaddyfile,
  type StudioLocalEdgeScheme,
} from "./caddy";
import {
  discoverStudioProjects,
  listResolvedStudios,
  readStudioMachineRegistry,
  registerStudio,
  setStudioEnabled,
} from "./registry";
import {
  writeStudioProjectManifest,
  type CreateProjectManifestOptions,
} from "./manifest";
import { ensureStudioLocalForProject } from "./installer";
import { resolveStudioSupportPaths } from "./paths";
import { startStudioLocalServer } from "./server";
import { registerWithSharedStudioHost } from "./shared-host";
import {
  STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT,
  STUDIO_LOCAL_PORTAL_HOST,
} from "./urls";

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, true);
    }
  }
  return { positionals, flags };
}

function flagString(flags: Map<string, string | boolean>, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function flagNumber(flags: Map<string, string | boolean>, key: string): number | undefined {
  const value = flagString(flags, key);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${key} must be a number.`);
  }
  return parsed;
}

function flagBoolean(flags: Map<string, string | boolean>, key: string): boolean {
  return flags.get(key) === true;
}

function flagScheme(flags: Map<string, string | boolean>): StudioLocalEdgeScheme {
  const value = flagString(flags, "scheme") ?? "http";
  if (value === "http" || value === "https" || value === "both") {
    return value;
  }
  throw new Error("--scheme must be http, https, or both.");
}

function usage(): string {
  return `Usage: bun run local <command> [options]

Commands:
  init [repo]                 Write .studio/project.json for a repo.
  ensure [repo]               Install/update the shared local edge, then register this repo.
  install                     Install/update the shared local edge without registering a repo.
  enable [repo]               Enable a repo's .studio/project.json on this machine.
  disable <id>                Disable a registered studio.
  scan [root]                 Find project manifests under a root.
  list                        List enabled machine registry entries.
  caddyfile [--write]         Print or write the generated Caddyfile.
  serve [--port 43180]        Run the Studio local supervisor.
  edge [--port 43180]         Run supervisor and Caddy together.

Options:
  --id ID                     Studio id.
  --label LABEL               Human label for init.
  --studio-dir DIR            Studio app directory relative to repo.
  --start COMMAND             Start command. {port}, {host}, and {id} are replaced.
  --health-path PATH          Probe path used to decide whether the studio is running.
  --root-path PATH            Browser path opened for this studio.
  --host HOST                 Stable local host, default <id>.studio.local.
  --port PORT                 Registry port or supervisor port, depending on command.
  --preferred-port PORT       Preferred app port for init.
  --scheme http|https|both    Caddy scheme, default http.
  --caddy-bin PATH            Caddy executable for edge, default caddy.
  --no-start                  With ensure, install without starting the LaunchAgent.
  --no-install-deps           With ensure, report missing dependencies instead of installing.
  --enable                    With scan, register discovered projects.
`;
}

function createManifestOptions(
  flags: Map<string, string | boolean>,
): CreateProjectManifestOptions {
  const id = flagString(flags, "id");
  if (!id) {
    throw new Error("init requires --id.");
  }
  return {
    id,
    label: flagString(flags, "label"),
    studioDir: flagString(flags, "studio-dir"),
    start: flagString(flags, "start"),
    healthPath: flagString(flags, "health-path"),
    rootPath: flagString(flags, "root-path"),
    host: flagString(flags, "host"),
    preferredPort: flagNumber(flags, "preferred-port"),
  };
}

async function commandInit(args: ParsedArgs): Promise<void> {
  const repo = resolve(args.positionals[0] ?? process.cwd());
  const manifest = await writeStudioProjectManifest(repo, createManifestOptions(args.flags));
  console.log(`wrote ${repo}/.studio/project.json`);
  console.log(`${manifest.id} -> ${manifest.host ?? "<id>.studio.local"}`);
}

async function commandEnable(args: ParsedArgs): Promise<void> {
  const repo = resolve(args.positionals[0] ?? process.cwd());
  const entry = await registerStudio({
    repo,
    id: flagString(args.flags, "id"),
    host: flagString(args.flags, "host"),
    port: flagNumber(args.flags, "port"),
  });
  console.log(`enabled ${entry.id}`);
  console.log(`host: http://${entry.host}`);
  console.log(`port: ${entry.port}`);
}

async function commandEnsure(args: ParsedArgs): Promise<void> {
  const repo = resolve(args.positionals[0] ?? process.cwd());
  const report = await ensureStudioLocalForProject({
    repo,
    supervisorPort: flagNumber(args.flags, "port"),
    scheme: flagScheme(args.flags),
    caddyBin: flagString(args.flags, "caddy-bin"),
    startService: !flagBoolean(args.flags, "no-start"),
    installDependencies: !flagBoolean(args.flags, "no-install-deps"),
  });
  if (report.registered) {
    console.log(`registered ${report.registered.id}`);
    console.log(`host: http://${report.registered.host}`);
    console.log(`port: ${report.registered.port}`);
  }
  console.log(`caddy: ${report.caddy.status} (${report.caddy.caddyPath})`);
  console.log(`caddyfile: ${report.caddyfilePath}`);
  if (report.service.launchAgentPath) {
    console.log(`launch agent: ${report.service.launchAgentPath}`);
  }
  console.log(`service: ${report.service.detail}`);
}

async function commandInstall(args: ParsedArgs): Promise<void> {
  const report = await ensureStudioLocalForProject({
    supervisorPort: flagNumber(args.flags, "port"),
    scheme: flagScheme(args.flags),
    caddyBin: flagString(args.flags, "caddy-bin"),
    startService: !flagBoolean(args.flags, "no-start"),
    installDependencies: !flagBoolean(args.flags, "no-install-deps"),
  });
  console.log(`caddy: ${report.caddy.status} (${report.caddy.caddyPath})`);
  console.log(`caddyfile: ${report.caddyfilePath}`);
  if (report.service.launchAgentPath) {
    console.log(`launch agent: ${report.service.launchAgentPath}`);
  }
  console.log(`service: ${report.service.detail}`);
}

async function commandDisable(args: ParsedArgs): Promise<void> {
  const id = args.positionals[0];
  if (!id) throw new Error("disable requires a studio id.");
  const entry = await setStudioEnabled(id, false);
  console.log(`disabled ${entry.id}`);
}

async function commandScan(args: ParsedArgs): Promise<void> {
  const root = resolve(args.positionals[0] ?? process.cwd());
  const projects = await discoverStudioProjects({ root });
  if (projects.length === 0) {
    console.log("no studio manifests found");
    return;
  }
  for (const project of projects) {
    console.log(project.repo);
    if (flagBoolean(args.flags, "enable")) {
      const entry = await registerStudio({ repo: project.repo });
      console.log(`  enabled ${entry.id} -> http://${entry.host}`);
    }
  }
}

async function commandList(): Promise<void> {
  const studios = await listResolvedStudios();
  if (studios.length === 0) {
    console.log("no studios enabled");
    return;
  }
  for (const studio of studios) {
    const state = studio.enabled ? "enabled" : "disabled";
    console.log(`${studio.id}\t${state}\thttp://${studio.host}\t:${studio.port}\t${studio.repo}`);
  }
}

async function commandCaddyfile(args: ParsedArgs): Promise<void> {
  const paths = resolveStudioSupportPaths();
  const registry = await readStudioMachineRegistry(paths);
  const studios = await listResolvedStudios(paths);
  const supervisorPort =
    flagNumber(args.flags, "port") ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT;
  const scheme = flagScheme(args.flags);
  const config = {
    ...registryToCaddyfileConfig(registry, supervisorPort),
    previews: previewRoutesForStudios(studios),
    scheme,
  };
  const caddyfile = renderStudioLocalCaddyfile(config);
  if (flagBoolean(args.flags, "write")) {
    const path = await writeStudioLocalCaddyfile(paths, config);
    console.log(`wrote ${path}`);
  } else {
    process.stdout.write(caddyfile);
  }
}

async function commandServe(args: ParsedArgs): Promise<void> {
  const port = flagNumber(args.flags, "port") ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT;
  const server = startStudioLocalServer({ port });
  console.log(`studio local supervisor: http://127.0.0.1:${server.port}`);
  await new Promise<void>((resolvePromise) => {
    const stop = () => {
      server.stop();
      resolvePromise();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function spawnCaddy(input: {
  caddyBin: string;
  caddyfilePath: string;
}): ChildProcess {
  return spawn(input.caddyBin, [
    "run",
    "--config",
    input.caddyfilePath,
    "--adapter",
    "caddyfile",
  ], {
    stdio: "inherit",
  });
}

function schemesFor(value: StudioLocalEdgeScheme): Array<"http" | "https"> {
  return value === "both" ? ["http", "https"] : [value];
}

function spawnMdnsProxy(input: {
  name: string;
  host: string;
  port: number;
  scheme: "http" | "https";
}): ChildProcess | null {
  if (process.platform !== "darwin") return null;
  return spawn("/usr/bin/dns-sd", [
    "-P",
    input.name,
    input.scheme === "https" ? "_https._tcp" : "_http._tcp",
    "local",
    String(input.port),
    input.host,
    "127.0.0.1",
    "path=/",
  ], {
    stdio: "ignore",
  });
}

async function commandEdge(args: ParsedArgs): Promise<void> {
  const paths = resolveStudioSupportPaths();
  const registry = await readStudioMachineRegistry(paths);
  const studios = await listResolvedStudios(paths);
  const port = flagNumber(args.flags, "port") ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT;
  const scheme = flagScheme(args.flags);
  const caddyBin = flagString(args.flags, "caddy-bin") ?? process.env.STUDIO_LOCAL_CADDY_BIN ?? "caddy";
  const config = {
    ...registryToCaddyfileConfig(registry, port),
    previews: previewRoutesForStudios(studios),
    scheme,
  };
  await writeStudioLocalCaddyfile(paths, config);
  const sharedHost = scheme === "http"
    ? await registerWithSharedStudioHost(studios, port)
    : null;
  const server = startStudioLocalServer({ port, paths });
  const caddy = sharedHost
    ? null
    : spawnCaddy({ caddyBin, caddyfilePath: paths.caddyfilePath });
  const mdns = schemesFor(scheme)
    .flatMap((currentScheme) => {
      const edgePort = currentScheme === "https" ? 443 : 80;
      return [
        spawnMdnsProxy({
          name: `Studio Local ${currentScheme.toUpperCase()}`,
          host: STUDIO_LOCAL_PORTAL_HOST,
          port: edgePort,
          scheme: currentScheme,
        }),
        ...(sharedHost ? [] : registry.studios
          .filter((studio) => studio.enabled)
          .map((studio) =>
            spawnMdnsProxy({
              name: `Studio ${studio.id} ${currentScheme.toUpperCase()}`,
              host: studio.host,
              port: edgePort,
              scheme: currentScheme,
            }),
          )),
        ...(sharedHost ? [] : studios
          .filter((studio) => studio.enabled)
          .flatMap((studio) =>
            studio.previews.map((preview) =>
              spawnMdnsProxy({
                name: `Studio ${preview.id} ${currentScheme.toUpperCase()}`,
                host: preview.host,
                port: edgePort,
                scheme: currentScheme,
              }),
            ),
          )),
      ];
    })
    .filter((child): child is ChildProcess => Boolean(child));
  console.log(`studio.local -> supervisor http://127.0.0.1:${server.port}`);
  if (sharedHost) {
    console.log(
      `shared Studio host: ${sharedHost.routes.map((route) => route.host).join(", ")}`,
    );
  } else {
    console.log(`caddyfile: ${paths.caddyfilePath}`);
  }

  await new Promise<void>((resolvePromise, reject) => {
    let stopping = false;
    const cleanup = async () => {
      for (const child of mdns) child.kill("SIGTERM");
      if (caddy?.exitCode === null) caddy.kill("SIGTERM");
      server.stop();
      await sharedHost?.close();
    };
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await cleanup();
      resolvePromise();
    };
    const stopFromSignal = () => void stop().catch(reject);
    process.once("SIGINT", stopFromSignal);
    process.once("SIGTERM", stopFromSignal);
    if (caddy) {
      caddy.once("error", reject);
      caddy.once("exit", (code) => {
        if (stopping) return;
        stopping = true;
        void cleanup().then(() => {
          if (code === 0 || code === null) resolvePromise();
          else reject(new Error(`caddy exited with code ${code}`));
        }, reject);
      });
    }
  });
}

export async function runStudioLocalCli(argv = process.argv.slice(2)): Promise<void> {
  const [command = "help", ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case "init":
      await commandInit(args);
      break;
    case "ensure":
      await commandEnsure(args);
      break;
    case "install":
      await commandInstall(args);
      break;
    case "enable":
      await commandEnable(args);
      break;
    case "disable":
      await commandDisable(args);
      break;
    case "scan":
      await commandScan(args);
      break;
    case "list":
      await commandList();
      break;
    case "caddyfile":
      await commandCaddyfile(args);
      break;
    case "serve":
      await commandServe(args);
      break;
    case "edge":
      await commandEdge(args);
      break;
    case "help":
    case "-h":
    case "--help":
      console.log(usage());
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStudioLocalCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
