import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const HOST_API_VERSION = 1;
export const DEFAULT_PROXY_PORT = 80;
export const DEFAULT_INTERNAL_PROXY_PORT = 43_150;
export const DEFAULT_CADDY_ADMIN = "127.0.0.1:2019";
export const DEFAULT_SWEEP_MS = 2_000;
export const DEFAULT_HEARTBEAT_TTL_MS = 15_000;

const MAX_BODY_BYTES = 64 * 1024;

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function normalizeRepoName(repoName) {
  const normalized = String(repoName || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63)
    .replace(/-$/g, "");

  if (!normalized) {
    throw new Error(`Cannot derive a DNS-safe hostname from repository name "${repoName}".`);
  }
  return normalized;
}

export function hostnameForRepo(repoName) {
  return `${normalizeRepoName(repoName)}.studio.local`;
}

export function readPort(value, source = "port") {
  const text = String(value);
  const port = Number.parseInt(text, 10);
  if (!Number.isInteger(port) || String(port) !== text || port < 1 || port > 65_535) {
    throw new Error(`${source} must be an integer between 1 and 65535.`);
  }
  return port;
}

function readNonNegativeInteger(value, source) {
  const text = String(value);
  const number = Number.parseInt(text, 10);
  if (!Number.isInteger(number) || String(number) !== text || number < 0) {
    throw new Error(`${source} must be a non-negative integer.`);
  }
  return number;
}

export function formatLocalUrl(hostname, port = DEFAULT_PROXY_PORT) {
  return `http://${hostname}${port === 80 ? "" : `:${port}`}`;
}

export function studioHostPaths(environment = process.env) {
  const root = resolve(environment.STUDIO_HOST_DIR || join(homedir(), ".studio", "host"));
  return {
    root,
    socket: join(root, "api.sock"),
    lock: join(root, "host.lock"),
    state: join(root, "registrations.json"),
    discovery: join(root, "discovery-processes.json"),
    log: join(root, "studio-host.log"),
    leases: join(root, "leases"),
  };
}

async function writeAtomic(path, contents, mode = 0o600) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode });
  await rename(temporaryPath, path);
  await chmod(path, mode);
}

export function processStartedAt(pid) {
  if (!Number.isInteger(pid) || pid < 1) return null;
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const startedAt = result.status === 0 ? result.stdout.trim() : "";
  return startedAt || null;
}

export function isProcessRunning(pid, expectedStartedAt) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code !== "EPERM") return false;
  }

  if (expectedStartedAt) {
    const actualStartedAt = processStartedAt(pid);
    if (actualStartedAt && actualStartedAt !== expectedStartedAt) return false;
  }
  return true;
}

function processCommand(pid) {
  if (!Number.isInteger(pid) || pid < 1) return "";
  const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function validUpstreamHost(host) {
  return typeof host === "string"
    && host.length > 0
    && host.length <= 253
    && !/[\s/:]/.test(host.replace(/^\[|\]$/g, ""));
}

function normalizeProcessMetadata(processMetadata) {
  if (processMetadata == null) return null;
  const pid = Number(processMetadata.pid);
  if (!Number.isInteger(pid) || pid < 1) {
    throw new HostApiError(400, "process.pid must be a positive integer.");
  }
  return {
    pid,
    startedAt: processMetadata.startedAt || processStartedAt(pid),
    command: typeof processMetadata.command === "string"
      ? processMetadata.command.slice(0, 1_024)
      : undefined,
  };
}

function normalizeRegistrationInput(id, input) {
  const normalizedId = normalizeRepoName(id);
  if (normalizedId !== id) {
    throw new HostApiError(400, `Registration id must be the normalized repo name "${normalizedId}".`);
  }

  const repoName = input?.repo?.name || id;
  if (normalizeRepoName(repoName) !== id) {
    throw new HostApiError(400, "repo.name does not match the registration id.");
  }
  const repoRoot = input?.repo?.root;
  const workingDirectory = input?.workingDirectory || repoRoot;
  if (!isAbsolute(repoRoot || "") || !isAbsolute(workingDirectory || "")) {
    throw new HostApiError(400, "repo.root and workingDirectory must be absolute paths.");
  }

  const upstreamHost = input?.upstream?.host || "127.0.0.1";
  if (!validUpstreamHost(upstreamHost)) {
    throw new HostApiError(400, "upstream.host must be a hostname or IP address without a scheme or port.");
  }
  let upstreamPort;
  try {
    upstreamPort = readPort(input?.upstream?.port, "upstream.port");
  } catch (error) {
    throw new HostApiError(400, error.message);
  }

  let ttlMs;
  try {
    ttlMs = readNonNegativeInteger(input?.liveness?.ttlMs ?? 0, "liveness.ttlMs");
  } catch (error) {
    throw new HostApiError(400, error.message);
  }
  const processMetadata = normalizeProcessMetadata(input.process);
  if (!processMetadata && ttlMs === 0) {
    throw new HostApiError(400, "A registration needs process metadata, a heartbeat TTL, or both.");
  }

  return {
    id,
    hostname: hostnameForRepo(repoName),
    repo: { name: repoName, root: resolve(repoRoot) },
    workingDirectory: resolve(workingDirectory),
    upstream: { host: upstreamHost, port: upstreamPort },
    process: processMetadata,
    liveness: { ttlMs },
    client: input.client && typeof input.client === "object" ? input.client : undefined,
  };
}

export class HostApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function publicRegistration(registration) {
  const { leaseId: _leaseId, ...visible } = registration;
  return visible;
}

function responseJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new HostApiError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HostApiError(400, "Request body must be valid JSON.");
  }
}

function listen(server, options) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolveListen(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options);
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function caddyRequest(adminAddress, path, { method = "GET", body } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(`http://${adminAddress}${path}`, {
      method,
      headers: payload === undefined ? undefined : {
        "content-length": Buffer.byteLength(payload),
        "content-type": "application/json",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        body: Buffer.concat(chunks).toString("utf8"),
        status: response.statusCode || 0,
      }));
    });
    request.setTimeout(1_000, () => request.destroy(new Error("Caddy request timed out.")));
    request.once("error", rejectRequest);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

function listensOnPort(listenAddresses, port) {
  return Array.isArray(listenAddresses)
    && listenAddresses.some((address) => typeof address === "string" && address.endsWith(`:${port}`));
}

async function discoverSharedCaddy(adminAddress) {
  if (!adminAddress) return null;
  try {
    const response = await caddyRequest(adminAddress, "/config/apps/http/servers");
    if (response.status !== 200) return null;
    const servers = JSON.parse(response.body);
    const match = Object.entries(servers).find(([, server]) => listensOnPort(server.listen, 80));
    return match ? { adminAddress, serverName: match[0] } : null;
  } catch {
    return null;
  }
}

export function sharedStudioRouteId(hostname) {
  return `studio_host_${hostname.replace(/[^a-z0-9]+/g, "_")}`;
}

export function renderSharedStudioRoute(hostname, proxyPort) {
  return {
    "@id": sharedStudioRouteId(hostname),
    match: [{
      host: [hostname],
      remote_ip: { ranges: ["127.0.0.0/8", "::1/128"] },
    }],
    handle: [{
      handler: "reverse_proxy",
      upstreams: [{ dial: `127.0.0.1:${proxyPort}` }],
    }],
    terminal: true,
  };
}

class SharedCaddyEdge {
  constructor(router, proxyPort) {
    this.router = router;
    this.proxyPort = proxyPort;
    this.installed = new Set();
  }

  async refreshInstalled() {
    try {
      const response = await caddyRequest(
        this.router.adminAddress,
        `/config/apps/http/servers/${encodeURIComponent(this.router.serverName)}/routes`,
      );
      if (response.status !== 200) return;
      const routes = JSON.parse(response.body);
      for (const route of Array.isArray(routes) ? routes : []) {
        if (!String(route?.["@id"] || "").startsWith("studio_host_")) continue;
        const hostname = route?.match?.[0]?.host?.[0];
        if (typeof hostname === "string" && hostname.endsWith(".studio.local")) {
          this.installed.add(hostname);
        }
      }
    } catch {
      // The edge may be between reloads. A later reconciliation will retry.
    }
  }

  async delete(hostname) {
    try {
      await caddyRequest(
        this.router.adminAddress,
        `/id/${encodeURIComponent(sharedStudioRouteId(hostname))}`,
        { method: "DELETE" },
      );
    } catch {
      // Caddy may be stopped or reloading. Reconciliation will retry as needed.
    }
    this.installed.delete(hostname);
  }

  async ensure(hostname, replace = false) {
    const idPath = `/id/${encodeURIComponent(sharedStudioRouteId(hostname))}`;
    if (!replace) {
      try {
        const existing = await caddyRequest(this.router.adminAddress, idPath);
        if (existing.status === 200) {
          this.installed.add(hostname);
          return;
        }
      } catch {
        return;
      }
    }
    if (replace) await this.delete(hostname);
    const router = await discoverSharedCaddy(this.router.adminAddress);
    if (!router) throw new Error("The shared port-80 Caddy edge is unavailable.");
    this.router = router;
    const result = await caddyRequest(
      router.adminAddress,
      `/config/apps/http/servers/${encodeURIComponent(router.serverName)}/routes`,
      { method: "POST", body: renderSharedStudioRoute(hostname, this.proxyPort) },
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Shared Caddy rejected the Studio route (${result.status}).`);
    }
    this.installed.add(hostname);
  }

  async reconcile(hostnames, replace = false) {
    await this.refreshInstalled();
    const desired = new Set(hostnames);
    await Promise.all([...this.installed]
      .filter((hostname) => !desired.has(hostname))
      .map((hostname) => this.delete(hostname)));
    for (const hostname of desired) await this.ensure(hostname, replace);
  }

  async close() {
    await Promise.all([...this.installed].map((hostname) => this.delete(hostname)));
  }
}

function hostHeaderName(header) {
  if (!header) return "";
  try {
    return new URL(`http://${header}`).hostname.toLowerCase();
  } catch {
    return String(header).split(":")[0].toLowerCase();
  }
}

function appendForwarded(existing, value) {
  return existing ? `${existing}, ${value}` : value;
}

function proxyHeaders(request, registration) {
  const headers = { ...request.headers };
  delete headers.connection;
  delete headers["proxy-connection"];
  delete headers["keep-alive"];
  delete headers.upgrade;
  headers["x-forwarded-host"] = request.headers.host || registration.hostname;
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-for"] = appendForwarded(
    request.headers["x-forwarded-for"],
    request.socket.remoteAddress || "127.0.0.1",
  );
  return headers;
}

function respondProxyError(response, status, message) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  responseJson(response, status, { ok: false, error: message });
}

export class StudioHost {
  constructor(options = {}) {
    this.environment = options.environment || process.env;
    this.paths = options.paths || studioHostPaths(this.environment);
    this.requestedProxyPort = options.proxyPort ?? Number(this.environment.STUDIO_PROXY_PORT || DEFAULT_PROXY_PORT);
    this.internalProxyPort = options.internalProxyPort
      ?? (this.environment.STUDIO_INTERNAL_PROXY_PORT
        ? Number(this.environment.STUDIO_INTERNAL_PROXY_PORT)
        : 0);
    this.caddyAdmin = options.caddyAdmin
      ?? (this.environment.STUDIO_SHARED_CADDY_ADMIN === "off"
        ? null
        : this.environment.STUDIO_SHARED_CADDY_ADMIN || DEFAULT_CADDY_ADMIN);
    this.disableMdns = options.disableMdns
      ?? this.environment.STUDIO_HOST_DISABLE_MDNS === "1";
    this.sweepMs = options.sweepMs ?? Number(this.environment.STUDIO_HOST_SWEEP_MS || DEFAULT_SWEEP_MS);
    this.registrations = new Map();
    this.mdns = new Map();
    this.edge = null;
    this.proxyPort = null;
    this.publicPort = null;
    this.startedAt = new Date().toISOString();
    this.stopping = false;
    this.reconcilePromise = Promise.resolve();
    this.closed = new Promise((resolveClosed) => {
      this.resolveClosed = resolveClosed;
    });
  }

  async acquireLock() {
    await mkdir(this.paths.root, { recursive: true, mode: 0o700 });
    await chmod(this.paths.root, 0o700);
    try {
      const handle = await open(this.paths.lock, "wx", 0o600);
      await handle.writeFile(json({ pid: process.pid, startedAt: processStartedAt(process.pid) }));
      await handle.close();
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    let lock;
    try {
      lock = JSON.parse(await readFile(this.paths.lock, "utf8"));
    } catch {
      lock = null;
    }
    if (lock && isProcessRunning(lock.pid, lock.startedAt)) {
      throw new Error(`A Studio host is already running as process ${lock.pid}.`);
    }
    await rm(this.paths.lock, { force: true });
    await rm(this.paths.socket, { force: true });
    return this.acquireLock();
  }

  async loadState() {
    let state;
    try {
      state = JSON.parse(await readFile(this.paths.state, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        await rename(this.paths.state, `${this.paths.state}.invalid-${Date.now()}`).catch(() => {});
      }
      return;
    }
    if (state?.version !== HOST_API_VERSION || !Array.isArray(state.registrations)) return;
    for (const registration of state.registrations) {
      try {
        if (
          registration?.id
          && registration.hostname === hostnameForRepo(registration.id)
          && typeof registration.leaseId === "string"
          && typeof registration.repo?.root === "string"
          && typeof registration.workingDirectory === "string"
          && validUpstreamHost(registration.upstream?.host)
          && Number.isInteger(registration.upstream?.port)
          && registration.upstream.port >= 1
          && registration.upstream.port <= 65_535
        ) {
          this.registrations.set(registration.id, registration);
        }
      } catch {
        // Ignore an individually corrupt record and reconcile the valid state.
      }
    }
  }

  async cleanupOrphanedDiscovery() {
    let entries = [];
    try {
      const saved = JSON.parse(await readFile(this.paths.discovery, "utf8"));
      if (Array.isArray(saved?.processes)) entries = saved.processes;
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        typeof entry?.hostname === "string"
        && entry.hostname.endsWith(".studio.local")
        && isProcessRunning(entry.pid, entry.startedAt)
        && processCommand(entry.pid).includes("/usr/bin/dns-sd")
        && processCommand(entry.pid).includes(entry.hostname)
      ) {
        try {
          process.kill(entry.pid, "SIGTERM");
        } catch {
          // It may have exited between validation and signaling.
        }
      }
    }
    await rm(this.paths.discovery, { force: true });
  }

  saveDiscoveryProcesses() {
    const processes = [...this.mdns.entries()].map(([hostname, entry]) => ({
      hostname,
      pid: entry.child.pid,
      startedAt: entry.startedAt,
    }));
    return writeAtomic(this.paths.discovery, json({
      version: HOST_API_VERSION,
      hostPid: process.pid,
      processes,
    }));
  }

  async saveState() {
    await writeAtomic(this.paths.state, json({
      version: HOST_API_VERSION,
      updatedAt: new Date().toISOString(),
      registrations: [...this.registrations.values()],
    }));
  }

  findRegistrationForRequest(request) {
    return [...this.registrations.values()].find(
      (registration) => registration.hostname === hostHeaderName(request.headers.host),
    );
  }

  handleProxyRequest(request, response) {
    const registration = this.findRegistrationForRequest(request);
    if (!registration) {
      respondProxyError(response, 404, "No Studio project is registered for this hostname.");
      return;
    }
    const upstreamRequest = httpRequest({
      host: registration.upstream.host,
      port: registration.upstream.port,
      method: request.method,
      path: request.url,
      headers: proxyHeaders(request, registration),
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstreamRequest.setTimeout(30_000, () => upstreamRequest.destroy(new Error("Upstream timed out.")));
    upstreamRequest.once("error", (error) => {
      respondProxyError(response, 502, `Studio upstream is unavailable: ${error.message}`);
    });
    request.pipe(upstreamRequest);
  }

  handleProxyUpgrade(request, socket, head) {
    const registration = this.findRegistrationForRequest(request);
    if (!registration) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = createConnection({
      host: registration.upstream.host,
      port: registration.upstream.port,
    });
    upstream.once("connect", () => {
      const rawHeaders = [];
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        rawHeaders.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
      }
      upstream.write(
        `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${rawHeaders.join("\r\n")}\r\n\r\n`,
      );
      if (head?.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.once("error", () => {
      if (!socket.destroyed) socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
  }

  createProxyServer() {
    const server = createHttpServer(
      (request, response) => this.handleProxyRequest(request, response),
    );
    server.on("upgrade", (request, socket, head) => this.handleProxyUpgrade(request, socket, head));
    server.on("clientError", (_error, socket) => {
      if (!socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    });
    return server;
  }

  async startProxy() {
    this.proxyServer = this.createProxyServer();
    try {
      const address = await listen(this.proxyServer, {
        host: "127.0.0.1",
        port: this.requestedProxyPort,
      });
      this.proxyPort = address.port;
      this.publicPort = address.port;
      return;
    } catch (error) {
      await closeServer(this.proxyServer);
      if (
        this.requestedProxyPort !== 80
        || (error?.code !== "EADDRINUSE" && error?.code !== "EACCES")
      ) throw error;
    }

    const sharedRouter = await discoverSharedCaddy(this.caddyAdmin);
    if (!sharedRouter) {
      throw new Error(
        "Studio could not claim localhost port 80 and no shared Caddy edge was found at "
        + `${this.caddyAdmin || "the configured admin address"}. Stop the conflicting service or configure `
        + "STUDIO_SHARED_CADDY_ADMIN.",
      );
    }
    this.proxyServer = this.createProxyServer();
    const address = await listen(this.proxyServer, {
      host: "127.0.0.1",
      port: this.internalProxyPort,
    });
    this.proxyPort = address.port;
    this.publicPort = 80;
    this.edge = new SharedCaddyEdge(sharedRouter, this.proxyPort);
  }

  async startControlServer() {
    await rm(this.paths.socket, { force: true });
    this.controlServer = createHttpServer((request, response) => {
      this.handleApiRequest(request, response).catch((error) => {
        const status = error instanceof HostApiError ? error.status : 500;
        responseJson(response, status, {
          ok: false,
          error: error.message || String(error),
          details: error.details,
        });
      });
    });
    await listen(this.controlServer, this.paths.socket);
    await chmod(this.paths.socket, 0o600);
  }

  async start() {
    await this.acquireLock();
    try {
      await this.loadState();
      await this.cleanupOrphanedDiscovery();
      await this.startProxy();
      await this.reconcile({ replaceEdgeRoutes: true });
      await this.startControlServer();
      this.timer = setInterval(() => {
        this.reconcilePromise = this.reconcilePromise
          .then(() => this.reconcile())
          .catch((error) => this.log(`reconcile failed: ${error.message}`));
      }, this.sweepMs);
      return this;
    } catch (error) {
      await this.stop({ preserveState: true });
      throw error;
    }
  }

  log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    writeFile(this.paths.log, line, { flag: "a" }).catch(() => {});
  }

  async registrationIsStale(registration, now = Date.now()) {
    try {
      const [repoStat, workingStat] = await Promise.all([
        stat(registration.repo.root),
        stat(registration.workingDirectory),
      ]);
      if (!repoStat.isDirectory() || !workingStat.isDirectory()) return true;
    } catch {
      return true;
    }
    if (
      registration.process
      && !isProcessRunning(registration.process.pid, registration.process.startedAt)
    ) return true;
    return Boolean(registration.expiresAt && Date.parse(registration.expiresAt) <= now);
  }

  spawnMdns(registration) {
    if (this.disableMdns || process.platform !== "darwin") return;
    const existing = this.mdns.get(registration.hostname);
    if (existing && existing.child.exitCode === null && existing.port === this.publicPort) return;
    if (existing?.child.exitCode === null) existing.child.kill("SIGTERM");
    const child = spawn("/usr/bin/dns-sd", [
      "-P",
      `Studio ${registration.repo.name}`,
      "_http._tcp",
      "local",
      String(this.publicPort),
      registration.hostname,
      "127.0.0.1",
      "path=/",
    ], { stdio: "ignore" });
    child.once("error", (error) => this.log(`mDNS ${registration.hostname}: ${error.message}`));
    this.mdns.set(registration.hostname, {
      child,
      port: this.publicPort,
      startedAt: processStartedAt(child.pid),
    });
    this.saveDiscoveryProcesses().catch(() => {});
  }

  stopMdns(hostname) {
    const entry = this.mdns.get(hostname);
    if (entry?.child.exitCode === null) entry.child.kill("SIGTERM");
    this.mdns.delete(hostname);
    this.saveDiscoveryProcesses().catch(() => {});
  }

  async reconcile({ replaceEdgeRoutes = false } = {}) {
    const removed = [];
    for (const [id, registration] of this.registrations) {
      if (await this.registrationIsStale(registration)) {
        this.registrations.delete(id);
        this.stopMdns(registration.hostname);
        removed.push(registration.hostname);
        this.log(`removed stale registration ${registration.hostname}`);
      }
    }
    if (removed.length > 0) await this.saveState();

    const registrations = [...this.registrations.values()];
    for (const registration of registrations) this.spawnMdns(registration);
    const desiredHostnames = new Set(registrations.map((registration) => registration.hostname));
    for (const hostname of this.mdns.keys()) {
      if (!desiredHostnames.has(hostname)) this.stopMdns(hostname);
    }
    if (this.edge) {
      await this.edge.reconcile(desiredHostnames, replaceEdgeRoutes);
    }
    return { removed };
  }

  async upsertRegistration(id, input) {
    const normalized = normalizeRegistrationInput(id, input);
    const current = this.registrations.get(id);
    if (current && input.leaseId && input.leaseId !== current.leaseId) {
      throw new HostApiError(409, "The registration lease has changed; register again to take ownership.");
    }
    if (current && current.repo.root !== normalized.repo.root && input.leaseId !== current.leaseId) {
      throw new HostApiError(
        409,
        `${current.hostname} is already owned by a different repository root.`,
        { repoRoot: current.repo.root },
      );
    }
    const now = new Date();
    const sameProcess = Boolean(
      current?.process
      && normalized.process
      && current.process.pid === normalized.process.pid
      && (!current.process.startedAt || current.process.startedAt === normalized.process.startedAt),
    );
    const leaseId = current && (input.leaseId === current.leaseId || sameProcess)
      ? current.leaseId
      : randomUUID();
    const registration = {
      ...normalized,
      leaseId,
      createdAt: current?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      expiresAt: normalized.liveness.ttlMs > 0
        ? new Date(now.getTime() + normalized.liveness.ttlMs).toISOString()
        : null,
    };
    this.registrations.set(id, registration);
    await this.saveState();
    this.spawnMdns(registration);
    if (this.edge) await this.edge.ensure(registration.hostname);
    return { created: !current, registration, leaseId };
  }

  requireLease(id, leaseId) {
    const registration = this.registrations.get(id);
    if (!registration) throw new HostApiError(404, "Registration not found.");
    if (!leaseId || leaseId !== registration.leaseId) {
      throw new HostApiError(409, "The registration lease is missing or no longer current.");
    }
    return registration;
  }

  async heartbeat(id, input) {
    const current = this.requireLease(id, input.leaseId);
    const nextInput = {
      repo: current.repo,
      workingDirectory: input.workingDirectory || current.workingDirectory,
      upstream: input.upstream || current.upstream,
      process: input.process === undefined ? current.process : input.process,
      liveness: input.liveness || current.liveness,
      client: input.client || current.client,
      leaseId: current.leaseId,
    };
    return this.upsertRegistration(id, nextInput);
  }

  async unregister(id, leaseId) {
    const current = this.requireLease(id, leaseId);
    this.registrations.delete(id);
    this.stopMdns(current.hostname);
    if (this.edge) await this.edge.delete(current.hostname);
    await this.saveState();
    return current;
  }

  status() {
    return {
      ok: true,
      apiVersion: HOST_API_VERSION,
      pid: process.pid,
      startedAt: this.startedAt,
      edge: this.edge ? "shared-caddy" : "direct",
      proxyPort: this.proxyPort,
      publicPort: this.publicPort,
      registrationCount: this.registrations.size,
    };
  }

  async handleApiRequest(request, response) {
    const url = new URL(request.url, "http://studio-host.local");
    if (request.method === "GET" && (url.pathname === "/v1/health" || url.pathname === "/v1/status")) {
      responseJson(response, 200, this.status());
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/registrations") {
      responseJson(response, 200, {
        ok: true,
        registrations: [...this.registrations.values()].map(publicRegistration),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/shutdown") {
      responseJson(response, 202, { ok: true });
      setTimeout(() => this.stop({ preserveState: true }), 10).unref();
      return;
    }

    const match = url.pathname.match(/^\/v1\/registrations\/([a-z0-9-]+)(\/heartbeat)?$/);
    if (!match) throw new HostApiError(404, "API endpoint not found.");
    const id = match[1];
    if (request.method === "PUT" && !match[2]) {
      const result = await this.upsertRegistration(id, await readJsonBody(request));
      responseJson(response, result.created ? 201 : 200, {
        ok: true,
        leaseId: result.leaseId,
        registration: publicRegistration(result.registration),
        url: formatLocalUrl(result.registration.hostname, this.publicPort),
      });
      return;
    }
    if (request.method === "POST" && match[2]) {
      const result = await this.heartbeat(id, await readJsonBody(request));
      responseJson(response, 200, {
        ok: true,
        leaseId: result.leaseId,
        registration: publicRegistration(result.registration),
        url: formatLocalUrl(result.registration.hostname, this.publicPort),
      });
      return;
    }
    if (request.method === "DELETE" && !match[2]) {
      const body = await readJsonBody(request);
      const registration = await this.unregister(id, body.leaseId);
      responseJson(response, 200, { ok: true, registration: publicRegistration(registration) });
      return;
    }
    throw new HostApiError(405, "Method not allowed.");
  }

  async stop({ preserveState = true } = {}) {
    if (this.stopping) return this.stopped;
    this.stopping = true;
    this.stopped = (async () => {
      clearInterval(this.timer);
      await this.reconcilePromise.catch(() => {});
      await closeServer(this.controlServer);
      await closeServer(this.proxyServer);
      if (this.edge) await this.edge.close();
      for (const hostname of [...this.mdns.keys()]) this.stopMdns(hostname);
      await this.saveDiscoveryProcesses().catch(() => {});
      if (!preserveState) {
        this.registrations.clear();
        await this.saveState().catch(() => {});
      }
      await rm(this.paths.socket, { force: true });
      await rm(this.paths.lock, { force: true });
      this.resolveClosed();
    })();
    return this.stopped;
  }

  waitUntilStopped() {
    return this.closed;
  }
}

export async function startStudioHost(options = {}) {
  const host = new StudioHost(options);
  await host.start();
  return host;
}

export async function hostApiRequest(path, options = {}) {
  const paths = options.paths || studioHostPaths(options.environment);
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({
      socketPath: paths.socket,
      path,
      method: options.method || "GET",
      headers: payload === undefined ? undefined : {
        "content-length": Buffer.byteLength(payload),
        "content-type": "application/json",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { ok: false, error: text || "Invalid response from Studio host." };
        }
        const result = { body, status: response.statusCode || 0 };
        if (options.throwOnError !== false && result.status >= 400) {
          rejectRequest(new HostApiError(result.status, body?.error || `Studio host returned ${result.status}.`, body?.details));
        } else {
          resolveRequest(result);
        }
      });
    });
    request.setTimeout(options.timeoutMs || 2_000, () => {
      request.destroy(new Error("Timed out connecting to the Studio host."));
    });
    request.once("error", rejectRequest);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

export async function waitForStudioHost(options = {}) {
  const timeoutMs = options.timeoutMs || 5_000;
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await hostApiRequest("/v1/health", { ...options, timeoutMs: 500 });
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw new Error(`Studio host did not become ready: ${lastError?.message || "timed out"}`);
}
