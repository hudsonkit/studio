#!/usr/bin/env node
/**
 * `studio deploy` — ship the Studio application server to a remote VM.
 *
 * The VM is the compute host: sources are rsync'd over SSH, dependencies are
 * installed and the Next app is built on the VM, releases are kept versioned,
 * and a systemd service serves the current release bound to the tailnet
 * interface only. No asset server, no registry beyond the filesystem.
 *
 * Layout on the remote host:
 *
 *   ~/studio-cloud/<release-id>/studio/                 this repository
 *   ~/studio-cloud/<release-id>/hudson/packages/web/hudsonkit/
 *   ~/studio-cloud/<release-id>/lattices/design/studio/
 *   ~/studio-cloud/<release-id>/action/design/studio/   workspace stub (unused at build time)
 *   ~/studio-cloud/current -> <release-id>              atomic flip target
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const REMOTE_BASE = 'studio-cloud';

function parseDeployArgs(argv) {
  const parsed = {
    help: false,
    json: false,
    skipBuild: false,
    keep: 5,
    port: 43210,
    host: 'ocean-iron.exe.xyz',
    user: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--skip-build') parsed.skipBuild = true;
    else if (arg === '--host') parsed.host = argv[++i];
    else if (arg === '--user') parsed.user = argv[++i];
    else if (arg === '--port') parsed.port = Number(argv[++i]);
    else if (arg === '--keep') parsed.keep = Number(argv[++i]);
    else throw new Error(`Unknown deploy flag: ${arg}`);
  }

  if (!parsed.host) throw new Error('--host is required');
  return parsed;
}

function destination(parsed) {
  return parsed.user ? `${parsed.user}@${parsed.host}` : parsed.host;
}

async function sshCapture(parsed, script, options = {}) {
  const dest = destination(parsed);
  try {
    return execFileSync('ssh', ['-o', 'BatchMode=yes', dest, script], { encoding: 'utf8' });
  } catch (error) {
    if (options.allowFailure && error.stdout) return error.stdout;
    throw error;
  }
}

/** Run a local command, inheriting stdio so rsync progress and ssh errors show. */
function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

async function ssh(parsed, script) {
  const dest = destination(parsed);
  run('ssh', ['-o', 'BatchMode=yes', dest, script]);
}

function releaseId() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  let sha = 'nogit';
  try {
    sha = capture('git', ['-C', REPO_ROOT, 'rev-parse', '--short', 'HEAD']).slice(0, 7);
  } catch {}
  return `${stamp}-${sha}`;
}

const RSYNC_EXCLUDES = [
  '--exclude', 'node_modules',
  '--exclude', '.next',
  '--exclude', '.git',
  '--exclude', '*.tsbuildinfo',
  '--exclude', '.DS_Store',
  // hudsonkit resolves from dist/, so built library output must ship.
];
function syncTree(parsed, localPath, remotePath) {
  const dest = destination(parsed);
  const parent = remotePath.replace(/\/[^/]+$/, '');
  run('ssh', ['-o', 'BatchMode=yes', dest, `mkdir -p ~/${parent}`]);
  run('rsync', ['-az', '--delete', ...RSYNC_EXCLUDES, `${localPath}/`, `${dest}:${remotePath}/`]);
}

const SYSTEMD_UNIT = (host, port) => `[Unit]
Description=Studio application server
After=network-online.target

[Service]
User=exedev
WorkingDirectory=/home/exedev/${REMOTE_BASE}/current/studio/apps/studio
Environment=STUDIO_HOST=${host}
Environment=STUDIO_PORT=${port}
ExecStart=/home/exedev/.bun/bin/bun /home/exedev/${REMOTE_BASE}/current/studio/node_modules/next/dist/bin/next start -H ${host} -p ${port}
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

async function ensureService(parsed, tailnetIp, port) {
  const unit = SYSTEMD_UNIT(tailnetIp, port);
  await ssh(
    parsed,
    `mkdir -p /tmp/studio-deploy && cat > /tmp/studio-deploy/studio.service <<'UNIT'\n${unit}UNIT\n` +
      `sudo mv /tmp/studio-deploy/studio.service /etc/systemd/system/studio.service && ` +
      `sudo systemctl daemon-reload && sudo systemctl enable studio >/dev/null`,
  );
}

export async function runDeploy(argv) {
  const parsed = parseDeployArgs(argv);
  if (parsed.help) {
    printDeployHelp();
    return 0;
  }
  const dest = destination(parsed);
  const base = `${REMOTE_BASE}`;
  const log = (msg) => (parsed.json ? null : console.log(msg));

  // 1. Discover the tailnet address so the service binds tailscale-only.
  log(`==> Resolving tailnet IP on ${dest}`);
  const tailnetIp = capture('ssh', ['-o', 'BatchMode=yes', dest, 'tailscale ip -4 | head -1']);
  if (!/^100\./.test(tailnetIp)) throw new Error(`Expected a tailnet IPv4, got "${tailnetIp}"`);

  // --skip-build updates sources inside the release that is already built and
  // current; rsync excludes keep its node_modules and .next intact.
  const id = parsed.skipBuild
    ? capture('ssh', ['-o', 'BatchMode=yes', dest, `basename $(readlink ~/${base}/current)`])
    : releaseId();

  // 2. Ship source trees.
  log(`==> Shipping release ${id}`);
  await ssh(parsed, `mkdir -p ~/${base}/${id}`);
  syncTree(parsed, REPO_ROOT, `${base}/${id}/studio`);
  syncTree(parsed, join(REPO_ROOT, '..', 'hudson', 'packages', 'web', 'hudsonkit'), `${base}/${id}/hudson/packages/web/hudsonkit`);
  syncTree(parsed, join(REPO_ROOT, '..', 'lattices', 'design', 'studio'), `${base}/${id}/lattices/design/studio`);
  // action-studio is a root workspace but is not imported by the build; ship only
  // its real manifest so bun.lock resolves identically without its sources.
  await ssh(parsed, `mkdir -p ~/${base}/${id}/action/design/studio`);
  run('rsync', ['-az',
    join(REPO_ROOT, '..', 'action', 'design', 'studio', 'package.json'),
    `${destination(parsed)}:${base}/${id}/action/design/studio/package.json`]);

  // 3. Build on the VM.
  if (!parsed.skipBuild) {
    log(`==> Installing dependencies on ${dest}`);
    await ssh(parsed, `cd ~/${base}/${id}/studio && bun install --frozen-lockfile`);
    // External workspace members (hudsonkit, lattices) live outside the repo
    // root, so bundlers resolving from their real paths find no node_modules
    // above them. Link the hoisted install to the release root.
    await ssh(parsed, `cd ~/${base}/${id} && ln -sfn studio/node_modules node_modules`);
    log(`==> Building Next app on ${dest}`);
    let build = await sshCapture(parsed, `cd ~/${base}/${id}/studio && bun run --cwd apps/studio build 2>&1`, { allowFailure: true });
    if (/Build error occurred|Build failed because of/.test(build)) {
      log('==> Turbopack build failed; retrying with webpack');
      build = await sshCapture(parsed, `cd ~/${base}/${id}/studio && bun run --cwd apps/studio build --webpack 2>&1`, { allowFailure: true });
    }
    if (/Build error occurred|Build failed because of/.test(build)) {
      throw new Error(`Remote build failed:\n${build.split('\n').slice(-30).join('\n')}`);
    }
  }

  // 4. Flip the current symlink atomically.
  log(`==> Flipping current -> ${id}`);
  await ssh(parsed, `cd ~/${base} && ln -sfn ${id} .current-${id} && mv -T .current-${id} current`);

  // 5. Install/restart the service.
  await ensureService(parsed, tailnetIp, parsed.port);
  await ssh(parsed, `sudo systemctl restart studio`);
  await ssh(parsed, `sleep 2; systemctl is-active studio || sudo journalctl -u studio -n 30 --no-pager`);

  // 6. Prune old releases, keeping the newest N.
  await ssh(parsed, `cd ~/${base} && ls -1d $(pwd)/20* 2>/dev/null | sort | head -n -${parsed.keep} | xargs -r rm -rf`);

  // 7. Health check from this machine over the tailnet.
  log(`==> Health check http://${tailnetIp}:${parsed.port}`);
  let healthy = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const body = capture('curl', ['-sf', '--max-time', '5', `http://${tailnetIp}:${parsed.port}/`]);
      if (body.length > 0) { healthy = true; break; }
    } catch {}
    await ssh(parsed, 'sleep 2');
  }
  if (!healthy) throw new Error('Health check failed: no non-empty response from the deployed server');

  const result = { ok: true, host: dest, release: id, url: `http://${tailnetIp}:${parsed.port}/` };
  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Deployed ${id} → ${result.url}`);
  return 0;
}

export function printDeployHelp() {
  console.log(`
studio deploy — ship the Studio server to a remote VM

Usage:
  studio deploy [--host <vm>] [--user <u>] [--port <p>] [--keep <n>] [--skip-build] [--json]

Flags:
  --host        Target VM hostname reachable over SSH and tailscale (default ocean-iron.exe.xyz)
  --user        SSH user (default: your ssh config default)
  --port        Port for the deployed server (default 43210)
  --keep        Releases to retain on the VM (default 5)
  --skip-build  Ship sources and flip the symlink without installing/building
  --json        Machine-readable result

The VM installs dependencies, builds the Next app, and serves the current
release via the \`studio\` systemd unit bound to its tailnet IP only.
`);
}

// --- Per-project deploy -----------------------------------------------------
//
// `studio deploy-project` ships one project's studio (a self-contained Next
// app) to ~/studios/<id>/ on the VM and runs it under its own systemd unit —
// dev mode with HMR by default, so remote agents can edit design source and
// the rendered view updates live over tailscale.

const PROJECTS_BASE = 'studios';

function parseDeployProjectArgs(argv) {
  const parsed = {
    help: false,
    json: false,
    mode: 'dev',
    port: null,
    host: 'ocean-iron.exe.xyz',
    user: null,
    path: null,
    id: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--host') parsed.host = argv[++i];
    else if (arg === '--user') parsed.user = argv[++i];
    else if (arg === '--path') parsed.path = argv[++i];
    else if (arg === '--id') parsed.id = argv[++i];
    else if (arg === '--port') parsed.port = Number(argv[++i]);
    else if (arg === '--mode') parsed.mode = argv[++i];
    else throw new Error(`Unknown deploy-project flag: ${arg}`);
  }
  if (!parsed.path && parsed.help) return parsed;
  parsed.path = join(parsed.path.startsWith('/') ? '/' : REPO_ROOT, parsed.path);
  if (!parsed.id) parsed.id = parsed.path.split('/').filter(Boolean).pop();
  if (!parsed.port) parsed.port = 5193;
  if (parsed.mode !== 'dev' && parsed.mode !== 'prod') throw new Error('--mode must be dev or prod');
  return parsed;
}

const PROJECT_UNIT = (id, host, port, mode) => `[Unit]
Description=Studio project ${id}
After=network-online.target

[Service]
User=exedev
WorkingDirectory=/home/exedev/${PROJECTS_BASE}/${id}
Environment=PATH=/home/exedev/.local/node/bin:/home/exedev/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/exedev/.local/node/bin/node /home/exedev/${PROJECTS_BASE}/${id}/node_modules/next/dist/bin/next ${mode === 'dev' ? 'dev --webpack' : 'start'} -H ${host} -p ${port}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

export async function runDeployProject(argv) {
  const parsed = parseDeployProjectArgs(argv);
  if (parsed.help) {
    printDeployProjectHelp();
    return 0;
  }
  const dest = destination(parsed);
  const log = (msg) => (parsed.json ? null : console.log(msg));

  log(`==> Resolving tailnet IP on ${dest}`);
  const tailnetIp = capture('ssh', ['-o', 'BatchMode=yes', dest, 'tailscale ip -4 | head -1']);
  if (!/^100\./.test(tailnetIp)) throw new Error(`Expected a tailnet IPv4, got "${tailnetIp}"`);

  log(`==> Shipping ${parsed.id} from ${parsed.path}`);
  syncTree(parsed, parsed.path, `${PROJECTS_BASE}/${parsed.id}`);

  log(`==> Installing dependencies on ${dest}`);
  await ssh(parsed, `cd ~/${PROJECTS_BASE}/${parsed.id} && bun install`);

  if (parsed.mode === 'prod') {
    log(`==> Building on ${dest}`);
    const build = await sshCapture(parsed, `cd ~/${PROJECTS_BASE}/${parsed.id} && bun run build 2>&1`, { allowFailure: true });
    if (/Build error occurred|Build failed because of/.test(build)) {
      throw new Error(`Remote build failed:\n${build.split('\n').slice(-30).join('\n')}`);
    }
  }

  log(`==> Installing studio-${parsed.id}.service (${tailnetIp}:${parsed.port}, ${parsed.mode})`);
  const unit = PROJECT_UNIT(parsed.id, tailnetIp, parsed.port, parsed.mode);
  await ssh(parsed,
    `mkdir -p /tmp/studio-deploy && cat > /tmp/studio-deploy/studio-${parsed.id}.service <<'UNIT'\n${unit}UNIT\n` +
    `sudo mv /tmp/studio-deploy/studio-${parsed.id}.service /etc/systemd/system/studio-${parsed.id}.service && ` +
    `sudo systemctl daemon-reload && sudo systemctl enable studio-${parsed.id} >/dev/null && sudo systemctl restart studio-${parsed.id}`);

  await upsertProjectIndex(parsed, {
    id: parsed.id,
    sourcePath: parsed.path,
    url: `http://${tailnetIp}:${parsed.port}`,
    mode: parsed.mode,
    shippedAt: new Date().toISOString(),
  });

  log(`==> Health check http://${tailnetIp}:${parsed.port}`);
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const body = capture('curl', ['-sf', '--max-time', '5', `http://${tailnetIp}:${parsed.port}/`]);
      if (body.length > 0) { healthy = true; break; }
    } catch {}
    await ssh(parsed, 'sleep 2');
  }
  if (!healthy) throw new Error('Health check failed: no non-empty response from the project server');

  const result = { ok: true, id: parsed.id, url: `http://${tailnetIp}:${parsed.port}/`, mode: parsed.mode };
  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Deployed ${parsed.id} → ${result.url} (${parsed.mode})`);
  return 0;
}

export function printDeployProjectHelp() {
  console.log(`
studio deploy-project — ship one project's studio to the VM

Usage:
  studio deploy-project --path <dir> [--id <id>] [--port <p>] [--mode dev|prod] [--host <vm>] [--json]

Ships the project directory to ~/studios/<id>/, installs dependencies,
provisions studio-<id>.service bound to the VM's tailnet IP, records it in
~/studios/index.json, and health-checks the result. dev mode runs the
project's dev:raw script so agent edits hot-reload over tailscale.
`);
}

async function upsertProjectIndex(parsed, entry) {
  const script = [
    'import json, os',
    `entry = json.loads(${JSON.stringify(JSON.stringify(entry))})`,
    'path = os.path.expanduser("~/studios/index.json")',
    'index = []',
    'if os.path.exists(path):',
    '    index = [p for p in json.load(open(path)) if p.get("id") != entry["id"]]',
    'index.append(entry)',
    'json.dump(index, open(path, "w"), indent=2)',
  ].join('\n');
  await ssh(parsed, `python3 - <<'PY'\n${script}\nPY`);
}

// --- Cloud upgrade ----------------------------------------------------------
//
// `studio upgrade-cloud` levels every studio on a VM up to the same platform
// version in one operation: the cloud app redeploys from this repository, and
// each shipped project re-syncs from its recorded local source path and
// restarts. Run it after landing platform features; all studios pick them up
// together.

function parseUpgradeCloudArgs(argv) {
  const parsed = {
    help: false,
    json: false,
    skipBuild: false,
    host: 'ocean-iron.exe.xyz',
    user: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--skip-build') parsed.skipBuild = true;
    else if (arg === '--host') parsed.host = argv[++i];
    else if (arg === '--user') parsed.user = argv[++i];
    else throw new Error(`Unknown upgrade-cloud flag: ${arg}`);
  }
  return parsed;
}

export async function runUpgradeCloud(argv) {
  const parsed = parseUpgradeCloudArgs(argv);
  if (parsed.help) {
    printUpgradeCloudHelp();
    return 0;
  }
  const log = (msg) => (parsed.json ? null : console.log(msg));

  const indexRaw = capture('ssh', ['-o', 'BatchMode=yes', destination(parsed), `cat ~/${PROJECTS_BASE}/index.json`]);
  const projects = JSON.parse(indexRaw);

  for (const project of projects) {
    if (!project.sourcePath || !project.id) {
      log(`==> Skipping ${project.id ?? '(unnamed)'}: no recorded source path`);
      continue;
    }
    log(`==> Leveling up ${project.id} from ${project.sourcePath}`);
    syncTree(parsed, project.sourcePath, `${PROJECTS_BASE}/${project.id}`);
    await ssh(parsed, `cd ~/${PROJECTS_BASE}/${project.id} && bun install`);
    await ssh(parsed, `sudo systemctl restart studio-${project.id}`);
    await upsertProjectIndex(
      { host: parsed.host, user: parsed.user },
      { ...project, shippedAt: new Date().toISOString() },
    );
  }

  log('==> Upgrading the Studio platform app');
  await runDeploy(['--host', parsed.host, ...(parsed.user ? ['--user', parsed.user] : []), ...(parsed.skipBuild ? ['--skip-build'] : []), '--port', '43210']);

  const result = { ok: true, upgraded: projects.map((project) => project.id) };
  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Upgraded ${result.upgraded.join(', ') || 'no projects'} + platform app.`);
  return 0;
}

export function printUpgradeCloudHelp() {
  console.log(`
studio upgrade-cloud — level every studio on a VM up to the same version

Usage:
  studio upgrade-cloud [--host <vm>] [--skip-build] [--json]

Re-syncs each shipped project from its recorded local source path, restarts
its service, then redeploys the Studio platform app. Run after landing
features; every studio picks them up together.
`);
}

// --- Host deploy --------------------------------------------------------------
//
// `studio host-deploy` ships the cloud host (Vite multi-studio server) source
// to a VM and restarts its studio-host service. The host runs from the
// studio repo checkout at ~/studio-cloud/bootstrap/studio, which bootstrap
// creates; this command updates just the host subtree, no rebuild needed.

function parseHostDeployArgs(argv) {
  const parsed = {
    help: false,
    json: false,
    restart: true,
    host: 'ocean-iron.exe.xyz',
    user: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--no-restart') parsed.restart = false;
    else if (arg === '--host') parsed.host = argv[++i];
    else if (arg === '--user') parsed.user = argv[++i];
    else throw new Error(`Unknown host-deploy flag: ${arg}`);
  }
  return parsed;
}

export async function runHostDeploy(argv) {
  const parsed = parseHostDeployArgs(argv);
  if (parsed.help) {
    printHostDeployHelp();
    return 0;
  }
  const log = (msg) => (parsed.json ? null : console.log(msg));
  const dest = destination(parsed);
  const hostDir = `${REMOTE_BASE}/bootstrap/studio/cloud/host`;

  log(`==> Shipping cloud host → ${dest}`);
  run('ssh', ['-o', 'BatchMode=yes', dest, `mkdir -p ${hostDir}/compat`]);
  run('rsync', ['-az', '--delete', '--exclude', '.DS_Store', join(REPO_ROOT, 'cloud', 'host') + '/', `${dest}:${hostDir}/`]);

  if (parsed.restart) {
    log('==> Restarting studio-host');
    await ssh(parsed, 'sudo systemctl restart studio-host && sleep 2');
  }
  const health = await sshCapture(
    parsed,
    `for i in $(seq 1 20); do R=$(curl -sf -m 5 http://127.0.0.1:80/api/health) && echo "$R" && exit 0; sleep 1; done; exit 1`,
    { allowFailure: true },
  );
  if (!health.trim()) throw new Error('host health check failed after deploy');

  const result = { ok: true, host: parsed.host, health: health.trim() };
  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Host deployed on ${parsed.host} — ${result.health}`);
  return 0;
}

export function printHostDeployHelp() {
  console.log(`
studio host-deploy — ship the multi-studio cloud host to a VM

Usage:
  studio host-deploy [--host <vm>] [--user <u>] [--no-restart] [--json]

rsyncs cloud/host/ (server + compat shims) into the studio checkout the VM
service runs from, restarts studio-host, and health-checks the result over
tailscale. Run after changing cloud/host/**.
`);
}

// --- Studio sync ------------------------------------------------------------
//
// `studio sync` wires a local studio folder (studio.json + views/) to a
// worktree repo on the VM. The VM repo has receive.denyCurrentBranch=
// updateInstead, so `git push` updates the worktree atomically and refuses
// on a dirty tree — the host's watcher picks the change up as HMR.

function parseSyncArgs(argv) {
  const parsed = {
    help: false,
    host: 'ocean-iron.exe.xyz',
    user: null,
    dir: null,
    id: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--host') parsed.host = argv[++i];
    else if (arg === '--user') parsed.user = argv[++i];
    else if (arg === '--dir') parsed.dir = argv[++i];
    else if (arg === '--id') parsed.id = argv[++i];
    else throw new Error(`Unknown sync flag: ${arg}`);
  }
  if (!parsed.dir) {
    if (parsed.help) return parsed;
    throw new Error('--dir <studio-folder> is required');
  }
  parsed.dir = join(parsed.dir.startsWith('/') ? '/' : REPO_ROOT, parsed.dir);
  if (!parsed.id) parsed.id = parsed.dir.split('/').filter(Boolean).pop();
  return parsed;
}

function ensureGitRepo(dir) {
  if (!existsSync(join(dir, '.git'))) {
    run('git', ['-C', dir, 'init', '-b', 'main']);
  }
}

export async function runSync(argv) {
  const parsed = parseSyncArgs(argv);
  if (parsed.help) {
    printSyncHelp();
    return 0;
  }
  const dest = destination(parsed);
  ensureGitRepo(parsed.dir);

  const manifest = JSON.parse(await import('fs/promises').then((fs) => fs.readFile(join(parsed.dir, 'studio.json'), 'utf8')));
  const id = manifest.id ?? parsed.id;

  await ssh(parsed,
    `mkdir -p ~/${PROJECTS_BASE}/${id} && cd ~/${PROJECTS_BASE}/${id} && ` +
    `if [ ! -d .git ]; then git init -b main && git config receive.denyCurrentBranch updateInstead; fi`);

  const remoteUrl = `${dest}:${PROJECTS_BASE}/${id}`;
  const remotes = capture('git', ['-C', parsed.dir, 'remote']);
  if (!remotes.split('\n').includes('vm')) {
    run('git', ['-C', parsed.dir, 'remote', 'add', 'vm', remoteUrl]);
  } else {
    run('git', ['-C', parsed.dir, 'remote', 'set-url', 'vm', remoteUrl]);
  }
  let hasCommit = false;
  try {
    hasCommit = capture('git', ['-C', parsed.dir, 'rev-parse', '--verify', 'HEAD']).length > 0;
  } catch {}
  run('git', ['-C', parsed.dir, 'add', '-A']);
  if (!hasCommit) {
    run('git', ['-C', parsed.dir, 'commit', '-m', `ship ${id}`]);
  } else if (capture('git', ['-C', parsed.dir, 'status', '--porcelain']).length > 0) {
    run('git', ['-C', parsed.dir, 'commit', '-am', `ship ${id}`]);
  }
  // The cloud agent commits directly in the VM worktree. Fetch its main and
  // rebase local ship commits on top, so pushes stay fast-forward and agent
  // work flows back to the machine that syncs. A fresh remote has no main
  // yet — nothing to integrate.
  try {
    run('git', ['-C', parsed.dir, 'fetch', 'vm', 'main']);
    const behind = capture('git', ['-C', parsed.dir, 'rev-list', '--count', 'HEAD..FETCH_HEAD']);
    if (behind !== '0') {
      run('git', ['-C', parsed.dir, 'rebase', 'FETCH_HEAD']);
      console.log(`Integrated ${behind} cloud commit(s) from ${dest}:${PROJECTS_BASE}/${id}`);
    }
  } catch {}
  run('git', ['-C', parsed.dir, 'push', '-u', 'vm', 'main']);
  await ssh(parsed, `cd ~/${PROJECTS_BASE}/${id} && git checkout -f main 2>/dev/null || git reset --hard main 2>/dev/null || true`);

  const sha = capture('git', ['-C', parsed.dir, 'rev-parse', '--short', 'HEAD']);
  console.log(`Synced ${id} @ ${sha} → ${dest}:${PROJECTS_BASE}/${id}`);
  return 0;
}

export function printSyncHelp() {
  console.log(`
studio sync — wire a local studio folder to the VM via git

Usage:
  studio sync --dir <studio-folder> [--id <id>] [--host <vm>]

The VM worktree repo gets receive.denyCurrentBranch=updateInstead, so
subsequent \`git push vm main\` calls update the served files atomically and
refuse on a dirty tree. The host watches the worktree and hot-reloads.
`);
}
