---
name: dewey-author
description: Maintain this project's maps, guides, front door, and generated docs site using Dewey.
---
# Maintain project documentation

Use this skill after adding or changing a source area, command, public API, or task flow.

1. Read AGENTS.md and the affected docs map. Do not load history by default.
2. Run dewey check --json. Treat covered-code changes as a request for review, not proof the prose is false.
3. For a new area, add docs/<area>.agent.md with kind: map and covers: [src/<area>/**]. Describe files, data flow, invariants, and traps. Give it a real title. Do not pair every guide with a map.
4. Write task-shaped guides with kind: guide, and API/CLI/config contracts with kind: reference. Use relative Markdown links. Set nav: false only for intentionally unlisted human pages. Keep history at kind: history.
5. Finish scaffold drafts and remove draft: true only after review. Never invent behavior. Verify cited paths and package scripts without executing untrusted doc commands.
6. After reviewing a covered document against current code, run dewey review docs/<area>.agent.md. This explicitly records content hashes; build never acknowledges review for you.
7. Run dewey build, then dewey check. Repair broken links, missing navigation, and stale outputs. Site and llms.txt come from the same Markdown.
8. Keep AGENTS.md at 150 lines or fewer. Put hard rules outside its observed generated region. Dewey may only update marked regions; do not overwrite authored text.
9. Update root SKILL.md for agents using this project from outside. It is not this authoring skill.

Coverage supports *, **, and ?. A src/* map does not cover a new nested area such as src/sync/. No external-link network checks or command execution are performed by check. Root README.md is treated as a guide when it has no kind declaration.
