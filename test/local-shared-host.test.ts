import { describe, expect, test } from "bun:test";

import { sharedHostRoutesForStudios } from "../src/local/shared-host";
import type { ResolvedStudio } from "../src/local";

function studio(overrides: Partial<ResolvedStudio> = {}): ResolvedStudio {
  return {
    id: "studio",
    label: "Studio",
    repo: "/Users/arach/dev/studio",
    manifestPath: "/Users/arach/dev/studio/.studio/project.json",
    studioDir: "/Users/arach/dev/studio/apps/studio",
    command: "bun dev",
    healthPath: "/studio",
    rootPath: "/studio",
    host: "studio.studio.local",
    port: 5191,
    enabled: true,
    env: {},
    previews: [
      {
        id: "action",
        label: "Action",
        host: "action.studio.local",
        links: [{ label: "Controller", path: "/renders/act-controller" }],
      },
    ],
    ...overrides,
  };
}

describe("shared Studio host routes", () => {
  test("routes a preview hostname to its owning Studio process", () => {
    expect(sharedHostRoutesForStudios([studio()])).toEqual([
      {
        id: "studio",
        host: "studio.studio.local",
        repo: "/Users/arach/dev/studio",
        studioDir: "/Users/arach/dev/studio/apps/studio",
        port: 5191,
      },
      {
        id: "action",
        host: "action.studio.local",
        repo: "/Users/arach/dev/studio",
        studioDir: "/Users/arach/dev/studio/apps/studio",
        port: 5191,
      },
    ]);
  });

  test("rejects an alias that does not match its declared preview id", () => {
    const invalid = studio({
      previews: [{
        id: "action",
        label: "Action",
        host: "studio.studio.local",
        links: [{ label: "Controller", path: "/renders/act-controller" }],
      }],
    });
    expect(() => sharedHostRoutesForStudios([invalid])).toThrow(
      "action to use action.studio.local",
    );
  });
});
