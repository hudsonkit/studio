import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

/**
 * Filesystem discovery for the Studio host. Agents should not need to know a
 * port: they walk up from their working directory to the nearest
 * `.studio/studio.json` (the dev root's, then `~/.studio`'s) and read how to
 * reach the MCP, how to start the host, and what spaces and pages exist.
 *
 *   ~/.studio/config.json      user-owned settings (MCP port, dev root)
 *   <home>/studio.json         daemon-written manifest: server + MCP connection
 *   <home>/inventory.json      daemon-written list of spaces and their pages
 *   <home>/README.md           what these files are, for people and agents
 *
 * The daemon writes the manifest, inventory and README to `~/.studio` and
 * mirrors them into `<devRoot>/.studio` so an agent anywhere under the dev
 * root finds them on its way up.
 */

export const DISCOVERY_VERSION = 1;
export const MANIFEST_FILE = "studio.json";
export const INVENTORY_FILE = "inventory.json";
export const CONFIG_FILE = "config.json";
export const README_FILE = "README.md";

const WRITE_DEBOUNCE_MS = 250;

const DEFAULT_CONFIG = {
  version: DISCOVERY_VERSION,
  mcp: { enabled: true, port: null },
  devRoot: null,
};

/** The Studio home: STUDIO_HOME, else the parent of the host dir, else ~/.studio. */
export function studioHomeDir(environment = process.env, hostRoot) {
  if (environment.STUDIO_HOME) return resolve(environment.STUDIO_HOME);
  if (hostRoot) return dirname(resolve(hostRoot));
  if (environment.STUDIO_HOST_DIR) return dirname(resolve(environment.STUDIO_HOST_DIR));
  return join(homedir(), ".studio");
}

async function writeIfChanged(path, contents) {
  try {
    if (await readFile(path, "utf8") === contents) return false;
  } catch {
    // Missing or unreadable: write it.
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o755 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, path);
  await chmod(path, 0o644);
  return true;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Reads config.json, falling back to defaults for missing or malformed keys. */
export async function readStudioConfig(home) {
  let saved = {};
  try {
    saved = JSON.parse(await readFile(join(home, CONFIG_FILE), "utf8")) ?? {};
  } catch {
    // No config yet, or not JSON: defaults apply and ensureStudioConfig leaves the file alone.
  }
  const mcp = typeof saved.mcp === "object" && saved.mcp ? saved.mcp : {};
  return {
    version: DISCOVERY_VERSION,
    mcp: {
      enabled: mcp.enabled !== false,
      port: Number.isInteger(mcp.port) && mcp.port >= 0 && mcp.port <= 65_535 ? mcp.port : null,
    },
    devRoot: typeof saved.devRoot === "string" && saved.devRoot ? resolve(saved.devRoot.replace(/^~(?=$|\/)/, homedir())) : null,
  };
}

/** Creates config.json with defaults when missing; never rewrites a user's file. */
export async function ensureStudioConfig(home) {
  const path = join(home, CONFIG_FILE);
  if (!existsSync(path)) {
    await mkdir(home, { recursive: true, mode: 0o755 });
    await writeFile(path, json(DEFAULT_CONFIG), { encoding: "utf8", mode: 0o644, flag: "wx" }).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
  }
  return readStudioConfig(home);
}

/**
 * MCP port precedence: explicit option, then STUDIO_MCP_PORT, then config,
 * then the default. Returns null when the MCP is turned off.
 */
export function resolveMcpPort({ option, environment = process.env, config, fallback }) {
  const setting = option ?? environment.STUDIO_MCP_PORT;
  if (setting === "off" || setting === false) return null;
  if (setting !== undefined && setting !== "") return Number(setting);
  if (config?.mcp?.enabled === false) return null;
  return config?.mcp?.port ?? fallback;
}

function isInside(child, parent) {
  const path = relative(parent, child);
  return Boolean(path) && !path.startsWith("..") && !isAbsolute(path);
}

function commonAncestor(paths) {
  const split = paths.map((path) => resolve(path).split(sep));
  const shared = [];
  for (let index = 0; index < split[0].length; index += 1) {
    const part = split[0][index];
    if (split.every((parts) => parts[index] === part)) shared.push(part);
    else break;
  }
  return shared.join(sep) || parse(paths[0]).root;
}

/**
 * Where dev work lives: the configured devRoot, else the common ancestor of
 * the folders holding known repos, as long as it sits strictly inside the
 * user's home (so `~/dev`, never `~` or `/`). Null when nothing qualifies.
 */
export function resolveDevRoot({ configured, repoRoots = [], userHome = homedir() }) {
  if (configured) return configured;
  const parents = repoRoots.filter((root) => isAbsolute(root || "")).map((root) => dirname(resolve(root)));
  if (parents.length === 0) return null;
  const ancestor = commonAncestor(parents);
  return isInside(ancestor, resolve(userHome)) ? ancestor : null;
}

async function readProjectLabel(repoRoot) {
  try {
    const project = JSON.parse(await readFile(join(repoRoot, ".studio", "project.json"), "utf8"));
    return typeof project?.label === "string" ? project.label : undefined;
  } catch {
    return undefined;
  }
}

/** Agent-facing description of every space (studio) and its pages. */
export async function buildInventory({ studios, summarizePages, generatedAt = new Date().toISOString() }) {
  const spaces = [];
  for (const studio of studios) {
    let pages = [];
    let error;
    try {
      pages = await summarizePages(studio);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const base = studio.url.replace(/\/$/, "");
    spaces.push({
      id: studio.id,
      label: await readProjectLabel(studio.repoRoot) ?? studio.id,
      root: studio.repoRoot,
      hostname: studio.hostname,
      url: studio.url,
      live: studio.live,
      lastSeenAt: studio.lastSeenAt,
      pagesDir: join(studio.repoRoot, ".studio", "pages"),
      feedbackDir: join(studio.repoRoot, ".studio", "feedback"),
      ...(error ? { error } : {}),
      pages: pages.map((page) => ({ ...page, url: `${base}${page.href}` })),
    });
  }
  return {
    version: DISCOVERY_VERSION,
    generatedAt,
    totals: {
      spaces: spaces.length,
      live: spaces.filter((space) => space.live).length,
      pages: spaces.reduce((sum, space) => sum + space.pages.length, 0),
      openFeedback: spaces.reduce(
        (sum, space) => sum + space.pages.reduce((pageSum, page) => pageSum + (page.feedback?.open ?? 0), 0),
        0,
      ),
    },
    spaces,
  };
}

/** The manifest an agent reads to find and connect to the Studio MCP. */
export function buildManifest({
  home,
  devRoot,
  running,
  pid,
  startedAt,
  stoppedAt,
  hostPaths,
  publicPort,
  mcpUrl,
  mcpPort,
  protocolVersion,
  tools = [],
  generatedAt = new Date().toISOString(),
}) {
  const apiUrl = mcpPort ? `http://127.0.0.1:${mcpPort}/__studio/api` : null;
  return {
    version: DISCOVERY_VERSION,
    kind: "studio-home",
    generatedAt,
    home,
    devRoot: devRoot ?? null,
    locations: [home, ...(devRoot ? [join(devRoot, ".studio")] : [])],
    files: {
      config: join(home, CONFIG_FILE),
      inventory: join(home, INVENTORY_FILE),
      readme: join(home, README_FILE),
    },
    server: {
      running,
      pid: running ? pid : null,
      startedAt,
      ...(stoppedAt ? { stoppedAt } : {}),
      publicPort: publicPort ?? null,
      controlSocket: hostPaths.socket,
      log: hostPaths.log,
      commands: {
        start: "studio host start",
        stop: "studio host stop",
        status: "studio host status",
        mcp: "studio mcp",
      },
    },
    mcp: {
      name: "studio",
      transport: "streamable-http",
      available: Boolean(running && mcpUrl),
      url: mcpUrl ?? null,
      port: mcpPort ?? null,
      api: apiUrl,
      protocolVersion,
      tools,
      connect: mcpUrl
        ? {
          claudeCode: `claude mcp add --transport http studio ${mcpUrl}`,
          mcpJson: { mcpServers: { studio: { type: "http", url: mcpUrl } } },
        }
        : null,
    },
  };
}

export function renderReadme({ home, devRoot }) {
  return `# .studio

Written by the Studio host daemon. Agents: read \`studio.json\` here to connect.

- \`studio.json\` — is the host running, how to start it, and the MCP url,
  transport and connect snippets (\`mcp.connect\`). If \`server.running\` is
  false, run \`studio host start\` (or \`studio mcp\`), then read it again.
- \`inventory.json\` — every space (a repo running Studio) with its url, whether
  it is live, and its agent pages with open feedback counts.
- \`config.json\` — user settings, only in the home (${home}):
  \`mcp.port\`, \`mcp.enabled\`, \`devRoot\`. Restart the host after editing.

Discovery: walk up from your working directory to the first
\`.studio/studio.json\`; fall back to \`~/.studio/studio.json\`.
${devRoot ? `\nThis machine's dev root is ${devRoot}; these files are mirrored into its \`.studio\`.\n` : ""}
Pages and feedback themselves live in each repo's \`.studio/pages\` and
\`.studio/feedback\`. Use the MCP tools to change them rather than editing files.
`;
}

/**
 * Walks up from cwd to the nearest `.studio/studio.json`, then tries
 * `~/.studio/studio.json`. Returns { path, manifest } or null.
 */
export async function findStudioManifest(cwd = process.cwd(), { userHome = homedir() } = {}) {
  const candidates = [];
  let directory = resolve(cwd);
  for (;;) {
    candidates.push(join(directory, ".studio", MANIFEST_FILE));
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  candidates.push(join(userHome, ".studio", MANIFEST_FILE));
  for (const path of candidates) {
    try {
      return { path, manifest: JSON.parse(await readFile(path, "utf8")) };
    } catch {
      // Keep walking.
    }
  }
  return null;
}

/**
 * Keeps the discovery files current for a running host. `schedule()` coalesces
 * bursts of changes into one write; writes never overlap.
 */
export class StudioDiscovery {
  /**
   * @param {object} options
   * @param {string} options.home
   * @param {() => object} options.manifestInput  buildManifest input minus home/devRoot
   * @param {() => Array<object>} options.listStudios
   * @param {(studio: object) => Promise<Array<object>>} options.summarizePages
   * @param {string | null} [options.configuredDevRoot]
   * @param {boolean} [options.deriveDevRoot]  Off when the home is not ~/.studio, so tests stay in tmp.
   * @param {string} [options.userHome]
   * @param {(message: string) => void} [options.log]
   */
  constructor(options) {
    this.options = options;
    this.home = options.home;
    this.devRoot = null;
    this.timer = null;
    this.writes = Promise.resolve();
    this.active = false;
  }

  start() {
    this.active = true;
    return this.write();
  }

  schedule() {
    if (!this.active || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write();
    }, WRITE_DEBOUNCE_MS);
    this.timer.unref?.();
  }

  /** Writes now, after any write already in flight. */
  write() {
    clearTimeout(this.timer);
    this.timer = null;
    this.writes = this.writes
      .then(() => this.writeOnce())
      .catch((error) => this.options.log?.(`discovery write failed: ${error.message}`));
    return this.writes;
  }

  /** Final write that marks the server stopped. */
  async stop() {
    if (!this.active) return;
    this.active = false;
    await this.write();
  }

  resolveDevRoot(studios) {
    const devRoot = resolveDevRoot({
      configured: this.options.configuredDevRoot,
      repoRoots: this.options.deriveDevRoot === false && !this.options.configuredDevRoot
        ? []
        : studios.map((studio) => studio.repoRoot),
      userHome: this.options.userHome,
    });
    if (!devRoot || resolve(devRoot) === resolve(dirname(this.home))) return null;
    // A dev root that is itself a Studio repo keeps its .studio for the repo.
    if (existsSync(join(devRoot, ".studio", "project.json"))) return null;
    return devRoot;
  }

  async writeOnce() {
    const studios = this.options.listStudios();
    const devRoot = this.resolveDevRoot(studios);
    this.devRoot = devRoot;
    const manifest = buildManifest({ ...this.options.manifestInput(), home: this.home, devRoot });
    const inventory = await buildInventory({ studios, summarizePages: this.options.summarizePages });
    const readme = renderReadme({ home: this.home, devRoot });
    const targets = [this.home, ...(devRoot ? [join(devRoot, ".studio")] : [])];
    for (const directory of targets) {
      // generatedAt changes every write, so compare without it to skip no-op rewrites.
      await writeStamped(join(directory, MANIFEST_FILE), manifest);
      await writeStamped(join(directory, INVENTORY_FILE), inventory);
      await writeIfChanged(join(directory, README_FILE), readme);
    }
    return { manifest, inventory, devRoot };
  }
}

async function writeStamped(path, value) {
  try {
    const previous = JSON.parse(await readFile(path, "utf8"));
    if (json({ ...previous, generatedAt: value.generatedAt }) === json(value)) return false;
  } catch {
    // Missing or malformed: write it.
  }
  return writeIfChanged(path, json(value));
}
