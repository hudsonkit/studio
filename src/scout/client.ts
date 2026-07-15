import { studioScoutPaths } from "./paths";
import type {
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
