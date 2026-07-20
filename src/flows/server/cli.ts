#!/usr/bin/env bun
import { startServer } from "./mcp-http";
import { DEFAULT_HOST, DEFAULT_PORT } from "../model";
import * as store from "./store";

const USAGE = `studio-flows — spatial product flows for Studio

USAGE
  studio-flows serve [--port N] [--host HOST]
  studio-flows doctor [--port N] [--host HOST]
  studio-flows list
  studio-flows create <name>
  studio-flows path

ENV
  STUDIO_FLOWS_ROOT  Library (default: ~/.studio/flows)
  STUDIO_FLOWS_PORT  Service port (default ${DEFAULT_PORT})
  STUDIO_FLOWS_HOST  Bind host (default ${DEFAULT_HOST})
`;

function readServeOptions(args: string[]) {
  let port = Number(process.env.STUDIO_FLOWS_PORT ?? DEFAULT_PORT);
  let host = process.env.STUDIO_FLOWS_HOST ?? DEFAULT_HOST;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--port") port = Number(args[++index]);
    if (args[index] === "--host") host = String(args[++index]);
  }
  return { host, port };
}

async function doctor(args: string[]): Promise<number> {
  const { host, port } = readServeOptions(args);
  try {
    const health = await fetch(`http://${host}:${port}/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
    const payload = (await health.json()) as { name?: string; mcp?: string };
    console.log("Studio Flows doctor");
    console.log(`  service: http://${host}:${port} (${payload.name ?? "ok"})`);
    console.log(`  mcp:     ${payload.mcp ?? `http://${host}:${port}/mcp`}`);
    console.log(`  root:    ${store.libraryRoot()}`);
    return 0;
  } catch (error) {
    console.error("doctor: Studio Flows is not reachable");
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }

  if (command === "serve") {
    const { host, port } = readServeOptions(args);
    await store.ensureLibrary();
    const server = startServer({ host, port });
    console.log(`Studio Flows service ${server.url}`);
    console.log(`Library: ${store.libraryRoot()}`);
    console.log(`MCP: ${server.url}/mcp`);
    await new Promise(() => {});
    return;
  }

  if (command === "doctor") {
    process.exitCode = await doctor(args);
    return;
  }

  if (command === "list") {
    const files = await store.listFiles();
    if (!files.length) {
      console.log(`(empty) ${store.libraryRoot()}`);
      return;
    }
    for (const file of files) {
      console.log(`${file.id}\t${file.pageCount} pages\t${file.name}\t${file.updatedAt}`);
    }
    return;
  }

  if (command === "create") {
    const name = args.join(" ").trim() || "Untitled";
    const file = await store.createFile(name);
    console.log(JSON.stringify({
      fileId: file.id,
      name: file.name,
      path: store.resolveFilePath(file.id),
    }, null, 2));
    return;
  }

  if (command === "path") {
    console.log(store.libraryRoot());
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log(USAGE);
  process.exitCode = 1;
}

await main();
