import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioArtifactSync } from "../bin/local-artifacts.mjs";
import { StudioFeedbackStore } from "../bin/local-feedback.mjs";

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup() {
  const repoRoot = await mkdtemp(join(tmpdir(), "studio-art-"));
  temporaryDirectories.push(repoRoot);
  await mkdir(join(repoRoot, "src"), { recursive: true });
  await mkdir(join(repoRoot, ".studio/artifacts"), { recursive: true });
  await writeFile(join(repoRoot, "src/Study.tsx"), "export const Study = () => null;\n");
  const build = {
    id: "sample-study",
    title: "Sample study",
    htmlPath: join(repoRoot, ".studio/artifacts/sample-study.html"),
    studioHref: "http://repo.studio.local/studio/studies/sample-study",
    sources: ["src/Study.tsx"],
  };
  const store = new StudioFeedbackStore({ studioId: "repo", repoRoot });
  const sync = new StudioArtifactSync({ store, repoRoot });
  return { repoRoot, build, store, sync };
}

async function writeBuild(repoRoot, build, sourceHash) {
  await writeFile(join(repoRoot, ".studio/artifacts/sample-study.json"), JSON.stringify({ ...build, sourceHash }));
}

const URL = "https://claude.ai/artifact/AbC123";

describe("artifact sync", () => {
  test("plans publish, links, imports comments once and mirrors Studio replies", async () => {
    const { repoRoot, build, store, sync } = await setup();
    await writeBuild(repoRoot, build, "stale");
    let plan = await sync.plan();
    expect(plan.studies[0]).toMatchObject({ id: "sample-study", action: "publish", build_stale: true });
    const current = plan.studies[0];

    // Rebuilt: the sidecar hash now matches the sources.
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256");
    hash.update("src/Study.tsx"); hash.update("\0");
    hash.update(await readFile(join(repoRoot, "src/Study.tsx"))); hash.update("\0");
    const sourceHash = hash.digest("hex").slice(0, 16);
    await writeBuild(repoRoot, build, sourceHash);
    expect((await sync.plan()).studies[0]).toMatchObject({ action: "publish", build_stale: undefined });
    expect(current.url).toBeUndefined();

    const linked = await sync.link({ study: "sample-study", url: URL, sourceHash });
    expect(linked.feedback_page).toBe("sample-study");
    expect((await store.readPage("sample-study", { withBody: true })).body).toContain(URL);
    expect((await sync.plan()).studies[0].action).toBe("current");

    const comments = [
      { thread_id: "t1", comment_id: "c1", author: "Ada", body: "The hero runs long." },
      { thread_id: "t1", comment_id: "c2", author: "Ada", body: "@claude can we tighten it?" },
    ];
    const first = await sync.importComments({ study: "sample-study", comments });
    expect(first.imported).toHaveLength(2);
    expect(first.imported[1].parent_id).toBe(first.imported[0].id);
    expect((await sync.importComments({ study: "sample-study", comments })).imported).toHaveLength(0);

    const events = await store.listEvents("sample-study");
    const root = events.find((event) => event.kind === "comment" && !event.parentId);
    expect(root.source).toMatchObject({ kind: "artifact", threadId: "t1", commentId: "c1" });

    await store.addAgentEvent("sample-study", { kind: "reply", parentId: root.id, body: "Tightened in the next build." });
    plan = await sync.plan();
    const [outbound] = plan.studies[0].outbound;
    expect(outbound).toMatchObject({ thread_id: "t1", text: "Tightened in the next build." });

    await sync.markMirrored({ study: "sample-study", eventId: outbound.event_id, threadId: "t1", text: outbound.text });
    expect((await sync.plan()).studies[0].outbound).toHaveLength(0);
    // The mirrored reply comes back on the next read and is not imported as reviewer feedback.
    const again = await sync.importComments({
      study: "sample-study",
      comments: [...comments, { thread_id: "t1", comment_id: "c3", author: "Claude", body: outbound.text }],
    });
    expect(again.imported).toHaveLength(0);

    await writeFile(join(repoRoot, "src/Study.tsx"), "export const Study = () => 'changed';\n");
    expect((await sync.plan()).studies[0]).toMatchObject({ action: "republish", build_stale: true });
  });

  test("new Studio threads are reported as unmirrorable and link rejects non-artifact urls", async () => {
    const { repoRoot, build, store, sync } = await setup();
    await writeBuild(repoRoot, build, "x");
    await expect(sync.link({ study: "sample-study", url: "https://example.com/x" })).rejects.toThrow("artifact link");
    await sync.link({ study: "sample-study", url: URL });
    await store.addReviewerEvent("sample-study", { kind: "comment", author: { name: "Bo" }, body: "Studio-side note" });
    const [study] = (await sync.plan()).studies;
    expect(study.unmirrorable).toEqual([expect.objectContaining({ author: "Bo", body: "Studio-side note" })]);
    expect(study.outbound).toHaveLength(0);
  });
});
