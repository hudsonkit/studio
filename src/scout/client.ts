import { studioScoutPaths } from "./paths";
import type {
  StudioScoutAgentsResponse,
  StudioScoutConnection,
  StudioScoutMessageInput,
  StudioScoutReceipt,
} from "./types";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: unknown }
    | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `Studio Scout request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export async function loadStudioScoutConnection(): Promise<StudioScoutConnection> {
  return readJson<StudioScoutConnection>(
    await fetch(studioScoutPaths.studioApi.connection, { cache: "no-store" }),
  );
}

export async function loadStudioScoutAgents(): Promise<StudioScoutAgentsResponse> {
  return readJson<StudioScoutAgentsResponse>(
    await fetch(studioScoutPaths.studioApi.agents, { cache: "no-store" }),
  );
}

export async function loadStudioReviewPairing(): Promise<{
  pairedAgent: string | null;
  pairedAt: string | null;
}> {
  return readJson(
    await fetch(studioScoutPaths.studioApi.pairing, { cache: "no-store" }),
  );
}

export async function pairStudioReviewAgent(agent: string): Promise<void> {
  await fetch(studioScoutPaths.studioApi.pairing, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent }),
  });
}

export async function sendStudioScoutMessage(
  input: StudioScoutMessageInput,
): Promise<StudioScoutReceipt> {
  return readJson<StudioScoutReceipt>(
    await fetch(studioScoutPaths.studioApi.messages, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
