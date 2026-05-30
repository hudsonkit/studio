import { ArrowRight } from "lucide-react";
import { useStudioRouter } from "studio/router";
import { HOME_HREF, pages, type SamplePage } from "@/studio/studioRegistry";

export function renderSamplePage({
  pathname,
  page,
}: {
  pathname: string;
  page: SamplePage | undefined;
}) {
  if (pathname === HOME_HREF) return <NorthStarPage />;
  if (page) return <DetailPage page={page} />;
  return <NotFoundPage />;
}

function NorthStarPage() {
  const { Link } = useStudioRouter();
  const entries = pages.filter((page) => page.href !== HOME_HREF);

  return (
    <main className="mx-auto max-w-5xl px-7 py-12">
      <header className="border-b border-studio-rule pb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-studio-ink-faint">
          sample studio / north star
        </div>
        <h1 className="mt-4 max-w-[760px] text-[46px] font-medium leading-tight text-studio-ink-strong">
          A proper Hudson Studio with local content.
        </h1>
        <p
          className="mt-5 max-w-[64ch] text-[15px] leading-[1.7] text-studio-ink"
          style={{ fontFamily: "var(--studio-font-serif)" }}
        >
          The package supplies shell, navigation, page strip, status treatment,
          theme aliases, and router wiring. The app supplies taxonomy, docs, and
          product-specific pages.
        </p>
      </header>

      <section className="py-8">
        <ul className="divide-y divide-studio-rule border-y border-studio-rule">
          {entries.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="group grid gap-3 py-4 transition-colors hover:bg-studio-chip-bg md:grid-cols-[120px_1fr_20px]"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-studio-ink-faint">
                  {entry.bucket}
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-studio-ink-strong">
                    {entry.label}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-studio-ink-faint">
                    {entry.blurb}
                  </span>
                </span>
                <ArrowRight
                  size={15}
                  className="self-center text-studio-ink-faint transition-transform group-hover:translate-x-1"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function DetailPage({ page }: { page: SamplePage }) {
  return (
    <main className="mx-auto max-w-4xl px-7 py-12">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-studio-ink-faint">
        {page.bucket} / {page.surface}
      </div>
      <h1 className="mt-4 text-[40px] font-medium leading-tight text-studio-ink-strong">
        {page.label}
      </h1>
      <p
        className="mt-4 max-w-[62ch] text-[15px] leading-[1.7] text-studio-ink"
        style={{ fontFamily: "var(--studio-font-serif)" }}
      >
        {page.blurb}
      </p>
    </main>
  );
}

function NotFoundPage() {
  const { Link } = useStudioRouter();
  return (
    <main className="mx-auto max-w-3xl px-7 py-16">
      <h1 className="text-[34px] font-medium text-studio-ink-strong">
        Page not found.
      </h1>
      <Link
        href={HOME_HREF}
        className="mt-6 inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-studio-ink-faint hover:text-studio-ink"
      >
        Back to North Star
      </Link>
    </main>
  );
}
