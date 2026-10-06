// Runs under node, which is what the host runs on: bun's sockets do not surface
// the reset as an 'error' event, so the crash this guards against only shows here.
// Also checks that an open upgraded socket cannot keep the host from stopping.
import { createServer, get } from "node:http";
import { connect } from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostApiRequest, startStudioHost, studioHostPaths } from "../../bin/local-host.mjs";

const root = await mkdtemp(join(tmpdir(), "studio-upgrade-drop-"));
const repoRoot = join(root, "repo");
await mkdir(repoRoot);
const upstream = createServer((_request, response) => response.end("alive"));
upstream.on("upgrade", (_request, socket) => {
  socket.on("error", () => {});
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
  const timer = setInterval(() => socket.write("tick".repeat(256)), 2);
  socket.on("close", () => clearInterval(timer));
});
await new Promise((resolveListen) => upstream.listen(0, "127.0.0.1", resolveListen));
const paths = studioHostPaths({ STUDIO_HOST_DIR: join(root, "host") });
const host = await startStudioHost({ disableMdns: true, paths, proxyPort: 0, mcpPort: null, sweepMs: 10_000 });
await hostApiRequest("/v1/registrations/repo", {
  paths,
  method: "PUT",
  body: {
    repo: { name: "repo", root: repoRoot },
    workingDirectory: repoRoot,
    upstream: { host: "127.0.0.1", port: upstream.address().port },
    process: { pid: process.pid },
    liveness: { ttlMs: 0 },
  },
});

for (let attempt = 0; attempt < 20; attempt += 1) {
  const client = connect(host.proxyPort, "127.0.0.1");
  client.on("error", () => {});
  client.write("GET /_next/webpack-hmr HTTP/1.1\r\nHost: repo.studio.local\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
  await new Promise((resolveData) => client.once("data", resolveData));
  // An abrupt reset, like a killed tab, makes the proxy's next write fail.
  client.resetAndDestroy();
}
await new Promise((resolveWait) => setTimeout(resolveWait, 300));
const body = await new Promise((resolveBody, rejectBody) => {
  get({ host: "127.0.0.1", port: host.proxyPort, path: "/after", headers: { host: "repo.studio.local" } }, (response) => {
    let text = "";
    response.on("data", (chunk) => { text += chunk; });
    response.on("end", () => resolveBody(text));
  }).on("error", rejectBody);
});
console.log(`survived ${body}`);

// A tab left open holds an upgraded socket; stopping must not wait on it.
const lingering = connect(host.proxyPort, "127.0.0.1");
lingering.on("error", () => {});
lingering.write("GET /_next/webpack-hmr HTTP/1.1\r\nHost: repo.studio.local\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
await new Promise((resolveData) => lingering.once("data", resolveData));
const stopped = await Promise.race([
  host.stop({ preserveState: false }).then(() => "stopped"),
  new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("stop hung"), 3_000)),
]);
console.log(stopped);

upstream.closeAllConnections();
upstream.close();
await rm(root, { recursive: true, force: true });
process.exit(0);
