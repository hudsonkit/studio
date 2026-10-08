import { readdir, readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { FeedbackError } from "./local-feedback.mjs";

/**
 * Studies mirrored as Claude artifacts.
 *
 * Only agent sessions hold the Artifact tools, so the host never talks to
 * claude.ai. It keeps the bookkeeping and hands the agent a plan:
 *
 *   bun src/artifacts/cli.ts build --all      bundles studies into .studio/artifacts/<id>.html
 *   artifact_sync_plan                        what to publish, which comments to read, which replies to post
 *   artifact_link                             record a publish (url + source hash)
 *   artifact_import_comments                  artifact comments → Studio feedback on the study
 *   artifact_mark_mirrored                    a Studio reply was posted to its artifact thread
 *
 * Artifact links are private to the person who published them, so links.json
 * lives in the gitignored `.studio/artifacts/` of the checkout.
 */

export const ARTIFACT_FEEDBACK_AUTHOR = "Studio";
const ARTIFACT_URL_PATTERN = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]+$/;

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function hashSources(repoRoot, files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(repoRoot, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function studyBody(build, link) {
  return [
    `Feedback on the **${build.title}** study.`,
    "",
    `- Study: [${build.studioHref}](${build.studioHref})`,
    link?.url ? `- Artifact: [${link.url}](${link.url})` : "- Artifact: not published yet",
    "",
    "Comments left on the artifact land here. Replies to them are posted back to the artifact thread.",
    "",
  ].join("\n");
}

/** Where an artifact thread sits on the study, or undefined when the read gave no anchor. */
function artifactAnchor(comment) {
  const selector = typeof comment.selector === "string" ? comment.selector.trim().slice(0, 1000) : "";
  const location = typeof comment.location === "string" ? comment.location.trim().slice(0, 300) : "";
  if (!selector && !location) return undefined;
  return { kind: "artifact-element", selector: selector || undefined, location: location || undefined };
}

export class StudioArtifactSync {
  /** @param {{ store: import("./local-feedback.mjs").StudioFeedbackStore, repoRoot: string }} options */
  constructor({ store, repoRoot }) {
    this.store = store;
    this.repoRoot = repoRoot;
    this.dir = join(repoRoot, ".studio", "artifacts");
    this.linksPath = join(this.dir, "links.json");
    this.writes = Promise.resolve();
  }

  serialize(task) {
    const run = this.writes.then(task, task);
    this.writes = run.catch(() => {});
    return run;
  }

  async readLinks() {
    return readJson(this.linksPath, { version: 1, studies: {} });
  }

  async writeLinks(links) {
    await mkdir(this.dir, { recursive: true });
    const temporary = `${this.linksPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(links, null, 2)}\n`);
    await rename(temporary, this.linksPath);
  }

  /** Built studies, from the sidecars `bun src/artifacts/cli.ts build` writes. */
  async listBuilds() {
    let files = [];
    try {
      files = await readdir(this.dir);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const builds = [];
    for (const file of files.sort()) {
      if (!file.endsWith(".json") || file === "links.json") continue;
      const build = await readJson(join(this.dir, file), null);
      if (build?.id && build.htmlPath) builds.push(build);
    }
    return builds;
  }

  async readBuild(id) {
    const build = (await this.listBuilds()).find((candidate) => candidate.id === id);
    if (!build) {
      throw new FeedbackError(404, `Study "${id}" has not been built. Run \`bun src/artifacts/cli.ts build ${id}\`.`);
    }
    return build;
  }

  /** The agent page that holds a study's feedback, created on first use. */
  async ensureFeedbackPage(build, link) {
    try {
      return await this.store.readPage(build.id);
    } catch (error) {
      if (!(error instanceof FeedbackError) || error.status !== 404) throw error;
    }
    return this.store.createPage(
      {
        slug: build.id,
        title: build.title,
        blurb: "Feedback from the study's Claude artifact.",
        body: studyBody(build, link),
        widgets: [{ kind: "comments" }],
      },
      { name: ARTIFACT_FEEDBACK_AUTHOR, client: "artifact-sync" },
    );
  }

  async plan({ commandPrefix = "bun src/artifacts/cli.ts" } = {}) {
    const links = await this.readLinks();
    const builds = await this.listBuilds();
    const studies = [];
    for (const build of builds) {
      const link = links.studies[build.id];
      let currentHash = build.sourceHash;
      try {
        currentHash = await hashSources(this.repoRoot, build.sources ?? []);
      } catch {
        // A source moved or was deleted; the rebuild will report it.
      }
      const buildStale = currentHash !== build.sourceHash;
      const action = !link?.url ? "publish" : link.publishedHash !== build.sourceHash || buildStale ? "republish" : "current";
      studies.push({
        id: build.id,
        title: build.title,
        action,
        build_stale: buildStale || undefined,
        html_path: build.htmlPath,
        url: link?.url,
        studio_url: build.studioHref,
        source_hash: build.sourceHash,
        published_hash: link?.publishedHash,
        outbound: link?.url ? await this.outbound(build.id, link) : [],
        unmirrorable: link?.url ? await this.unmirrorable(build.id, link) : [],
      });
    }
    return {
      studies,
      steps: [
        `Rebuild first when any study shows build_stale: \`${commandPrefix} build --all\`, then call artifact_sync_plan again.`,
        "publish: Artifact publish with file_path = html_path (icon on first publish), then artifact_link with the url and source_hash.",
        "republish: Artifact publish with file_path = html_path and url, then artifact_link.",
        "Every study with a url: ArtifactComments read, then artifact_import_comments with every comment you saw (duplicates are skipped). Pass each thread's [anchored at] row as selector and its [location] row as location, so the local study pins the thread on the same element. Set from_claude on Claude's comments and pass each comment's timestamp as created_at.",
        "outbound: ArtifactComments reply with thread_id and text, then artifact_mark_mirrored. Replies only land on threads a writer sent to Claude; leave the rest for next time.",
        "unmirrorable: new Studio threads have no artifact thread to land on; mention them to the user.",
      ],
    };
  }

  async link({ study, url, sourceHash }) {
    if (!ARTIFACT_URL_PATTERN.test(String(url ?? ""))) throw new FeedbackError(400, "url must be a claude.ai artifact link.");
    const build = await this.readBuild(study);
    return this.serialize(async () => {
      const links = await this.readLinks();
      const previous = links.studies[study] ?? { threads: {}, comments: {}, mirrored: {} };
      const next = {
        ...previous,
        url,
        publishedHash: sourceHash ?? build.sourceHash,
        publishedAt: new Date().toISOString(),
        versions: (previous.versions ?? 0) + 1,
      };
      links.studies[study] = next;
      await this.writeLinks(links);
      const page = await this.ensureFeedbackPage(build, next);
      if (previous.url !== url) await this.store.updatePage(page.slug, { body: studyBody(build, next), note: "Artifact linked." });
      return { study, url, publishedHash: next.publishedHash, versions: next.versions, feedback_page: page.slug };
    });
  }

  /**
   * `selector` and `location` are the thread's "[anchored at]" and "[location]" rows. They are kept
   * as the root comment's anchor so the local study can pin the thread on the same element.
   *
   * @param {{ study: string, comments: Array<{ thread_id: string, comment_id?: string, author?: string, body: string, from_claude?: boolean, resolved?: boolean, selector?: string, location?: string, created_at?: string }> }} input
   */
  async importComments({ study, comments }) {
    if (!Array.isArray(comments)) throw new FeedbackError(400, "comments must be an array.");
    const build = await this.readBuild(study);
    return this.serialize(async () => {
      const links = await this.readLinks();
      const link = links.studies[study];
      if (!link?.url) throw new FeedbackError(400, `Study "${study}" has no artifact yet. Publish it and call artifact_link first.`);
      link.threads ??= {};
      link.comments ??= {};
      link.mirrored ??= {};
      const page = await this.ensureFeedbackPage(build, link);
      const mirroredTexts = new Set(Object.values(link.mirrored).map((entry) => `${entry.threadId}\0${entry.text}`));
      // Bodies written in Studio, to catch echoes of our own replies when mark_mirrored got no text.
      const localBodies = new Set(
        (await this.store.listEvents(page.slug).catch(() => []))
          .filter((event) => !event.source && event.body)
          .map((event) => event.body.trim()),
      );
      const imported = [];
      let skipped = 0;
      for (const comment of comments) {
        const threadId = String(comment.thread_id ?? "");
        const body = String(comment.body ?? "").trim();
        if (!threadId || !body) {
          skipped += 1;
          continue;
        }
        const key = comment.comment_id ? String(comment.comment_id) : `${threadId}:${createHash("sha256").update(body).digest("hex").slice(0, 12)}`;
        // Our own mirrored replies come back through read; never import them a second time.
        if (link.comments[key] || mirroredTexts.has(`${threadId}\0${body}`)) {
          skipped += 1;
          continue;
        }
        const parentId = link.threads[threadId];
        const at = Number.isNaN(Date.parse(comment.created_at)) ? undefined : new Date(comment.created_at).toISOString();
        const source = { kind: "artifact", url: link.url, threadId, commentId: comment.comment_id, at };
        let event;
        if (comment.from_claude) {
          // The artifact's Claude answering in the thread. Imported as an agent reply so Studio shows
          // the whole conversation; echoes of replies written in Studio ("Name: body") are skipped.
          const unprefixed = body.replace(/^[^:\n]{1,80}:\s*/, "");
          if (!parentId || localBodies.has(body) || localBodies.has(unprefixed)) {
            skipped += 1;
            continue;
          }
          event = await this.store.addAgentEvent(page.slug, {
            kind: "reply",
            author: { name: "Claude" },
            parentId,
            body,
            source,
          });
        } else {
          event = await this.store.addReviewerEvent(page.slug, {
            kind: "comment",
            author: { name: String(comment.author || "Artifact viewer").slice(0, 80) },
            parentId,
            body,
            anchor: parentId ? undefined : artifactAnchor(comment),
            source,
          });
        }
        if (!parentId) link.threads[threadId] = event.id;
        link.comments[key] = event.id;
        imported.push({ id: event.id, thread_id: threadId, parent_id: parentId });
      }
      await this.writeLinks(links);
      return { study, feedback_page: page.slug, imported, skipped };
    });
  }

  async markMirrored({ study, eventId, threadId, text }) {
    return this.serialize(async () => {
      const links = await this.readLinks();
      const link = links.studies[study];
      if (!link) throw new FeedbackError(404, `Study "${study}" has no artifact link.`);
      link.mirrored ??= {};
      link.mirrored[eventId] = { threadId, text, at: new Date().toISOString() };
      await this.writeLinks(links);
      return { study, event_id: eventId, thread_id: threadId };
    });
  }

  /** Studio replies under artifact threads that haven't been posted back yet. */
  async outbound(study, link) {
    const threadByRoot = new Map(Object.entries(link.threads ?? {}).map(([threadId, rootId]) => [rootId, threadId]));
    if (threadByRoot.size === 0) return [];
    const events = await this.store.listEvents(study).catch(() => []);
    const rootOf = new Map();
    for (const event of events) {
      if (!event.id || event.kind === "resolve" || event.kind === "reopen" || event.kind === "page_updated") continue;
      rootOf.set(event.id, event.parentId ? rootOf.get(event.parentId) ?? event.parentId : event.id);
    }
    const out = [];
    for (const event of events) {
      if (!event.parentId || event.source || link.mirrored?.[event.id] || !event.body) continue;
      const threadId = threadByRoot.get(rootOf.get(event.id));
      if (!threadId) continue;
      const prefix = event.author?.role === "agent" ? "" : `${event.author?.name ?? "Studio"}: `;
      out.push({ event_id: event.id, thread_id: threadId, text: `${prefix}${event.body}`.slice(0, 4000) });
    }
    return out;
  }

  /** Top-level feedback written in Studio: the artifact can't take new threads from Claude. */
  async unmirrorable(study) {
    const events = await this.store.listEvents(study).catch(() => []);
    return events
      .filter((event) => !event.parentId && !event.source && event.author?.role === "reviewer")
      .map((event) => ({ event_id: event.id, author: event.author?.name, body: event.body }));
  }
}
