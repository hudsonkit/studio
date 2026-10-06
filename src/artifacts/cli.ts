#!/usr/bin/env bun
/**
 * Bundle Studio studies into self-contained artifact pages under <repo>/.studio/artifacts/.
 *
 *   bun src/artifacts/cli.ts build <study-id>... | --all
 *       Studies listed in apps/studio/src/studio/artifactStudies.ts.
 *
 *   bun src/artifacts/cli.ts build --repo ~/dev/fab --app design/studio \
 *       --entry design/studio/src/studio/pages/TuckPage.tsx --export TuckPage \
 *       --page /studio/surfaces/tuck --id tuck [--studio-url http://fab.studio.local]
 *       Any study in any Studio-style app.
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildStudy, type StudySpec } from "./buildStudy";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    all: { type: "boolean" },
    repo: { type: "string" },
    app: { type: "string" },
    entry: { type: "string" },
    export: { type: "string" },
    page: { type: "string" },
    id: { type: "string" },
    css: { type: "string" },
    "studio-url": { type: "string" },
  },
});

const [command, ...ids] = positionals;
if (command !== "build") {
  console.error("usage: bun src/artifacts/cli.ts build <study-id>... | --all | --repo <dir> --app <dir> --entry <file> --export <name> --id <slug> [--page <id|href>]");
  process.exit(1);
}

if (values.entry) {
  if (!values.repo || !values.app || !values.export || !values.id) {
    console.error("--entry needs --repo, --app, --export and --id.");
    process.exit(1);
  }
  const study: StudySpec = {
    id: values.id,
    entry: values.entry,
    export: values.export,
    page: values.page,
    css: values.css === "own" ? "own" : "app",
  };
  const built = await buildStudy({ repoRoot: resolve(values.repo), appDir: values.app, study, studioUrl: values["studio-url"] });
  console.log(JSON.stringify(built));
} else {
  const repoRoot = resolve(import.meta.dir, "../..");
  const { artifactStudies } = await import(resolve(repoRoot, "apps/studio/src/studio/artifactStudies.ts"));
  const selected: StudySpec[] = values.all ? artifactStudies : artifactStudies.filter((study: StudySpec) => ids.includes(study.id));
  const missing = ids.filter((id) => !artifactStudies.some((study: StudySpec) => study.id === id));
  if (missing.length) {
    console.error(`Not in artifactStudies.ts: ${missing.join(", ")}`);
    process.exit(1);
  }
  for (const study of selected) {
    console.log(JSON.stringify(await buildStudy({ repoRoot, appDir: "apps/studio", study })));
  }
}
