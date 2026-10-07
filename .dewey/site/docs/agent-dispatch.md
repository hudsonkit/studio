
# Agent dispatch

`studio/agents` lets a Studio register the agents it may send work to and
route messages — annotations, context, review passes — to a chosen agent over
the existing Scout web transport. It is the multi-agent sibling of the Scout
connection (`studio/scout`): the `scout` block in `.studio/project.json`
says *who this Studio is*; the `agents` list says *who this Studio can talk
to*.

The dispatch contract (`StudioCapabilityRequest` / `StudioCapabilityResult`)
mirrors Hudson's HUD-011 agent contract. Transport today is direct Scout
HTTP; the shapes are aligned so a future Hudson-mediated dispatch bus can
slot in without rewriting call sites.

## Registering targets

Add an `agents` array to `.studio/project.json`, beside the `scout` block:

```json
{
  "scout": {
    "webBaseUrl": "http://127.0.0.1:43120",
    "identity": { "agent": "studio", "label": "Studio agent" }
  },
  "agents": [
    { "agent": "studio", "label": "Studio agent" },
    { "agent": "atelier", "label": "Atelier agent", "intent": "request" }
  ]
}
```

Each entry is a `StudioAgentTarget`:

- `agent` (required) — a portable Scout selector, resolved against exact ids,
  definition ids, handles, and names. Never a machine-specific id, so the
  manifest survives moving between machines.
- `label` — human-facing name for pickers; falls back to the selector.
- `intent` — `"message"` (default) or `"request"`, the send mode this target
  prefers.
- `blurb` — one line on what this agent is good at.

Registration is an explicit array, not a discovery sweep: entering the list
is the claim that an agent may receive work from this Studio, and that should
be a decision. When `agents` is absent, every consumer falls back to
`[scout.identity]` — single-agent configs keep working unchanged.

## The registry

```ts
import { createAgentRegistry } from "studio/agents";

const registry = createAgentRegistry({ agents: manifest.agents ?? [] });

registry.all();                // every target, in manifest order
registry.get("atelier");       // one target, or undefined
registry.resolve(undefined);   // the default (first, or `defaultTarget`)
registry.resolve("nobody");    // undefined — never silently the default
```

`resolve` is the picker path: no choice falls back to the default, an unknown
selector refuses. Sending work to the wrong agent is worse than not sending.

Server code can skip the manifest plumbing with
`loadStudioAgentRegistry(startDirectory)` from `studio/scout/server`, which
reads `.studio/project.json` and applies the `[scout.identity]` fallback.

## Sending to a target

`postStudioScoutMessage` (server-only, `studio/scout/server`) accepts an
optional `target` on its input — or as a trailing argument — and resolves the
target's selector instead of the hardwired identity:

```ts
await postStudioScoutMessage({
  body: "Port this component.",
  target: { agent: "atelier", label: "Atelier agent" },
});
```

The receipt carries both `agentId` (the Studio's own resolved identity — the
sender) and `targetAgentId` (the resolved recipient). Without a target they
are equal, and existing callers behave exactly as before.

The first-party app exposes the same flow over HTTP: `GET /api/scout/agents`
lists the registered targets with live online state (Scout down →
`online: null`, never a 500), and `POST /api/scout/messages` accepts an
optional `target` that is validated against the registry — unregistered
selectors get a 400.

## The dispatch contract

Two pure helpers map Studio shapes onto the HUD-011-aligned contract, no
network involved:

```ts
import {
  annotationPassToCapabilityRequest,
  receiptToCapabilityResult,
} from "studio/agents";

const request = annotationPassToCapabilityRequest(pass, target);
// { appId: "studio", operation: "annotations:dispatch",
//   params: { target, intent, docTitle, slug, annotations, formatted },
//   source: "studio-ui" }

const result = receiptToCapabilityResult(receipt);
// { ok: true, summary: "Delivered to … via Scout (message).", data: { … } }
```

## Wiring a consumer studio

`AnnotatableDoc` takes an optional `sendTargets` prop. With two or more
entries the send-pass modal shows a small target select and the chosen id
rides on `SendPassPayload.target`; absent or a single entry renders exactly
as before. Routing is the consumer's `onSendPass` job:

```tsx
<AnnotatableDoc
  body={body}
  slug={slug}
  docTitle={title}
  sendTargets={[
    { id: "studio", label: "Studio agent" },
    { id: "atelier", label: "Atelier agent" },
  ]}
  onSendPass={async (payload) => {
    await fetch("/api/scout/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: payload.formatted,
        target: payload.target ? { agent: payload.target } : undefined,
      }),
    });
  }}
/>
```

## Out of scope (for now)

- No Hudson relay or dispatch bus — HUD-011 alignment is contract-only.
- No liveness registry of our own; Scout's `/api/agents` stays the single
  source of truth for presence.
