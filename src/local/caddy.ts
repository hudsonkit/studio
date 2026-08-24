import { mkdir, writeFile } from "node:fs/promises";

import type { StudioSupportPaths } from "./paths";
import type { ResolvedStudio, StudioMachineRegistry } from "./types";
import {
  STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT,
  STUDIO_LOCAL_PORTAL_HOST,
  studioLocalApiPaths,
} from "./urls";

export type StudioLocalEdgeScheme = "http" | "https" | "both";

export interface StudioLocalCaddyfileConfig {
  supervisorPort?: number;
  portalHost?: string;
  scheme?: StudioLocalEdgeScheme;
  studios: ReadonlyArray<Pick<ResolvedStudio, "id" | "host" | "port" | "enabled">>;
  previews?: ReadonlyArray<Pick<ResolvedStudio, "id" | "port" | "enabled"> & { host: string }>;
}

function formatCaddyHost(host: string): string {
  if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) {
    return `[${host}]`;
  }
  return host;
}

function schemesFor(value: StudioLocalEdgeScheme): ReadonlyArray<"http" | "https"> {
  return value === "both" ? ["http", "https"] : [value];
}

function caddySiteLabel(host: string, scheme: "http" | "https"): string {
  const formatted = formatCaddyHost(host);
  return scheme === "http" ? `http://${formatted}` : formatted;
}

function renderProxyBlock(input: {
  id: string;
  host: string;
  port: number;
  supervisorPort: number;
  scheme: "http" | "https";
}): string {
  const supervisor = `127.0.0.1:${input.supervisorPort}`;
  return `${caddySiteLabel(input.host, input.scheme)} {\n`
    + (input.scheme === "https" ? "\ttls internal\n" : "")
    + `\thandle ${studioLocalApiPaths.hostStart} {\n`
    + `\t\trewrite * ${studioLocalApiPaths.startStudio(input.id)}\n`
    + `\t\treverse_proxy ${supervisor}\n`
    + "\t}\n"
    + `\thandle ${studioLocalApiPaths.hostStatus} {\n`
    + `\t\trewrite * ${studioLocalApiPaths.studio(input.id)}\n`
    + `\t\treverse_proxy ${supervisor}\n`
    + "\t}\n"
    + "\thandle {\n"
    + `\t\treverse_proxy 127.0.0.1:${input.port} {\n`
    + "\t\t\tlb_try_duration 1s\n"
    + "\t\t\tlb_try_interval 250ms\n"
    + "\t\t}\n"
    + "\t}\n"
    + "\thandle_errors {\n"
    + `\t\trewrite * ${studioLocalApiPaths.fallback(input.id)}\n`
    + `\t\treverse_proxy ${supervisor}\n`
    + "\t}\n"
    + "}";
}

function renderPortalBlock(input: {
  portalHost: string;
  supervisorPort: number;
  scheme: "http" | "https";
}): string {
  return `${caddySiteLabel(input.portalHost, input.scheme)} {\n`
    + (input.scheme === "https" ? "\ttls internal\n" : "")
    + `\treverse_proxy 127.0.0.1:${input.supervisorPort}\n`
    + "}";
}

export function renderStudioLocalCaddyfile(
  config: StudioLocalCaddyfileConfig,
): string {
  const supervisorPort =
    config.supervisorPort ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT;
  const portalHost = config.portalHost ?? STUDIO_LOCAL_PORTAL_HOST;
  const schemes = schemesFor(config.scheme ?? "http");
  const enabledStudios = config.studios.filter((studio) => studio.enabled);
  const enabledPreviews = (config.previews ?? []).filter((preview) => preview.enabled);
  const blocks = schemes.flatMap((scheme) => [
    renderPortalBlock({ portalHost, supervisorPort, scheme }),
    ...enabledStudios.map((studio) =>
      renderProxyBlock({
        id: studio.id,
        host: studio.host,
        port: studio.port,
        supervisorPort,
        scheme,
      }),
    ),
    ...enabledPreviews.map((preview) =>
      renderProxyBlock({
        id: preview.id,
        host: preview.host,
        port: preview.port,
        supervisorPort,
        scheme,
      }),
    ),
  ]);
  return `${blocks.join("\n\n")}\n`;
}

export function previewRoutesForStudios(
  studios: ReadonlyArray<ResolvedStudio>,
): NonNullable<StudioLocalCaddyfileConfig["previews"]> {
  return studios.flatMap((studio) =>
    studio.previews.map((preview) => ({
      id: studio.id,
      host: preview.host,
      port: studio.port,
      enabled: studio.enabled,
    })),
  );
}

export function registryToCaddyfileConfig(
  registry: StudioMachineRegistry,
  supervisorPort = STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT,
): StudioLocalCaddyfileConfig {
  return {
    supervisorPort,
    studios: registry.studios.map((studio) => ({
      id: studio.id,
      host: studio.host,
      port: studio.port,
      enabled: studio.enabled,
    })),
  };
}

export async function writeStudioLocalCaddyfile(
  paths: StudioSupportPaths,
  config: StudioLocalCaddyfileConfig,
): Promise<string> {
  await mkdir(paths.localEdgeDir, { recursive: true });
  const caddyfile = renderStudioLocalCaddyfile(config);
  await writeFile(paths.caddyfilePath, caddyfile, "utf8");
  return paths.caddyfilePath;
}
