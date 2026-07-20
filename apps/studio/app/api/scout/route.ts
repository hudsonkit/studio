import { inspectStudioScoutConnection } from "studio/scout/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await inspectStudioScoutConnection(process.cwd()));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
