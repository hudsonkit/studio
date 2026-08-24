import { describe, expect, test } from "bun:test";
import {
  formatLocalUrl,
  hostnameForRepo,
  inferPortFromCommand,
  normalizeRepoName,
  parseDevArgs,
  renderCaddyfile,
  renderSharedCaddyRoute,
  repoNameFromRemote,
  resolveRepoName,
  resolveRepoRoot,
  substitutePortToken,
} from "../bin/local-dev.mjs";

describe("local Studio hostname", () => {
  test("uses the canonical repository-based hostname", () => {
    expect(hostnameForRepo("blink")).toBe("blink.studio.local");
    expect(hostnameForRepo("Studio")).toBe("studio.studio.local");
  });

  test("normalizes repository names into a DNS label", () => {
    expect(normalizeRepoName("My_Design.Studio")).toBe("my-design-studio");
    expect(() => normalizeRepoName("___")).toThrow("DNS-safe hostname");
  });

  test("derives the repository root when run from a nested studio app", () => {
    const repoRoot = resolveRepoRoot(new URL("../examples/studio-app", import.meta.url).pathname);
    expect(repoRoot).toBe(new URL("..", import.meta.url).pathname.replace(/\/$/, ""));
    expect(resolveRepoName(repoRoot)).toBe("studio");
  });

  test("uses the repository name from common Git remote formats", () => {
    expect(repoNameFromRemote("git@github.com:arach/studio.git")).toBe("studio");
    expect(repoNameFromRemote("git@github.com:studio.git")).toBe("studio");
    expect(repoNameFromRemote("https://github.com/arach/studio.git")).toBe("studio");
    expect(repoNameFromRemote("/Users/art/dev/studio/")).toBe("studio");
  });
});

describe("studio dev arguments", () => {
  test("parses a wrapper port and child command", () => {
    expect(parseDevArgs(["--port", "3060", "--", "next", "dev"])).toEqual({
      command: ["next", "dev"],
      help: false,
      port: 3060,
    });
  });

  test("infers a Next.js port from the child command", () => {
    expect(inferPortFromCommand(["next", "dev", "--port=43140"])).toBe(43140);
    expect(parseDevArgs(["--", "next", "dev", "-p", "5191"]).port).toBe(5191);
  });

  test("does not interpret unrelated child flags as a Next.js port", () => {
    expect(inferPortFromCommand(["bun", "run", "custom-dev", "-p", "preview"])).toBeUndefined();
  });

  test("leaves the port unset when the child command uses the {port} token", () => {
    expect(parseDevArgs(["--", "next", "dev", "--port", "{port}"])).toEqual({
      command: ["next", "dev", "--port", "{port}"],
      help: false,
      port: undefined,
    });
    expect(parseDevArgs(["--", "next", "dev", "--port={port}"]).port).toBeUndefined();
    expect(inferPortFromCommand(["next", "dev", "-p", "{PORT}"])).toBeUndefined();
  });

  test("substitutes the token with an explicit wrapper port when both are given", () => {
    const parsed = parseDevArgs(["--port", "3060", "--", "next", "dev", "--port", "{port}"]);
    expect(parsed.port).toBe(3060);
    expect(substitutePortToken(parsed.command, parsed.port)).toEqual([
      "next", "dev", "--port", "3060",
    ]);
  });

  test("rejects conflicting wrapper and child ports", () => {
    expect(() => parseDevArgs([
      "--port", "3060", "--", "next", "dev", "--port", "3050",
    ])).toThrow("does not match");
  });
});

test("renders deterministic loopback-only Caddy routes", () => {
  expect(renderCaddyfile([
    { hostname: "lattices.studio.local", port: 3050 },
    { hostname: "blink.studio.local", port: 3060 },
  ])).toBe(`{
\tadmin 127.0.0.1:20219
\tauto_https off
\tdefault_bind 127.0.0.1
}

http://blink.studio.local:43150 {
\treverse_proxy 127.0.0.1:3060
}

http://lattices.studio.local:43150 {
\treverse_proxy 127.0.0.1:3050
}
`);
});

test("renders an isolated route for a shared port-80 Caddy edge", () => {
  expect(renderSharedCaddyRoute({
    hostname: "openscout.studio.local",
    port: 43140,
  })).toEqual({
    "@id": "studio_local_openscout_studio_local",
    match: [{ host: ["openscout.studio.local"] }],
    handle: [{
      handler: "reverse_proxy",
      upstreams: [{ dial: "127.0.0.1:43140" }],
    }],
    terminal: true,
  });
});

test("omits the default HTTP port from local URLs", () => {
  expect(formatLocalUrl("openscout.studio.local", 80))
    .toBe("http://openscout.studio.local");
  expect(formatLocalUrl("openscout.studio.local", 43150))
    .toBe("http://openscout.studio.local:43150");
});
