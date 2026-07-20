/**
 * Smoke: whole product map in one create_product_map call.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./mcp-http";
import { callTool } from "./tools";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "studio-flows-smoke-"));
  process.env.STUDIO_FLOWS_ROOT = root;
  process.env.STUDIO_FLOWS_PORT = "29981";

  const server = startServer({ host: "127.0.0.1", port: 29981 });
  const sessionId = "smoke-session";

  try {
    const packs = await callTool(sessionId, "list_packs", {});
    if (packs.isError) throw new Error(packs.content[0]?.text);
    const packList = JSON.parse(packs.content[0]!.text);
    if (!packList.packs?.some((p: { id: string }) => p.id === "product-core")) {
      throw new Error("product-core pack missing");
    }

    // One call → entire multi-role product journey
    const map = await callTool(sessionId, "create_product_map", {
      pack: "product-core",
    });
    if (map.isError) throw new Error(map.content[0]?.text);
    const product = JSON.parse(map.content[0]!.text);
    if (product.journeyCount !== 3) throw new Error(`journeys ${product.journeyCount}`);
    if (product.pageCount !== 10) throw new Error(`pages ${product.pageCount}`);

    const info = await callTool(sessionId, "get_basic_info", {});
    const basic = JSON.parse(info.content[0]!.text);
    const names = basic.journeys.map((j: { name: string }) => j.name);
    if (JSON.stringify(names) !== JSON.stringify(["Acquisition", "Core loop", "Return"])) {
      throw new Error(`journey order: ${names.join(",")}`);
    }
    // Rows stack top→bottom
    for (let i = 1; i < basic.journeys.length; i++) {
      if (!(basic.journeys[i].y > basic.journeys[i - 1].y)) {
        throw new Error("layout_journeys row order wrong");
      }
    }

    // Fill the first core-loop page body.
    const core = product.journeys.find((j: { name: string }) => j.name === "Core loop");
    const home = core.pages[0];
    const tree = await callTool(sessionId, "get_tree", { pageId: home.pageId });
    const treeBody = JSON.parse(tree.content[0]!.text);
    const bodyId = treeBody.root.children?.[1]?.id;
    if (!bodyId) throw new Error("app-shell body missing");

    await callTool(sessionId, "upsert_node", {
      pageId: home.pageId,
      parentId: bodyId,
      type: "Text",
      props: {
        text: "Make the decision boundary honest again",
        size: 28,
        weight: 700,
        serif: true,
        color: "var(--ink)",
      },
    });
    await callTool(sessionId, "upsert_node", {
      pageId: home.pageId,
      parentId: bodyId,
      type: "HudButton",
      props: { label: "Start work" },
    });

    // Custom single-journey product map
    const custom = await callTool(sessionId, "create_product_map", {
      name: "Custom flow",
      journeys: [{ name: "Onboarding", pages: ["Welcome", "Setup", "Done"], scaffold: "doc" }],
    });
    if (custom.isError) throw new Error(custom.content[0]?.text);
    const customOut = JSON.parse(custom.content[0]!.text);
    if (customOut.pageCount !== 3) throw new Error("custom map page count");

    // Bring one page into Studio (explicit fileId — later maps open sticky)
    const studio = await callTool(sessionId, "open_in_studio", {
      pageId: home.pageId,
      fileId: product.fileId,
      studioBase: "http://localhost:3033",
    });
    if (studio.isError) throw new Error(studio.content[0]?.text);
    const handoff = JSON.parse(studio.content[0]!.text);
    if (!handoff.studioUrl?.includes("/flows")) {
      throw new Error(`bad studioUrl: ${handoff.studioUrl}`);
    }
    if (!handoff.flowApiUrl?.includes("/api/files/")) {
      throw new Error(`bad flowApiUrl: ${handoff.flowApiUrl}`);
    }

    // REST: page payload
    const apiRes = await fetch(handoff.flowApiUrl);
    if (!apiRes.ok) throw new Error(`page API ${apiRes.status}`);
    const apiPage = await apiRes.json();
    if (apiPage.page?.id !== home.pageId) throw new Error("API page id mismatch");

    console.log("smoke ok (agent journey layout + studio handoff)");
    console.log(`  pack: product-core → ${product.journeyCount} journeys, ${product.pageCount} pages`);
    console.log(`  rows: ${names.join(" → ")}`);
    console.log(`  y: ${basic.journeys.map((j: { y: number }) => j.y).join(", ")}`);
    console.log(`  studio: ${handoff.studioUrl}`);
  } finally {
    server.stop();
    await rm(root, { recursive: true, force: true });
  }
}

await main();
