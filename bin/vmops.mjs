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
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) named[arg.replace(/^--?/, '')] = next;
      else named[arg.replace(/^--?/, '')] = true;
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
  vmops ship <vm>               sync every project studio + host-deploy
  vmops bootstrap <vm>          full studio provision
`);
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
