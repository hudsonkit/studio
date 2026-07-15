import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseStudioProjectManifest } from "../src/local/manifest";
import { studioScoutComposerUrl } from "../src/scout/paths";
import {
  postStudioScoutMessage,
  resolveStudioScoutAgent,
  resolveStudioScoutConfig,
} from "../src/scout/server";
import type { StudioScoutManifestConfig } from "../src/scout/types";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const config: StudioScoutManifestConfig = {
  webBaseUrl: "http://127.0.0.1:43120",
  identity: { agent: "studio", label: "Studio agent" },
};

describe("Studio Scout manifest", () => {
  test("normalizes a portable Scout identity and web origin", () => {
    const manifest = parseStudioProjectManifest({
      version: 1,
      id: "studio",
      scout: {
        webBaseUrl: "http://127.0.0.1:43120/",
        identity: { agent: "@studio", label: "Studio agent" },
      },
    });

    expect(manifest.scout).toEqual({
      webBaseUrl: "http://127.0.0.1:43120",
      identity: { agent: "@studio", label: "Studio agent" },
    });
  });

  test("rejects a deployment origin with an embedded path", () => {
    expect(() =>
      parseStudioProjectManifest({
        id: "studio",
        scout: {
          webBaseUrl: "http://127.0.0.1:43120/api",
          identity: { agent: "studio" },
        },
      }),
    ).toThrow("must be an origin without a path");
  });
});

describe("Studio Scout composer", () => {
  test("builds a native context-capture embed URL", () => {
    const url = studioScoutComposerUrl("http://127.0.0.1:43120", {
      agentId: "studio.main.local",
      context: [{ label: "Page", value: "Package registry" }],
    });

    expect(url.pathname).toBe("/embed/context-capture");
    expect(url.searchParams.get("agent")).toBe("studio.main.local");
    expect(JSON.parse(url.searchParams.get("context") ?? "[]")).toEqual([
      { label: "Page", value: "Package registry" },
    ]);
  });
});

describe("Studio Scout runtime configuration", () => {
  test("allows a worktree preview to override only the Scout web origin", () => {
    expect(resolveStudioScoutConfig(config, {
      STUDIO_SCOUT_WEB_BASE_URL: "http://127.0.0.1:43517/",
    })).toEqual({
      ...config,
      webBaseUrl: "http://127.0.0.1:43517",
    });
  });
});

describe("Studio Scout web transport", () => {
  test("resolves a portable definition id to one exact machine agent", async () => {
    const fetchImpl = async () =>
      Response.json([
        {
          id: "studio.main.arachs-mac-mini-local",
          definitionId: "studio",
          name: "Studio",
          isOnline: true,
        },
      ]);

    await expect(
      resolveStudioScoutAgent(config, fetchImpl as typeof fetch),
    ).resolves.toEqual({
      id: "studio.main.arachs-mac-mini-local",
      definitionId: "studio",
      name: "Studio",
      handle: undefined,
      online: true,
    });
  });

  test("opens a direct conversation and sends Studio context through Scout web", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-scout-test-"));
    temporaryRoots.push(root);
    await mkdir(join(root, ".studio"), { recursive: true });
    await writeFile(
      join(root, ".studio", "project.json"),
      `${JSON.stringify({ version: 1, id: "studio", label: "Studio", scout: config })}\n`,
    );

    const calls: Array<{ path: string; body: Record<string, unknown> | null }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      calls.push({ path: url.pathname, body });
      if (url.pathname === "/api/agents") {
        return Response.json([
          {
            id: "studio.main.arachs-mac-mini-local",
            definitionId: "studio",
            name: "Studio",
            isOnline: true,
          },
        ]);
      }
      if (url.pathname === "/api/conversations/direct") {
        return Response.json({ conversationId: "c.studio" });
      }
      if (url.pathname === "/api/send") {
        return Response.json({ messageId: "msg-1" });
      }
      return Response.json({ error: "unexpected path" }, { status: 404 });
    };

    const receipt = await postStudioScoutMessage(
      {
        body: "Review the current direction.",
        context: {
          title: "Scout connection",
          url: "http://studio.studio.local/studio/foundations/scout",
        },
      },
      root,
      fetchImpl as typeof fetch,
    );

    expect(receipt).toMatchObject({
      ok: true,
      intent: "message",
      agentId: "studio.main.arachs-mac-mini-local",
      conversationId: "c.studio",
      messageId: "msg-1",
    });
    expect(calls.map((call) => call.path)).toEqual([
      "/api/agents",
      "/api/conversations/direct",
      "/api/send",
    ]);
    expect(calls[2]?.body).toMatchObject({
      conversationId: "c.studio",
      intent: "tell",
    });
    expect(String(calls[2]?.body?.body)).toContain("Studio: Studio");
    expect(String(calls[2]?.body?.body)).toContain("Surface: Scout connection");
  });
});
