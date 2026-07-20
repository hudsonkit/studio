/** Sticky open-file state per MCP session. */

export type SessionState = {
  sessionId: string;
  openFileId: string | null;
  createdAt: number;
};

const sessions = new Map<string, SessionState>();

export function getOrCreateSession(sessionId: string): SessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { sessionId, openFileId: null, createdAt: Date.now() };
    sessions.set(sessionId, s);
  }
  return s;
}

export function setOpenFile(sessionId: string, fileId: string | null): void {
  const s = getOrCreateSession(sessionId);
  s.openFileId = fileId;
}

export function getOpenFileId(sessionId: string): string | null {
  return sessions.get(sessionId)?.openFileId ?? null;
}
