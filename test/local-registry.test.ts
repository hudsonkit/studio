import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  listResolvedStudios,
  readStudioMachineRegistry,
  registerStudio,
  resolveStudioSupportPaths,
  setStudioEnabled,
  writeStudioProjectManifest,
} from "../src/local";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "studio-local-registry-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("studio local registry", () => {
  test("registers a project manifest into the machine registry", async () => {
    const root = await makeRoot();
    const repo = join(root, "openscout");
    const paths = resolveStudioSupportPaths({ supportDir: join(root, "support") });

    await writeStudioProjectManifest(repo, {
      id: "Open Scout",
      label: "OpenScout",
      studioDir: "design/studio",
      start: "bun next dev --port {port}",
      host: "openscout.studio.local",
      preferredPort: 3030,
      healthPath: "/studio",
      previews: [
        {
          id: "Action",
          label: "Action",
          host: "action.studio.local",
          description: "Capture overlay studies.",
          links: [
            { label: "Controller", path: "/renders/act-controller" },
            { label: "Keycaps", path: "renders/act-keycap" },
          ],
        },
      ],
    });

    const entry = await registerStudio({ repo, paths });
    expect(entry).toMatchObject({
      id: "open-scout",
      host: "openscout.studio.local",
      port: 3030,
      enabled: true,
    });

    const registry = await readStudioMachineRegistry(paths);
    expect(registry.studios).toHaveLength(1);

    const [studio] = await listResolvedStudios(paths);
    expect(studio).toMatchObject({
      id: "open-scout",
      label: "OpenScout",
      command: "bun next dev --port {port}",
      healthPath: "/studio",
      port: 3030,
      previews: [
        {
          id: "action",
          label: "Action",
          host: "action.studio.local",
          description: "Capture overlay studies.",
          links: [
            { label: "Controller", path: "/renders/act-controller" },
            { label: "Keycaps", path: "/renders/act-keycap" },
          ],
        },
      ],
    });
    expect(studio?.studioDir).toBe(join(repo, "design/studio"));
  });

  test("leases a different port when a preferred port is already used", async () => {
    const root = await makeRoot();
    const paths = resolveStudioSupportPaths({ supportDir: join(root, "support") });
    const firstRepo = join(root, "first");
    const secondRepo = join(root, "second");

    await writeStudioProjectManifest(firstRepo, {
      id: "first",
      preferredPort: 5191,
    });
    await writeStudioProjectManifest(secondRepo, {
      id: "second",
      preferredPort: 5191,
    });

    const first = await registerStudio({ repo: firstRepo, paths });
    const second = await registerStudio({ repo: secondRepo, paths });

    expect(first.port).toBe(5191);
    expect(second.port).toBe(5200);
  });

  test("can disable a registered studio without removing it", async () => {
    const root = await makeRoot();
    const repo = join(root, "studio");
    const paths = resolveStudioSupportPaths({ supportDir: join(root, "support") });

    await writeStudioProjectManifest(repo, { id: "studio" });
    await registerStudio({ repo, paths });
    const disabled = await setStudioEnabled("studio", false, paths);

    expect(disabled.enabled).toBe(false);
    expect((await readStudioMachineRegistry(paths)).studios[0]?.enabled).toBe(false);
  });
});
