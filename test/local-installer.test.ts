import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ensureStudioLocalForProject,
  renderStudioLocalLaunchAgent,
  resolveStudioSupportPaths,
  writeStudioProjectManifest,
  type StudioLocalCommandResult,
  type StudioLocalRunCommand,
} from "../src/local";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "studio-local-installer-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

function commandResult(
  stdout = "",
  code = 0,
  stderr = "",
): StudioLocalCommandResult {
  return { code, stdout, stderr };
}

const readyCaddyCommand: StudioLocalRunCommand = async (command, args) => {
  if (command === "/bin/sh" && args.join(" ").includes("command -v 'caddy'")) {
    return commandResult("/opt/homebrew/bin/caddy\n");
  }
  return commandResult("", 1, "unexpected command");
};

describe("studio local installer", () => {
  test("renders a LaunchAgent that runs the local edge command", async () => {
    const root = await makeRoot();
    const paths = resolveStudioSupportPaths({ supportDir: join(root, "support") });

    const plist = renderStudioLocalLaunchAgent({
      bunBin: "/opt/homebrew/bin/bun",
      cliPath: "/Users/dev/code/studio/src/local/cli.ts",
      paths,
      supervisorPort: 43180,
      scheme: "http",
      caddyBin: "/opt/homebrew/bin/caddy",
    });

    expect(plist).toContain("<string>dev.studio.local</string>");
    expect(plist).toContain("<string>/opt/homebrew/bin/bun</string>");
    expect(plist).toContain("<string>edge</string>");
    expect(plist).toContain("<string>--port</string>");
    expect(plist).toContain("<string>43180</string>");
    expect(plist).toContain("<key>STUDIO_LOCAL_SUPPORT_DIR</key>");
    expect(plist).toContain(paths.supportDir);
  });

  test("ensures the shared edge then registers the calling repo", async () => {
    const root = await makeRoot();
    const repo = join(root, "client");
    const paths = resolveStudioSupportPaths({ supportDir: join(root, "support") });
    await writeStudioProjectManifest(repo, {
      id: "client",
      label: "Client Studio",
      studioDir: "design/studio",
      start: "bun dev --port {port}",
      preferredPort: 5310,
    });

    const report = await ensureStudioLocalForProject({
      repo,
      paths,
      platform: "darwin",
      env: { ...process.env, HOME: root },
      runCommand: readyCaddyCommand,
      startService: false,
      bunBin: "/opt/homebrew/bin/bun",
      cliPath: "/Users/dev/code/studio/src/local/cli.ts",
    });

    expect(report.registered).toMatchObject({
      id: "client",
      port: 5310,
      enabled: true,
    });
    expect(report.caddy.status).toBe("ready");
    expect(report.service.installed).toBe(true);
    expect(report.service.started).toBe(false);

    const caddyfile = await readFile(paths.caddyfilePath, "utf8");
    expect(caddyfile).toContain("http://client.studio.local");
    expect(caddyfile).toContain("reverse_proxy 127.0.0.1:5310");

    const plist = await readFile(report.service.launchAgentPath!, "utf8");
    expect(plist).toContain("<string>dev.studio.local</string>");
  });
});
