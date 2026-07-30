import { loadStudioAgentRegistry, postStudioScoutMessage } from "studio/scout/server";
import type { StudioScoutMessageInput } from "studio/scout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as
    | StudioScoutMessageInput
    | null;
  if (!input?.body?.trim()) {
    return Response.json({ error: "Message body is required." }, { status: 400 });
  }

  if (input.target) {
    const selector = input.target.agent?.trim();
    if (!selector) {
      return Response.json({ error: "target.agent is required." }, { status: 400 });
    }
    try {
      const registry = await loadStudioAgentRegistry(process.cwd());
      if (!registry.get(selector)) {
        return Response.json(
          { error: `Agent target ${selector} is not registered.` },
          { status: 400 },
        );
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  try {
    return Response.json(await postStudioScoutMessage(input, process.cwd()));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
