import { readFile } from "node:fs/promises";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ProjectEntry {
  id: string;
  url: string;
  mode: string;
  shippedAt: string;
}

/**
 * Index of studios shipped to this VM by `studio deploy-project`. The deploy
 * command maintains ~/studios/index.json; this page renders it as the
 * navigation surface for every available project studio.
 */
export default async function ProjectsPage() {
  let projects: ProjectEntry[] = [];
  try {
    projects = JSON.parse(await readFile("/home/exedev/studios/index.json", "utf8"));
  } catch {
    projects = [];
  }

  return (
    <main className="min-h-screen bg-studio-canvas text-studio-ink">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-studio-ink-faint">
          Studio · Cloud
        </p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Projects</h1>
        <p className="mt-3 text-sm text-studio-ink-faint">
          Studios shipped to this machine. Each runs its own server; design work
          happens here and renders live.
        </p>
        <ul className="mt-10 divide-y divide-studio-rule border-y border-studio-rule">
          {projects.length === 0 && (
            <li className="py-6 text-sm text-studio-ink-faint">
              No projects shipped yet — run{" "}
              <code className="font-code text-xs">studio deploy-project --path …</code>.
            </li>
          )}
          {projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between py-5">
              <div>
                <a
                  href={project.url}
                  className="font-display text-lg font-medium tracking-tight hover:underline"
                >
                  {project.id}
                </a>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-studio-ink-faint">
                  {project.mode} · shipped {new Date(project.shippedAt).toISOString().slice(0, 16).replace("T", " ")}
                </p>
              </div>
              <a
                href={project.url}
                className="border border-studio-rule px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-studio-ink-faint transition hover:border-studio-rule-strong hover:text-studio-ink-strong"
              >
                Open studio
              </a>
            </li>
          ))}
        </ul>
        <Link
          href="/"
          className="mt-10 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-studio-ink-faint transition hover:text-studio-ink-strong"
        >
          ← Studio home
        </Link>
      </div>
    </main>
  );
}
