/**
 * Flow discuss — quick agent feedback on a map selection.
 *
 * Flow is a Studio capability used per product project. The consumer supplies
 * the project identity instead of coupling Studio to one product repo.
 */

import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_PROJECT_ROOT =
  process.env.STUDIO_FLOWS_DISCUSS_PROJECT ?? process.cwd();

export type DiscussRequest = {
  message: string;
  context?: string;
  includeContext?: boolean;
  /** Absolute path to the product project this map belongs to */
  projectRoot?: string | null;
  /** Short label for prompts (e.g. "Fieldwork") */
  projectName?: string | null;
  /** Prior scout ref for multi-turn continuity */
  ref?: string | null;
};

export type DiscussResult = {
  ok: boolean;
  reply?: string;
  ref?: string;
  projectRoot?: string;
  projectName?: string;
  error?: string;
  raw?: string;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function extractRef(text: string): string | undefined {
  const m =
    text.match(/\bref:([a-z0-9-]+)/i) ??
    text.match(/ref:\s*([a-z0-9-]+)/i) ??
    text.match(/Ref:\s*([a-z0-9-]+)/i);
  return m?.[1];
}

function extractReply(text: string): string {
  const cleaned = text
    .replace(/^asking .+$/gim, "")
    .replace(/^asked .+$/gim, "")
    .replace(/^Next: .+$/gim, "")
    .replace(/^Flight: .+$/gim, "")
    .replace(/^Invocation: .+$/gim, "")
    .replace(/^State: .+$/gim, "")
    .replace(/^running - .+$/gim, "")
    .replace(/^queued - .+$/gim, "")
    .trim();
  if (cleaned.length > 40) return cleaned;
  return text.trim();
}

async function runScout(
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("scout", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ code: 124, out: out || "scout timed out" });
    }, timeoutMs);
    child.stdout?.on("data", (c) => {
      out += String(c);
    });
    child.stderr?.on("data", (c) => {
      out += String(c);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 127, out: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
  });
}

/**
 * Product-specific orientation for the discuss agent.
 * Keep short — Scout also loads project AGENTS.md from --project.
 */
function projectCalibration(projectName: string, projectRoot: string): string {
  return [
    `You are giving quick design/product feedback for **${projectName}**.`,
    `Flows is the journey map surface; calibrate to this product project.`,
    `Project root: ${projectRoot}`,
    `Read AGENTS.md and docs/ at the project root when relevant.`,
  ].join("\n");
}

export async function runDiscuss(req: DiscussRequest): Promise<DiscussResult> {
  const message = req.message?.trim() ?? "";
  if (!message) return { ok: false, error: "empty message" };

  const projectRoot = (req.projectRoot?.trim() || DEFAULT_PROJECT_ROOT).replace(
    /\/$/,
    "",
  );
  const projectName =
    req.projectName?.trim() ||
    projectRoot.split("/").filter(Boolean).pop() ||
    "project";

  if (!(await pathExists(projectRoot))) {
    return {
      ok: false,
      error: `project root not found: ${projectRoot}`,
      projectRoot,
      projectName,
    };
  }

  const include = req.includeContext !== false;
  const context = (req.context ?? "").trim();

  const prompt = [
    projectCalibration(projectName, projectRoot),
    "",
    "Be concrete and short. Prefer 3–8 sentences or a tight bullet list.",
    "Respond to the selection and the user's note — do not redesign the whole product unprompted.",
    "No hire/no-hire scores, no personality inference.",
    "",
    include && context
      ? `## Map selection context\n\n${context}\n`
      : "",
    `## User\n\n${message}\n`,
  ]
    .filter(Boolean)
    .join("\n");

  const dir = await mkdtemp(join(tmpdir(), "flow-discuss-"));
  const promptPath = join(dir, "prompt.md");
  try {
    await writeFile(promptPath, prompt, "utf8");

    const args = [
      "ask",
      "--project",
      projectRoot,
      "--harness",
      "claude",
      "--timeout",
      "90",
      "--label",
      `flow:discuss:${projectName.toLowerCase()}`,
      "--prompt-file",
      promptPath,
    ];
    if (req.ref?.trim()) {
      args.splice(1, 0, "--ref", req.ref.trim());
    }

    // cwd = product project so relative paths / AGENTS.md resolve naturally
    const { code, out } = await runScout(args, projectRoot, 95_000);
    const ref = extractRef(out) ?? req.ref?.trim() ?? undefined;
    if (code !== 0 && !out.trim()) {
      return {
        ok: false,
        error: `scout exit ${code}`,
        ref,
        projectRoot,
        projectName,
        raw: out,
      };
    }

    const reply = extractReply(out);
    if (!reply) {
      return {
        ok: false,
        error: "no reply text from scout",
        ref,
        projectRoot,
        projectName,
        raw: out,
      };
    }

    const pending =
      /still running|acknowledged via|queued for local/i.test(out) &&
      reply.length < 200;

    return {
      ok: true,
      reply: pending
        ? `${reply}\n\n_(Agent is still working — follow up in this thread.)_`
        : reply,
      ref,
      projectRoot,
      projectName,
      raw: out,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      projectRoot,
      projectName,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
