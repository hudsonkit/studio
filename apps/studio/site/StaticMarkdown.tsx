import { AnnotatableDoc } from "studio/doc";
import type { StudioAppPage } from "@/studio/studioRegistry";

/**
 * Stands in for `@/studio/AnnotatableMarkdown` on the static site: the
 * annotation pass still works in the page, but nothing is persisted or sent,
 * since there is no local host behind it.
 */
export function AnnotatableMarkdown({ page, body }: { page: StudioAppPage; body: string }) {
  const slug = page.id ?? page.href.split("/").filter(Boolean).pop() ?? "page";
  return <AnnotatableDoc body={body} slug={slug} docTitle={page.label} />;
}
