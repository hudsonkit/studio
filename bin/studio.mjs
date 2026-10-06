#!/usr/bin/env node
/**
 * Studio CLI for the persistent local host, project registration, development,
 * and turnkey creation of new views.
 *
 * Usage (from a consumer repo after linking studio):
 *   bunx studio create-view "My New Treatment" --bucket studies --surface web
 *
 * It scaffolds:
 *   - A markdown body (ready for AnnotatableDoc)
 *   - A suggested registry page entry (with comments for decisions)
 *   - A small note about wiring onAnnotationsChange + persistAnnotations
 *     so local agents get the sidecar automatically.
 *
 * Host state is local to the current OS user. For full app scaffolding see the
 * sibling create-hudson-app tool.
 */

import { spawnSync } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { argv } from 'process';
import { fileURLToPath } from 'url';
import {
  heartbeatProject,
  parseRegistrationArgs,
  registerProject,
  runHostForeground,
  runLocalDev,
  startHostDaemon,
  unregisterProject,
} from './local-dev.mjs';
import {
  printDeployHelp,
  runDeploy,
  printDeployProjectHelp,
  runDeployProject,
  printUpgradeCloudHelp,
  runUpgradeCloud,
  printHostDeployHelp,
  runHostDeploy,
  runSync,
} from './local-deploy.mjs';
import { hostApiRequest } from './local-host.mjs';

const args = argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
studio — local development and design-view scaffolding

Commands:
  studio dev [--port <port>] [-- <command>]
  studio host start|run|status|stop
  studio mcp [--json]                 Studio MCP URL and discovery manifest
  studio register --port <port> [--host 127.0.0.1] [--pid <pid>] [--ttl 30s]
  studio heartbeat [--port <changed-port>] [--pid <pid>] [--ttl 30s]
  studio unregister
  studio list [--json]
  studio doctor [--path <path>] [--json]
  studio upgrade-cloud [--host <vm>] [--skip-build] [--json]
  studio host-deploy [--host <vm>] [--user <u>] [--no-restart]
  studio deploy-project --path <dir> [--id <id>] [--port <p>] [--mode dev|prod]
  studio create-view <label> [--bucket <b>] [--surface <s>]
  studio sync --dir <studio-folder> [--id <id>] [--host <vm>]
  studio bootstrap --host <new-vm> [--with-agent]

Examples:
  studio dev -- next dev --port {port}     # port allocated + remembered
  studio dev --port 3060 -- next dev       # explicit port, unchanged
  studio register --port 3060 --pid $$
  studio heartbeat --port 3061
  studio unregister
  studio create-view "Checkout Flow v2" --bucket studies --surface web
  studio create "Pricing Experiments" --bucket experiments
`);
}

function registrationHelp() {
  console.log(`studio register — add or update a project route

Usage:
  studio register --port <port> [options]
  studio heartbeat [options]
  studio unregister [identity options]

Options:
  --host <host>   Upstream host (default: 127.0.0.1)
  --port, -p      Upstream port; required for register
  --repo <name>   Override Git remote/root repository identity
  --root <path>   Override Git repository root
  --cwd <path>    Project working directory
  --pid <pid>     Remove the route automatically when this exact process exits
  --ttl <time>    Heartbeat expiry, e.g. 15000, 15s, 1m (0 disables expiry)
  --json          Machine-readable output

register is an idempotent upsert for the same repository root. heartbeat can
refresh liveness and update the upstream port. Leases are stored per repo under
~/.studio/host/leases so an old client cannot unregister a newer owner.`);
}

function printResult(result, asJson) {
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else if (result.url) {
    console.log(`${result.registration.hostname} → ${result.registration.upstream.host}:${result.registration.upstream.port}`);
    console.log(result.url);
  } else console.log('ok');
}

async function hostCommand(hostArgs) {
  const action = hostArgs[0] || 'status';
  if (action === 'run') return runHostForeground();
  if (action === 'start') {
    const status = await startHostDaemon();
    console.log(`Studio host running (pid ${status.pid}, ${status.edge}, public port ${status.publicPort}).`);
    return 0;
  }
  if (action === 'status') {
    const result = await hostApiRequest('/v1/status');
    console.log(JSON.stringify(result.body, null, 2));
    return 0;
  }
  if (action === 'stop') {
    await hostApiRequest('/v1/shutdown', { method: 'POST', body: {} });
    console.log('Studio host stopped. Registrations will be reconciled on next start.');
    return 0;
  }
  if (action === '--help' || action === '-h' || action === 'help') {
    console.log(`studio host — manage the persistent local routing host

Usage:
  studio host start    Start in the background (normally automatic)
  studio host run      Run in the foreground
  studio host status   Show edge and registration status
  studio host stop     Gracefully stop without deleting desired registrations`);
    return 0;
  }
  throw new Error(`Unknown studio host action: ${action}`);
}

/**
 * `studio components ...` delegates to src/components/cli.ts through bun:
 * component manifests are TypeScript and bun loads them with no build step.
 * stdio is inherited so --json output stays byte-clean and the child's exit
 * code (audit/verify CI gates) propagates unchanged.
 */
function runComponents(componentArgs) {
  const cliPath = fileURLToPath(new URL('../src/components/cli.ts', import.meta.url));
  const result = spawnSync('bun', [cliPath, ...componentArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  if (result.error) {
    console.error(`Error: studio components requires bun on PATH (${result.error.message})`);
    return 1;
  }
  return result.status ?? 1;
}

async function createView() {
  const label = args[1];
  if (!label) {
    throw new Error('Please provide a label, e.g. studio create-view "My Treatment"');
  }

  let bucket = 'studies';
  let surface = 'web';

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--bucket' && args[i + 1]) bucket = args[++i];
    if (args[i] === '--surface' && args[i + 1]) surface = args[++i];
  }

  const slug = label.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const href = `/studies/${slug}`;
  const contentDir = join(process.cwd(), 'src', 'studio', 'content');
  const mdContent = `# ${label}

Describe the treatment here. Use headings, lists, and code blocks.

Agents and humans can annotate any block or span.

## Variant A
...

## Variant B
...
`;

  const suggestedRegistryEntry = `
  {
    href: "${href}",
    label: "${label}",
    bucket: "${bucket}",
    surface: "${surface}",
    status: "proposed",   // or "in-flight"
    blurb: "Short description for the page strip.",
    // source: ["path/to/implementation.tsx"],
  },
`;

  const note = `
// After adding the page above, wire the rich annotation UI + local agent pickup:
//
// import { AnnotatableDoc, persistAnnotations, annotationsToDecisions } from "studio/doc";
//
// <AnnotatableDoc
//   body={body}
//   slug="${slug}"
//   docTitle="${label}"
//   persistKey="${href}"
//   onAnnotationsChange={(anns) =>
//     persistAnnotations({
//       persistKey: "${href}",
//       slug: "${href}",
//       annotations: anns,
//       decisions: annotationsToDecisions("${href}", anns),
//     })
//   }
// />
//
// Local agents will find the sidecar at:
//   .studio/annotations/${slug}.json   (or whatever you configured)
//
// You can also expose commands for the in-app assistant:
//   import { createIterationCommands } from "studio/app-shell";
//   // then pass to StudioHudsonApp useCommands
`;

  await mkdir(contentDir, { recursive: true });

  const mdPath = join(contentDir, `${slug}.md`);
  await writeFile(mdPath, mdContent, 'utf8');
  console.log(`Created ${mdPath}`);

  console.log('\nSuggested registry entry (add to your pages array in studioRegistry.ts):');
  console.log(suggestedRegistryEntry);

  console.log('\nWire the annotation + persistence layer like this (in your page renderer):');
  console.log(note);

  console.log(`
Next steps:
  1. Paste the registry entry.
  2. Import and use AnnotatableDoc + persistAnnotations in your Markdown renderer.
  3. Local agents (Cursor, scout, etc.) can now read .studio/annotations/ after you annotate.

Run "studio create-view ..." again for more views. They all share the same persistence convention.
`);
}

async function mcpCommand(mcpArgs) {
  const status = await startHostDaemon();
  if (!status.mcpUrl) {
    throw new Error('The Studio host is running without its MCP server. If it predates the MCP, restart it (`studio host stop`); otherwise check ~/.studio/config.json (mcp.enabled, mcp.port), STUDIO_MCP_PORT and ~/.studio/host/studio-host.log.');
  }
  if (mcpArgs.includes('--json')) {
    // The manifest is the discovery contract; fall back to the bare url for a host that predates it.
    const manifest = status.manifest
      ? await readFile(status.manifest, 'utf8').then(JSON.parse, () => null)
      : null;
    console.log(JSON.stringify(manifest ?? { mcp: { url: status.mcpUrl, transport: 'streamable-http' } }, null, 2));
    return 0;
  }
  console.log(`Studio MCP: ${status.mcpUrl}
${status.manifest ? `Manifest:   ${status.manifest}${status.devRoot ? ` (mirrored in ${join(status.devRoot, '.studio')})` : ''}\n` : ''}
Connect Claude Code:
  claude mcp add --transport http studio ${status.mcpUrl}

Or add to .mcp.json:
  { "mcpServers": { "studio": { "type": "http", "url": "${status.mcpUrl}" } } }

Agents can find this without a port: walk up to the nearest .studio/studio.json
(falling back to ~/.studio/studio.json). Settings live in ~/.studio/config.json.`);
  return 0;
}

async function main() {
  if (command === 'mcp') {
    process.exitCode = await mcpCommand(args.slice(1));
    return;
  }
  if (command === 'dev') {
    process.exitCode = await runLocalDev(args.slice(1));
    return;
  }
  if (command === 'host') {
    process.exitCode = await hostCommand(args.slice(1));
    return;
  }
  if (command === 'register') {
    const parsed = parseRegistrationArgs(args.slice(1));
    if (parsed.help) return registrationHelp();
    printResult(await registerProject(parsed), parsed.json);
    return;
  }
  if (command === 'heartbeat' || command === 'refresh') {
    const parsed = parseRegistrationArgs(args.slice(1), { heartbeat: true });
    if (parsed.help) return registrationHelp();
    printResult(await heartbeatProject(parsed), parsed.json);
    return;
  }
  if (command === 'unregister') {
    const parsed = parseRegistrationArgs(args.slice(1));
    if (parsed.help) return registrationHelp();
    printResult(await unregisterProject(parsed), parsed.json);
    return;
  }
  if (command === 'list') {
    const result = await hostApiRequest('/v1/registrations');
    if (args.includes('--json')) console.log(JSON.stringify(result.body, null, 2));
    else if (result.body.registrations.length === 0) console.log('No Studio projects registered.');
    else for (const registration of result.body.registrations) {
      console.log(`${registration.hostname}\t${registration.upstream.host}:${registration.upstream.port}\t${registration.workingDirectory}`);
    }
    return;
  }
  if (command === 'doctor') {
    process.exitCode = await runDoctor(args.slice(1));
    return;
  }
  if (command === 'components') {
    process.exitCode = runComponents(args.slice(1));
    return;
  }
  if (command === 'deploy') {
    process.exitCode = await runDeploy(args.slice(1));
    return;
  }
  if (command === 'upgrade-cloud') {
    process.exitCode = await runUpgradeCloud(args.slice(1));
    return;
  }
  if (command === 'host-deploy') {
    process.exitCode = await runHostDeploy(args.slice(1));
    return;
  }
  if (command === 'sync') {
    process.exitCode = await runSync(args.slice(1));
    return;
  }
  if (command === 'bootstrap') {
    const script = fileURLToPath(new URL('../cloud/bootstrap.sh', import.meta.url));
    const result = spawnSync('bash', [script, ...args.slice(1)], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
    return;
  }
  if (command === 'deploy-project') {
    process.exitCode = await runDeployProject(args.slice(1));
    return;
  }
  if (command === 'create-view' || command === 'create') {
    await createView();
    return;
  }
  printHelp();
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
