import {
  loadStudioAgentRegistry,
  readStudioReviewPairing,
  writeStudioReviewPairing,
} from "studio/scout/server";

export const dynamic = "force-dynamic";

/** The review session's paired Scout agent — persisted per project. */
export async function GET() {
  return Response.json(await readStudioReviewPairing(process.cwd()));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { agent?: string }
    | null;
  const agent = body?.agent?.trim();
  if (!agent) {
    return Response.json({ error: "agent is required." }, { status: 400 });
  }
  try {
    const registry = await loadStudioAgentRegistry(process.cwd());
    if (!registry.get(agent)) {
      return Response.json(
        { error: `Agent ${agent} is not registered.` },
        { status: 400 },
      );
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
  return Response.json(await writeStudioReviewPairing(agent, process.cwd()));
}
