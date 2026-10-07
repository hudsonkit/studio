
# Component registry

`@arach/studio/components` is the component-level sibling of the page
registry (`@arach/studio/registry`). The page registry describes the *routes*
a studio hosts; the component registry describes the *components* it has
finished, so a human or an agent can tell an adoptable component from a
sketch without reading its source.

A **manifest** is a sidecar (`<Name>.manifest.ts`) beside the component it
describes, answering the questions an adopter asks: is there a component for
X, is it finished, how do I use it, what happens in the ugly cases, is it
already in prod and in sync. Sidecars, not a central file: a sidecar changes
in the same diff as the thing it describes.

## audit vs verify

The distinction is the whole point, keep it sharp:

- **`audit`** checks a manifest against **itself** — completeness rules
  (kebab-case id, real summary, `whenToUse`, examples with a no-setup first
  one, documented defaults on fixed-option props…). It can only prove a
  manifest is *incomplete*. The top status (`graduated` by default) is not a
  label you write, it is the bar `audit` enforces: errors block it, warnings
  are pressure and never gate.
- **`verify`** checks a manifest against **the filesystem** — source files
  exist, claimed exports are exported, documented props are on the props
  type, port targets exist, recorded `verifiedAgainst` content hashes still
  match. It proves a manifest is *wrong*. A registry whose entries are
  confidently wrong is worse than no registry.

Both exit non-zero on error-level findings in the CLI, so either works as a
CI gate. `verify` is node-only and lives on a separate export path
(`@arach/studio/components/verify`) so browser bundles never reach `node:fs`.

## Registering your first component

1. Write `<Name>.manifest.ts` beside the component (copy
   `src/atoms/StatusPill.manifest.ts` in this repo — it is the specimen).
2. Create `studio.components.ts` at your repo root:

   ```ts
   import type { ComponentManifest } from "@arach/studio/components";
   import { statusPillManifest } from "./src/atoms/StatusPill.manifest";

   export const manifests: ComponentManifest[] = [statusPillManifest];
   ```

   Registration is an explicit array, not a glob: entering the registry is
   the claim that a component is adoptable, and that should be a decision.
3. Query it from anywhere in the repo:

   ```bash
   studio components list
   studio components find dropdown for choosing a model
   studio components show status-pill
   studio components audit    # exit 1 on error-level findings
   studio components verify   # exit 1 on provable falsehoods
   studio components hashes status-pill   # fresh port.ref + verifiedAgainst block
   ```

   `--json` on every subcommand prints only valid JSON on stdout (pipe to
   `jq`). The CLI finds the registry by walking up to the nearest `.git` and
   loading `studio.components.ts` there; `--registry <path>` and
   `--root <path>` override.

## Customizing the vocabulary

Everything is generic over your status union, like the page registry:

```ts
type Status = "wip" | "shipped";

const registry = createComponentRegistry<Status>({
  manifests,
  honestyBar: "shipped",          // the status the audit bar gates
  auditRules: [                   // project-specific rules, appended to the built-ins
    (m) =>
      m.data
        ? []
        : [{ level: "error", field: "data", message: "name a data contract" }],
  ],
  statusBoost: (s) => (s === "shipped" ? 3 : 0),  // search ranking bonus
});
```

## Port claims

`manifest.port` records whether a production counterpart exists (`none` /
`partial` / `synced` / `drifted`), prose `drift[]` naming both sides of each
divergence, and `verifiedAgainst` content hashes plus the git `ref` they were
taken at — a port claim without the ref is branch-relative without saying
so. Regenerate the block with `studio components hashes <id>`; `verify`
warns when the recorded files have moved.
