import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostApiRequest, startStudioHost, studioHostPaths } from "../bin/local-host.mjs";

const hosts = [];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop({ preserveState: false })));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studio-mcp-test-"));
  temporaryDirectories.push(root);
  const repoRoot = join(root, "repo");
  await mkdir(repoRoot, { recursive: true });
  const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
  const host = await startStudioHost({ disableMdns: true, paths, proxyPort: 0, mcpPort: 0, sweepMs: 10_000 });
  hosts.push(host);
  await hostApiRequest("/v1/registrations/sample-repo", {
    paths,
    method: "PUT",
    body: {
      repo: { name: "sample-repo", root: repoRoot },
      workingDirectory: repoRoot,
      upstream: { host: "127.0.0.1", port: 3_060 },
      process: { pid: process.pid },
      liveness: { ttlMs: 0 },
    },
  });
  return { host, paths, repoRoot };
}

function http(port, path, { method = "GET", body, headers = {} } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolveRequest, rejectRequest) => {
    const outgoing = request({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...(payload === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        status: response.statusCode,
        headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    outgoing.once("error", rejectRequest);
    if (payload !== undefined) outgoing.write(payload);
    outgoing.end();
  });
}

function mcpClient(port) {
  let sessionId;
  let nextId = 1;
  async function rpc(method, params) {
    const response = await http(port, "/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: nextId++, method, params },
      headers: sessionId ? { "mcp-session-id": sessionId } : {},
    });
    sessionId = response.headers["mcp-session-id"];
    const data = response.text.split("\n").find((line) => line.startsWith("data: "));
    return JSON.parse(data.slice(6));
  }
  return {
    rpc,
    async tool(name, args = {}) {
      const message = await rpc("tools/call", { name, arguments: args });
      const [content] = message.result.content;
      if (message.result.isError) throw new Error(content.text);
      return JSON.parse(content.text);
    },
  };
}

describe("Studio MCP", () => {
  test("the page list reports who is listening and what waits on the reviewer", async () => {
    const { host } = await fixture();
    const agent = mcpClient(host.mcpPort);
    await agent.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code" } });
    await agent.tool("create_page", { title: "Naming", body: "Pick one.", agent: "atlas", widgets: [{ kind: "comments" }, { kind: "chat" }] });
    const asReviewer = (path, options) => http(host.proxyPort, path, {
      ...options,
      headers: { host: `sample-repo.studio.local:${host.publicPort}` },
    });
    const list = async () => JSON.parse((await asReviewer("/__studio/api/pages")).text);
    const post = (body) => asReviewer("/__studio/api/pages/naming/feedback", { method: "POST", body: { author: { name: "Rae" }, ...body } });

    let listed = await list();
    expect(listed.agents).toMatchObject([{ name: "atlas", client: "claude-code", listening: false }]);
    expect(listed.pages[0].presence).toMatchObject({ name: "atlas", listening: false });
    expect(listed.pages[0].attention).toEqual({ needsYou: 0, waitingOnAgent: 0, items: [] });

    const waiting = agent.tool("wait_for_feedback", { timeout_seconds: 5 });
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    listed = await list();
    expect(listed.pages[0].presence).toMatchObject({ name: "atlas", listening: true, slugs: null });

    const comment = JSON.parse((await post({ kind: "comment", body: "Too long" })).text).event;
    await waiting;
    listed = await list();
    expect(listed.pages[0].presence.listening).toBe(false);
    expect(listed.pages[0].presence.lastWaitTimedOut).toBe(false);
    expect(listed.pages[0].attention).toMatchObject({ needsYou: 0, waitingOnAgent: 1 });

    await agent.tool("reply", { slug: "naming", feedback_id: comment.id, body: "Shortened it." });
    await agent.tool("ask", { slug: "naming", question: "Which name?", choices: ["Lumen", "Arc"] });
    await agent.tool("reply", { slug: "naming", body: "Ready when you are." });
    listed = await list();
    const { attention } = listed.pages[0];
    expect(attention.needsYou).toBe(3);
    expect(attention.waitingOnAgent).toBe(0);
    expect(attention.items.map((item) => item.kind).sort()).toEqual(["chat", "question", "reply"]);
    expect(attention.items.find((item) => item.kind === "reply")).toMatchObject({ id: comment.id, excerpt: "Shortened it.", author: "atlas" });

    const question = attention.items.find((item) => item.kind === "question");
    await post({ kind: "answer", parentId: question.id, choice: "Arc" });
    await post({ kind: "chat", body: "Thanks" });
    listed = await list();
    expect(listed.pages[0].attention.items.map((item) => item.kind)).toEqual(["reply"]);
    expect(listed.pages[0].attention.waitingOnAgent).toBe(1);

    // A fresh session (the agent restarted) that picks the page up speaks as its owner.
    const restarted = mcpClient(host.mcpPort);
    await restarted.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code" } });
    await restarted.tool("reply", { slug: "naming", body: "Back." });
    listed = await list();
    expect(listed.agents.map((entry) => entry.name)).toEqual(["atlas", "atlas"]);
  });

  test("an agent publishes a page and hears back from a named reviewer", async () => {
    const { host, repoRoot } = await fixture();
    const agent = mcpClient(host.mcpPort);

    const init = await agent.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "claude-code", version: "test" },
    });
    expect(init.result.serverInfo.name).toBe("studio");
    const tools = (await agent.rpc("tools/list")).result.tools.map((tool) => tool.name);
    expect(tools).toContain("wait_for_feedback");

    const created = await agent.tool("create_page", {
      title: "Checkout copy options",
      body: "# Options\n\nA or B?",
      agent: "atlas",
      widgets: [
        { kind: "comments" },
        { kind: "form", id: "pick", fields: [{ name: "choice", type: "choice", options: ["A", "B"], required: true }] },
      ],
    });
    expect(created.page.slug).toBe("checkout-copy-options");
    expect(created.url).toBe(`http://sample-repo.studio.local:${host.publicPort}/studio/agents/checkout-copy-options`);
    expect(await readFile(join(repoRoot, ".studio/pages/checkout-copy-options.md"), "utf8")).toContain("A or B?");

    // The reviewer's browser reaches the API through the proxy, so the studio comes from Host.
    const asReviewer = (path, options) => http(host.proxyPort, path, {
      ...options,
      headers: { host: `sample-repo.studio.local:${host.publicPort}` },
    });
    const listed = JSON.parse((await asReviewer("/__studio/api/pages")).text);
    expect(listed.pages.map((page) => page.slug)).toEqual(["checkout-copy-options"]);

    const waiting = agent.tool("wait_for_feedback", { timeout_seconds: 5 });
    const anonymous = await asReviewer("/__studio/api/pages/checkout-copy-options/feedback", {
      method: "POST",
      body: { kind: "comment", body: "No name" },
    });
    expect(anonymous.status).toBe(400);
    const comment = await asReviewer("/__studio/api/pages/checkout-copy-options/feedback", {
      method: "POST",
      body: { kind: "comment", body: "B reads better", author: { name: "Rae" } },
    });
    expect(comment.status).toBe(201);
    const commentId = JSON.parse(comment.text).event.id;

    const heard = await waiting;
    expect(heard.timedOut).toBe(false);
    expect(heard.events).toHaveLength(1);
    expect(heard.events[0]).toMatchObject({ kind: "comment", body: "B reads better", author: { name: "Rae", role: "reviewer" } });

    const badForm = await asReviewer("/__studio/api/pages/checkout-copy-options/feedback", {
      method: "POST",
      body: { kind: "form_response", widgetId: "pick", data: { choice: "C" }, author: { name: "Rae" } },
    });
    expect(badForm.status).toBe(400);
    await asReviewer("/__studio/api/pages/checkout-copy-options/feedback", {
      method: "POST",
      body: { kind: "form_response", widgetId: "pick", data: { choice: "B" }, author: { name: "Rae" } },
    });
    const next = await agent.tool("wait_for_feedback", { timeout_seconds: 5 });
    expect(next.events.map((event) => event.kind)).toEqual(["form_response"]);
    expect(next.events[0].data).toEqual({ choice: "B" });

    await agent.tool("reply", { slug: "checkout-copy-options", feedback_id: commentId, body: "Going with B." });
    await agent.tool("resolve_feedback", { slug: "checkout-copy-options", feedback_id: commentId });
    const page = await agent.tool("get_page", { slug: "checkout-copy-options" });
    const thread = page.threads.find((item) => item.id === commentId);
    expect(thread.status).toBe("resolved");
    expect(thread.replies[0]).toMatchObject({ kind: "reply", author: { name: "atlas", role: "agent" } });

    // A fresh session starts from the open backlog, so the resolved comment is not replayed.
    const fresh = mcpClient(host.mcpPort);
    const backlog = await fresh.tool("wait_for_feedback", { timeout_seconds: 1 });
    expect(backlog.events.map((event) => event.kind)).toEqual(["form_response"]);
  });

  test("questions take answers from the listed choices", async () => {
    const { host } = await fixture();
    const agent = mcpClient(host.mcpPort);
    await agent.tool("create_page", { title: "Naming", body: "Pick a name." });
    const asked = await agent.tool("ask", { slug: "naming", question: "Which name?", choices: ["Lumen", "Arc"] });
    const answer = (choice) => http(host.mcpPort, "/__studio/api/pages/naming/feedback?studio=sample-repo", {
      method: "POST",
      body: { kind: "answer", parentId: asked.id, choice, author: { name: "Rae" } },
    });
    expect((await answer("Other")).status).toBe(400);
    expect((await answer("Arc")).status).toBe(201);
    const heard = await agent.tool("wait_for_feedback", { timeout_seconds: 2 });
    expect(heard.events[0]).toMatchObject({ kind: "answer", parentId: asked.id, data: { choice: "Arc" } });
  });

  test("the loopback port refuses foreign hosts and origins", async () => {
    const { host } = await fixture();
    const rebinding = await http(host.mcpPort, "/__studio/api/pages?studio=sample-repo", {
      headers: { host: "attacker.example" },
    });
    expect(rebinding.status).toBe(421);
    const crossSite = await http(host.mcpPort, "/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      headers: { origin: "https://evil.example" },
    });
    expect(crossSite.status).toBe(403);
    const plainText = await http(host.mcpPort, "/mcp", {
      method: "POST",
      headers: { "content-type": "text/plain" },
    });
    expect(plainText.status).toBe(415);
  });

  test("pages stay reachable after the dev server unregisters", async () => {
    const { host, paths, repoRoot } = await fixture();
    const agent = mcpClient(host.mcpPort);
    await agent.tool("create_page", { title: "Kept", body: "Still here." });
    const registrations = (await hostApiRequest("/v1/registrations", { paths })).body.registrations;
    const leaseId = host.registrations.get("sample-repo").leaseId;
    expect(registrations).toHaveLength(1);
    await hostApiRequest("/v1/registrations/sample-repo", { paths, method: "DELETE", body: { leaseId } });
    const studios = await agent.tool("list_studios");
    expect(studios.studios).toEqual([expect.objectContaining({ id: "sample-repo", live: false, repoRoot })]);
    const pages = await agent.tool("list_pages");
    expect(pages.pages.map((page) => page.slug)).toEqual(["kept"]);
  });
});
