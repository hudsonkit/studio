import { describe, expect, test } from "bun:test";

import { resolveStudioInjectionState } from "../src/injection/state";

describe("resolveStudioInjectionState", () => {
  test("stays disabled by default in development", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      href: "http://localhost:5191/workspaces/demo",
      dev: true,
    })).toEqual({ enabled: false, mode: "after" });
  });

  test("enables a study from the generic studio URL param", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      aliases: ["summary"],
      href: "http://localhost:5191/workspaces/demo?studio=summary",
      dev: true,
    })).toEqual({ enabled: true, mode: "after" });
  });

  test("uses URL mode ahead of stored mode", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      href: "http://localhost:5191/workspaces/demo?studio=workspace-summary&studioMode=before",
      storedMode: "after",
      dev: true,
    })).toEqual({ enabled: true, mode: "before" });
  });

  test("restores stored enablement and mode", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      href: "http://localhost:5191/workspaces/demo",
      storedEnabled: "1",
      storedMode: "before",
      dev: true,
    })).toEqual({ enabled: true, mode: "before" });
  });

  test("allows explicit activation in a local built app", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      aliases: ["summary"],
      href: "http://127.0.0.1:5191/workspaces/demo?studio=summary",
      dev: false,
    })).toEqual({ enabled: true, mode: "after" });
  });

  test("allows IPv6 loopback activation in a local built app", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      href: "http://[::1]:5191/workspaces/demo?studio=workspace-summary",
      dev: false,
    })).toEqual({ enabled: true, mode: "after" });
  });

  test("does not leak aliases across studies", () => {
    expect(resolveStudioInjectionState({
      studyId: "other-study",
      href: "http://localhost:5191/workspaces/demo?studio=summary",
      dev: true,
    })).toEqual({ enabled: false, mode: "after" });
  });

  test("never enables on non-local production hosts", () => {
    expect(resolveStudioInjectionState({
      studyId: "workspace-summary",
      href: "https://example.com/workspaces/demo?studio=workspace-summary",
      storedEnabled: "1",
      storedMode: "before",
      dev: false,
    })).toEqual({ enabled: false, mode: "after" });
  });
});
