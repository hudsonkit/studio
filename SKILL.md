---
name: "studio"
description: "Use Studio from another project: add a design studio to a product repo, register pages, run it on its own local host, and share studies as Claude artifacts."
---

# Use Studio

Studio is a design studio that lives in your repo. Read [the README](README.md) for the shape of a studio, then [the reference](docs/reference.md) for every subpath and the adoption steps.

- Add a studio: an app route plus a registry built with `createRegistry` from `studio/registry`. Follow "Adopt Studio" in [the reference](docs/reference.md).
- Give the project its own host: wrap the dev script with `studio dev --port <port> -- <your dev command>`.
- Share a study for review: [Share studies as Claude artifacts](docs/claude-artifacts.md).
- Use [llms.txt](llms.txt) to find the public guides and reference.
- Today Studio is consumed from a sibling checkout next to `hudson`, not from npm. Verify the workspace links resolve before reporting setup as done.
- Do not treat `*.agent.md` maps or history docs as the public interface.
