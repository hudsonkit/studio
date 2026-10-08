
# Share studies as Claude artifacts

A study is easy to review in Studio itself, if the reviewer has the repo running. Most reviewers don't. Studio can bundle any study into one self-contained page and publish it as a [Claude artifact](https://claude.ai): a private link you can share like a document. Comments left on the artifact come back into Studio as feedback on the study, and replies written in Studio go back to the artifact thread.

```txt
study (React, in your repo)
  → bun src/artifacts/cli.ts build      one HTML page: React, the study, CSS, fonts
  → agent publishes it                  Artifact tool → claude.ai/artifact/…
  → reviewers comment on the artifact
  → agent imports the comments          feedback on the study, in Studio
  → you reply in Studio
  → agent posts the reply back          the same artifact thread
```

Studio's host never talks to claude.ai. Only an agent session holds the Artifact tools, so the host keeps the bookkeeping and hands the agent a plan to carry out.

## Choose the studies to share

List them in `apps/studio/src/studio/artifactStudies.ts`:

```ts
export const artifactStudies: readonly ArtifactStudy[] = [
  {
    id: "talkie-one-thought",
    entry: "apps/studio/src/studio/studies/TalkieOneThought.tsx",
    export: "TalkieOneThoughtStudy",
  },
];
```

| Field | Meaning |
| --- | --- |
| `id` | Artifact slug, and the registry page id unless `page` says otherwise. |
| `entry` | The study module, relative to the repo root. |
| `export` | Named export, rendered with `{ page }`. |
| `page` | Registry page id or href to pass as `page`. |
| `css` | `"app"` (default) brings the app's `globals.css` and fonts; `"own"` relies on the study's CSS imports. |

## Build the pages

```sh
bun src/artifacts/cli.ts build talkie-one-thought
bun src/artifacts/cli.ts build --all
```

Each build writes `.studio/artifacts/<id>.html` and a sidecar `<id>.json` holding a hash of the study's sources. The page carries React, the study, the compiled Tailwind CSS and its fonts inline, so it renders with no network access.

Studies in other Studio-style apps build the same way. Point the CLI at the repo and app:

```sh
bun src/artifacts/cli.ts build --repo ~/dev/fab --app design/studio \
  --entry design/studio/src/studio/pages/TuckPage.tsx --export TuckPage \
  --page /studio/surfaces/tuck --id tuck
```

## Sync with an agent

Connect your agent to the Studio host's MCP server. `studio mcp` prints the URL and the `claude mcp add` line. Then ask the agent to sync the artifacts. It works through four tools:

| Tool | What it does |
| --- | --- |
| `artifact_sync_plan` | Lists each built study as `publish`, `republish` or `current`, with the comments to read and the Studio replies to post. |
| `artifact_link` | Records a publish: the artifact URL and the source hash that was published. The first link creates the study's feedback page. |
| `artifact_import_comments` | Copies artifact comments into Studio feedback on the study. |
| `artifact_mark_mirrored` | Records that a Studio reply was posted to its artifact thread. |

The agent carries out the plan with its own Artifact and ArtifactComments tools, then reports back through these four.

A study is due for `republish` when its sources change after the last publish. If the plan marks a study `build_stale`, its sources changed since the last build. Rebuild with `build --all` and ask for the plan again.

## How comments travel

- **Into Studio.** Every artifact comment lands as feedback on the study, threaded the way it was on the artifact. Comments already imported are skipped. Claude's replies on the artifact come in too, in the order they were written, so Studio shows the whole conversation. Its copies of replies written in Studio are skipped.
- **Pinned on the study.** A thread pinned to an element on the artifact shows as a numbered pin on the same element of the local study, while `studio dev` runs. Click the pin to read the thread, reply, or resolve it. Resolved threads lose their pin.
- **Back to the artifact.** Replies written in Studio under an imported thread are posted to that artifact thread, with the reviewer's name as a prefix. A reply can only land on a thread someone with edit access has sent to Claude. Until then it waits in the plan for the next sync.
- **Top-level feedback stays in Studio.** Claude can reply to a thread on an artifact but can't open one. The plan lists those notes as unmirrorable so the agent can tell you, rather than dropping them.

## What stays private

Artifacts are private to the person who publishes them until they share the link. Studio stores links and comment bookkeeping in `.studio/artifacts/links.json`, inside the gitignored `.studio/artifacts/`. Nothing about a published artifact is committed to the repo.
