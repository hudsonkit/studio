import { defaultHostForStudioId, normalizeStudioHost } from "./ids";

export const STUDIO_LOCAL_PORTAL_HOST = "studio.local";
export const STUDIO_LOCAL_HOST_SUFFIX = ".studio.local";
export const STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT = 43180;
export const STUDIO_LOCAL_DEFAULT_PORT_START = 5200;
export const STUDIO_LOCAL_CONTROL_PREFIX = "/__studio";

export const studioLocalApiPaths = {
  health: "/health",
  studios: "/api/studios",
  caddyfile: "/api/caddyfile",
  studio: (id: string) => `/api/studios/${encodeURIComponent(id)}`,
  startStudio: (id: string) => `/api/studios/${encodeURIComponent(id)}/start`,
  stopStudio: (id: string) => `/api/studios/${encodeURIComponent(id)}/stop`,
  fallback: (id: string) =>
    `${STUDIO_LOCAL_CONTROL_PREFIX}/fallback/${encodeURIComponent(id)}`,
  hostStart: `${STUDIO_LOCAL_CONTROL_PREFIX}/start`,
  hostStatus: `${STUDIO_LOCAL_CONTROL_PREFIX}/status`,
} as const;

export function loopbackOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function studioAppOrigin(port: number): string {
  return loopbackOrigin(port);
}

export function studioPortalHost(host?: string): string {
  return normalizeStudioHost(host ?? STUDIO_LOCAL_PORTAL_HOST);
}

export function studioHostForId(id: string, host?: string): string {
  return normalizeStudioHost(host ?? defaultHostForStudioId(id));
}

export function urlForLocalPath(origin: string, pathname: string): URL {
  return new URL(pathname, origin);
}
