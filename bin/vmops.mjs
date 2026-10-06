#!/usr/bin/env bun
/**
 * vmops — put things up on our exe.dev VMs and keep them running.
 *
 * Wraps the exe.dev SSH repl and systemd/journalctl into a handful of
 * commands. Studio VMs are the default citizen (nginx + studio + studio-host,
 * studios synced from each project's .studio directory), but status/logs work
 * on any VM.
 *
 * Usage:
 *   vmops ls                       list your exe.dev VMs
 *   vmops new <name>               create a VM (2cpu/4GB/30GB, tag studio)
 *   vmops rm <name>                delete a VM
 *   vmops status <vm>              services, health, studios, disk
 *   vmops logs <vm> [-s svc] [-n N] [-f]
 *   vmops ask <vm> "<message>"     dedicated Scout conversation with the VM agent
 *   vmops wait <vm> [--timeout S]  show the latest agent activity/replies
 *   vmops models                   list the Shelley LLM catalog
 *   vmops model [--model NAME]     resolve which Shelley model would be used
 *   vmops shelley <vm> "<message>" [--model NAME]  exe.dev Shelley prompt
 *   vmops ship <vm>                sync every project studio + host-deploy
 *   vmops bootstrap <vm>           full studio provision (delegates to studio CLI)
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const STUDIO_CLI = join(import.meta.dir, 'studio.mjs');
const SSH = ['-o', 'BatchMode=yes'];

const argv = process.argv.slice(2);
const command = argv[0];
const rest = argv.slice(1);

function parseFlags(args) {
  const named = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      const cleaned = arg.replace(/^--?/, '');
      if (cleaned.includes('=')) {
        const eq = cleaned.indexOf('=');
        named[cleaned.slice(0, eq)] = cleaned.slice(eq + 1);
        continue;
      }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) named[cleaned] = next;
      else named[cleaned] = true;
    } else positional.push(arg);
  }
  return { named, positional };
}

function exe(subcommand) {
  return execFileSync('ssh', [...SSH, 'exe.dev', ...subcommand.split(' ')], { encoding: 'utf8' }).trim();
}

function vmRun(vm, script) {
  return execFileSync('ssh', [...SSH, vm, script], { encoding: 'utf8' }).trim();
}

function vmRunInherit(vm, script) {
  execFileSync('ssh', [...SSH, vm, script], { stdio: 'inherit' });
}

function printHelp() {
  console.log(`
vmops — put things up on our exe.dev VMs

  vmops ls                      list VMs
  vmops new <name>              create one (2cpu/4GB/30GB, #studio)
  vmops rm <name>               delete one
  vmops status <vm>             services, health, studios, disk
  vmops logs <vm> [-s svc] [-n N] [-f]
  vmops ask <vm> "<message>"    dedicated Scout conversation with the VM agent
  vmops wait <vm> [-n N]        latest agent activity/replies
  vmops models                  list the Shelley LLM catalog
  vmops model [--model NAME]    resolve a catalog model
  vmops shelley <vm> "<message>" [--model NAME]
                                prompt Shelley via exe.dev with a catalog --model
  vmops ship <vm>               sync every project studio + host-deploy
  vmops bootstrap <vm>          full studio provision
`);
}

function normalizeVm(name) {
  if (!name) return 'studio-lab.exe.xyz';
  return name.includes('.') ? name : `${name}.exe.xyz`;
}

/**
 * Models we use with Shelley. Sources are exe.dev integrations (configurable
 * on the Integrations page / `ssh exe.dev integrations`). Shelley discovers
 * attached `llm` integrations via reflection; catalog integrations such as
 * OpenRouter attach as https://<name>.int.exe.xyz.
 *
 * This list is the operator catalog — not every model a gateway advertises.
 */
const SHELLEY_LLMS = [
  {
    id: 'deepseek-v4-flash-0731-fireworks',
    label: 'DeepSeek V4 Flash',
    via: 'llm',
    host: 'https://llm.int.exe.xyz',
    default: true,
    aliases: ['deepseek v4 flash', 'deepseek v4 flash free', 'deepseek-v4-flash', 'deepseek-v4-flash-free', 'deepseek-v4-flash-0731'],
  },
  {
    id: 'glm-5p3-flash',
    label: 'GLM 5.3 Flash',
    via: 'llm',
    host: 'https://llm.int.exe.xyz',
    aliases: ['glm flash', 'glm-5p3-flash'],
  },
  {
    id: 'nemotron-lightning-3p5-30b-a3b',
    label: 'Nemotron Lightning 3.5',
    via: 'llm',
    host: 'https://llm.int.exe.xyz',
    aliases: ['nemotron lightning', 'nemotron-3.5-lightning'],
  },
  {
    id: 'nemotron-3-ultra-nvfp4',
    label: 'Nemotron 3 Ultra (Fireworks)',
    via: 'llm',
    host: 'https://llm.int.exe.xyz',
    aliases: ['nemotron 3 ultra', 'nemotron-3-ultra'],
  },
  {
    id: 'kimi-k2.7-code-fireworks',
    label: 'Kimi K2.7 Code',
    via: 'llm',
    host: 'https://llm.int.exe.xyz',
    aliases: ['kimi-k2.7-code', 'kimi-k2p7-code', 'kimi k2.7 code'],
  },
  {
    id: 'minimax-m3',
    label: 'MiniMax M3',
    via: 'llm',
    host: 'https://llm.int.exe.xyz',
    aliases: ['minimax m3', 'minimax-m3'],
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    label: 'Nemotron 3 Ultra 550B free',
    via: 'openrouter',
    host: 'https://openrouter.int.exe.xyz',
    aliases: [
      'nemotron 3 ultra free',
      'nemotron-3-ultra-free',
      'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    ],
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    label: 'Nemotron 3.5 Lightning free',
    via: 'openrouter',
    host: 'https://openrouter.int.exe.xyz',
    aliases: ['nemotron-3.5-lightning-free', 'openrouter/nvidia/nemotron-3.5-lightning:free'],
  },
];

function normalizeModelKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, '-')
    .replace(/\s+/g, ' ');
}

function catalogByKey() {
  const map = new Map();
  for (const entry of SHELLEY_LLMS) {
    map.set(normalizeModelKey(entry.id), entry);
    map.set(normalizeModelKey(entry.label), entry);
    for (const alias of entry.aliases ?? []) map.set(normalizeModelKey(alias), entry);
  }
  return map;
}

function defaultShelleyLlm() {
  return SHELLEY_LLMS.find((entry) => entry.default) ?? SHELLEY_LLMS[0];
}

function resolveShelleyModel({ requested } = {}) {
  if (!requested || requested === true) {
    const entry = defaultShelleyLlm();
    return { ...entry, reason: `catalog default (${entry.label})` };
  }
  const key = normalizeModelKey(requested);
  const compact = key.replace(/\s+/g, '-');
  const map = catalogByKey();
  const entry = map.get(key) ?? map.get(compact);
  if (!entry) {
    const known = SHELLEY_LLMS.map((e) => e.id).join(', ');
    throw new Error(`unknown Shelley LLM ${requested}. Catalog: ${known}`);
  }
  const reason = normalizeModelKey(requested) === normalizeModelKey(entry.id)
    ? 'catalog id'
    : `catalog alias ${requested} → ${entry.id}`;
  return { ...entry, reason };
}

function printModelResolution(choice) {
  console.log(`model:  ${choice.id}`);
  console.log(`label:  ${choice.label}`);
  console.log(`via:    ${choice.via} (${choice.host})`);
  console.log(`reason: ${choice.reason}`);
}

async function discoverStudios() {
  const dev = join(homedir(), 'dev');
  const out = [];
  for (const entry of await readdir(dev, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(dev, entry.name, '.studio');
    if (existsSync(join(dir, 'studio.json'))) out.push({ name: entry.name, dir });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const { named, positional } = parseFlags(rest);

try {
  if (command === 'ls') {
    console.log(exe('ls -l'));
  } else if (command === 'new') {
    const name = positional[0];
    if (!name) throw new Error('usage: vmops new <name>');
    console.log(exe(`new --name=${name} --image=exeuntu --cpu=2 --memory=4GB --disk=30GB --tag=studio`));
  } else if (command === 'rm') {
    const name = positional[0];
    if (!name) throw new Error('usage: vmops rm <name>');
    console.log(exe(`rm ${name}`));
  } else if (command === 'status') {
    const vm = positional[0];
    if (!vm) throw new Error('usage: vmops status <vm>');
    const services = named.services ?? 'nginx studio studio-host';
    const script = `
echo "-- services --"
for s in ${services}; do
  printf "%-14s %s\\n" "$s" "$(systemctl is-active $s 2>/dev/null || echo unknown)"
done
echo "-- health (via nginx :80) --"
curl -sf -m 5 http://127.0.0.1:80/api/health || echo unavailable
echo "-- studios --"
for d in ~/studios/*/; do
  id=$(basename "$d")
  routes=$(find "$d/app" -name page.tsx 2>/dev/null | wc -l)
  printf "%-16s routes=%s\\n" "$id" "$routes"
done
echo "-- disk --"
df -h / | tail -1`;
    console.log(vmRun(vm, script));
  } else if (command === 'logs') {
    const vm = positional[0];
    if (!vm) throw new Error('usage: vmops logs <vm> [-s svc] [-n N] [-f]');
    const service = named.s ?? named.service ?? 'studio-host';
    const lines = named.n ?? 50;
    const flags = named.f ? '-f' : `--no-pager -n ${lines}`;
    vmRunInherit(vm, `journalctl -u ${service} ${flags} -o short`);
  } else if (command === 'models') {
    console.log('Shelley LLM catalog');
    console.log('Sources: llm.int.exe.xyz (exe.dev llm integration, Fireworks gateway), openrouter.int.exe.xyz (OpenRouter catalog integration).');
    console.log('Configured on exe.dev → Integrations. Shelley discovers attached llm integrations via reflection.');
    let via = '';
    for (const entry of SHELLEY_LLMS) {
      if (entry.via !== via) {
        via = entry.via;
        console.log(`\n${via}  ${entry.host}`);
      }
      const mark = entry.default ? '  (default)' : '';
      console.log(`  ${entry.id}${mark}`);
      console.log(`    ${entry.label}`);
    }
  } else if (command === 'model') {
    const requested = named.model ?? positional[0];
    printModelResolution(resolveShelleyModel({ requested }));
  } else if (command === 'shelley') {
    const vm = positional[0];
    const message = positional.slice(1).join(' ');
    if (!vm || !message) throw new Error('usage: vmops shelley <vm> "<message>" [--model NAME]');
    const choice = resolveShelleyModel({ requested: named.model });
    printModelResolution(choice);
    const host = normalizeVm(vm).replace(/\.exe\.xyz$/, '');
    execFileSync('ssh', [...SSH, 'exe.dev', 'shelley', 'prompt', `--model=${choice.id}`, host, JSON.stringify(message)], {
      stdio: 'inherit',
    });
  } else if (command === 'ask') {
    const vm = positional[0];
    const message = positional.slice(1).join(' ');
    if (!vm || !message) throw new Error('usage: vmops ask <vm> "<message>"');
    vmRunInherit(vm, `scout ask --to exedev ${JSON.stringify(message)}`);
  } else if (command === 'wait') {
    const vm = positional[0];
    if (!vm) throw new Error('usage: vmops wait <vm> [-n N]');
    const lines = named.n ?? 8;
    vmRunInherit(vm, `sleep 2; scout latest --limit ${lines} -o short 2>/dev/null || scout latest --limit ${lines}`);
  } else if (command === 'ship') {
    const vm = positional[0];
    if (!vm) throw new Error('usage: vmops ship <vm>');
    const studios = await discoverStudios();
    if (studios.length === 0) throw new Error(`no studios found under ~/dev (expected <project>/.studio/studio.json)`);
    for (const studio of studios) {
      console.log(`==> ${studio.name}`);
      execFileSync('bun', [STUDIO_CLI, 'sync', '--dir', studio.dir, '--host', vm], { stdio: 'inherit' });
    }
    console.log('==> host-deploy');
    execFileSync('bun', [STUDIO_CLI, 'host-deploy', '--host', vm, '--json'], { stdio: 'inherit' });
    console.log(`Shipped ${studios.map((s) => s.name).join(', ')} + host → ${vm}`);
  } else if (command === 'bootstrap') {
    const vm = positional[0];
    if (!vm) throw new Error('usage: vmops bootstrap <vm>');
    execFileSync('bun', [STUDIO_CLI, 'bootstrap', '--host', vm, '--with-agent'], { stdio: 'inherit' });
  } else {
    printHelp();
  }
} catch (error) {
  console.error(`vmops: ${error.message ?? error}`);
  process.exitCode = 1;
}
