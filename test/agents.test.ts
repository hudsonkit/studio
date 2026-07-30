import { describe, expect, test } from "bun:test";

import {
  annotationPassToCapabilityRequest,
  ANNOTATIONS_DISPATCH_OPERATION,
  createAgentRegistry,
  receiptToCapabilityResult,
} from "../src/agents";
import type { StudioAgentTarget } from "../src/agents";
import { parseStudioProjectManifest } from "../src/local/manifest";
import type { SendPassPayload } from "../src/doc";
import type { StudioScoutReceipt } from "../src/scout";

const targets: StudioAgentTarget[] = [
  { agent: "studio", label: "Studio agent" },
  { agent: "atelier", label: "Atelier agent", intent: "request" },
];

describe("agent registry", () => {
  test("defaults to the first registered target", () => {
    const registry = createAgentRegistry({ agents: targets });

    expect(registry.default()?.agent).toBe("studio");
    expect(registry.resolve(undefined)?.agent).toBe("studio");
    expect(registry.all().map((target) => target.agent)).toEqual([
      "studio",
      "atelier",
    ]);
  });

  test("honors an explicit default target", () => {
    const registry = createAgentRegistry({
      agents: targets,
      defaultTarget: "atelier",
    });

    expect(registry.default()?.agent).toBe("atelier");
    expect(registry.resolve(undefined)?.agent).toBe("atelier");
  });

  test("resolves selectors loosely and rejects unknown ones", () => {
    const registry = createAgentRegistry({ agents: targets });

    expect(registry.get("@Atelier")?.label).toBe("Atelier agent");
    expect(registry.resolve("atelier")?.intent).toBe("request");
    expect(registry.get("nobody")).toBeUndefined();
    expect(registry.resolve("nobody")).toBeUndefined();
  });

  test("throws when the default target is not registered", () => {
    const registry = createAgentRegistry({
      agents: targets,
      defaultTarget: "nobody",
    });

    expect(() => registry.default()).toThrow("not registered");
  });
});

describe("manifest agents list", () => {
  test("parses a valid agents array", () => {
    const manifest = parseStudioProjectManifest({
      version: 1,
      id: "studio",
      agents: [
        { agent: "studio", label: "Studio agent", blurb: "Design system work." },
        { agent: "atelier", intent: "request" },
      ],
    });

    expect(manifest.agents).toEqual([
      {
        agent: "studio",
        label: "Studio agent",
        intent: undefined,
        blurb: "Design system work.",
      },
      { agent: "atelier", label: undefined, intent: "request", blurb: undefined },
    ]);
  });

  test("requires an agent selector per entry", () => {
    expect(() =>
      parseStudioProjectManifest({ id: "studio", agents: [{ label: "No agent" }] }),
    ).toThrow("agents[0].agent is required.");

    expect(() =>
      parseStudioProjectManifest({ id: "studio", agents: [{ agent: "  " }] }),
    ).toThrow("agents[0].agent is required.");
  });

  test("rejects an unknown intent", () => {
    expect(() =>
      parseStudioProjectManifest({
        id: "studio",
        agents: [{ agent: "studio", intent: "yell" }],
      }),
    ).toThrow('agents[0].intent must be "message" or "request".');
  });

  test("leaves agents undefined when absent, so callers fall back to scout identity", () => {
    const manifest = parseStudioProjectManifest({
      id: "studio",
      scout: {
        webBaseUrl: "http://127.0.0.1:43120",
        identity: { agent: "studio" },
      },
    });

    expect(manifest.agents).toBeUndefined();
    const registry = createAgentRegistry({
      agents: manifest.agents?.length
        ? manifest.agents
        : [{ agent: manifest.scout!.identity.agent }],
    });
    expect(registry.default()?.agent).toBe("studio");
  });
});

describe("dispatch mapping", () => {
  const pass: SendPassPayload = {
    docTitle: "Foundations",
    slug: "foundations/scout",
    annotations: [],
    formatted: "pass payload",
    target: "atelier",
  };

  test("shapes an annotation pass as a HUD-011 capability request", () => {
    const request = annotationPassToCapabilityRequest(pass, {
      agent: "atelier",
      intent: "request",
    });

    expect(request).toEqual({
      appId: "studio",
      operation: ANNOTATIONS_DISPATCH_OPERATION,
      params: {
        target: "atelier",
        intent: "request",
        docTitle: "Foundations",
        slug: "foundations/scout",
        annotations: [],
        formatted: "pass payload",
      },
      source: "studio-ui",
    });
  });

  test("defaults the dispatch intent to message", () => {
    const request = annotationPassToCapabilityRequest(pass, { agent: "studio" });

    expect(request.params?.intent).toBe("message");
  });

  test("folds a Scout receipt into a capability result", () => {
    const receipt: StudioScoutReceipt = {
      ok: true,
      intent: "message",
      agentId: "studio.main.local",
      targetAgentId: "atelier.main.local",
      conversationId: "c.1",
      messageId: "msg-1",
      flightId: null,
      webBaseUrl: "http://127.0.0.1:43120",
    };

    expect(receiptToCapabilityResult(receipt)).toEqual({
      ok: true,
      summary: "Delivered to atelier.main.local via Scout (message).",
      data: {
        agentId: "studio.main.local",
        targetAgentId: "atelier.main.local",
        conversationId: "c.1",
        messageId: "msg-1",
        flightId: null,
      },
    });
  });
});
