import { hostApiRequest } from "../../bin/local-host.mjs";

import { defaultHostForStudioId } from "./ids";
import type { ResolvedStudio } from "./types";
import { STUDIO_LOCAL_PORTAL_HOST } from "./urls";

interface SharedHostStatus {
  edge: "direct" | "shared-caddy";
  publicPort: number;
}

interface SharedHostRegistrationResponse {
  leaseId: string;
}

interface SharedHostRoute {
  id: string;
  host: string;
  repo: string;
  studioDir: string;
  port: number;
}

export interface SharedHostRegistration {
  routes: ReadonlyArray<SharedHostRoute>;
  close(): Promise<void>;
}

export function sharedHostRoutesForStudios(
  studios: ReadonlyArray<ResolvedStudio>,
): SharedHostRoute[] {
  const routes = studios
    .filter((studio) => studio.enabled)
    .flatMap((studio) => [
      {
        id: studio.id,
        host: studio.host,
        repo: studio.repo,
        studioDir: studio.studioDir,
        port: studio.port,
      },
      ...studio.previews.map((preview) => ({
        id: preview.id,
        host: preview.host,
        repo: studio.repo,
        studioDir: studio.studioDir,
        port: studio.port,
      })),
    ]);

  const seen = new Set<string>();
  for (const route of routes) {
    if (route.host !== defaultHostForStudioId(route.id)) {
      throw new Error(
        `The shared Studio host requires ${route.id} to use ${defaultHostForStudioId(route.id)}, not ${route.host}.`,
      );
    }
    if (seen.has(route.host)) {
      throw new Error(`Duplicate Studio host route: ${route.host}.`);
    }
    seen.add(route.host);
  }
  return routes;
}

export async function registerWithSharedStudioHost(
  studios: ReadonlyArray<ResolvedStudio>,
  portalPort: number,
): Promise<SharedHostRegistration | null> {
  let status: SharedHostStatus;
  try {
    status = (await hostApiRequest<SharedHostStatus>("/v1/status", {
      timeoutMs: 500,
    })).body;
  } catch {
    return null;
  }
  if (status.edge !== "shared-caddy" || status.publicPort !== 80) {
    return null;
  }

  const routes = [
    {
      id: "studio-local-dashboard",
      host: STUDIO_LOCAL_PORTAL_HOST,
      repo: process.cwd(),
      studioDir: process.cwd(),
      port: portalPort,
    },
    ...sharedHostRoutesForStudios(studios),
  ];
  const registrations: Array<{ id: string; leaseId: string }> = [];
  try {
    for (const route of routes) {
      const response = await hostApiRequest<SharedHostRegistrationResponse>(
        `/v1/registrations/${route.id}`,
        {
          method: "PUT",
          body: {
            hostname: route.host,
            repo: { name: route.id, root: route.repo },
            workingDirectory: route.studioDir,
            upstream: { host: "127.0.0.1", port: route.port },
            process: { pid: process.pid, command: process.argv.join(" ") },
            liveness: { ttlMs: 0 },
            client: { name: "studio-local", pid: process.pid },
          },
        },
      );
      registrations.push({ id: route.id, leaseId: response.body.leaseId });
    }
  } catch (error) {
    await Promise.all(registrations.map((registration) =>
      hostApiRequest(`/v1/registrations/${registration.id}`, {
        method: "DELETE",
        body: { leaseId: registration.leaseId },
        timeoutMs: 500,
      }).catch(() => {}),
    ));
    throw error;
  }

  return {
    routes,
    close: async () => {
      await Promise.all(registrations.map((registration) =>
        hostApiRequest(`/v1/registrations/${registration.id}`, {
          method: "DELETE",
          body: { leaseId: registration.leaseId },
          timeoutMs: 500,
        }).catch(() => {}),
      ));
    },
  };
}
