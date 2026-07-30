import {
  loadStudioAgentRegistry,
  resolveStudioScoutAgent,
  resolveStudioScoutConfig,
} from "studio/scout/server";
import { findStudioProjectRoot, readStudioProjectManifest } from "studio/local";
import type { StudioScoutAgentOption, StudioScoutAgentsResponse } from "studio/scout";

export const dynamic = "force-dynamic";

/**
 * The registered dispatch targets, each resolved against Scout's
 * `/api/agents`. Scout being down or a selector not resolving never fails
 * the route — the target comes back with `online: null, agent: null` and the
 * UI renders it as offline.
 */
export async function GET() {
  try {
    const repo = await findStudioProjectRoot(process.cwd());
    const manifest = await readStudioProjectManifest(repo);
    if (!manifest.scout) {
      return Response.json({ ok: true, agents: [] } satisfies StudioScoutAgentsResponse);
    }
    const config = resolveStudioScoutConfig(manifest.scout);
    const registry = await loadStudioAgentRegistry(process.cwd());
    const agents = await Promise.all(
      registry.all().map(async (target): Promise<StudioScoutAgentOption> => {
        const base = {
          selector: target.agent,
          label: target.label ?? target.agent,
          intent: target.intent ?? ("message" as const),
          blurb: target.blurb,
        };
        try {
          const agent = await resolveStudioScoutAgent(config, fetch, target.agent);
          return { ...base, online: agent.online, agent };
        } catch {
          return { ...base, online: null, agent: null };
        }
      }),
    );
    return Response.json({ ok: true, agents } satisfies StudioScoutAgentsResponse);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
