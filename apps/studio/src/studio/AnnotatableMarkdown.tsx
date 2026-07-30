"use client";

import { useCallback, useMemo } from "react";
import {
  AnnotatableDoc,
  persistAnnotations,
  type Annotation,
  type SendPassPayload,
} from "studio/doc";
import { sendStudioScoutMessage } from "studio/scout";
import { useStudioScout } from "@/studio/StudioScoutProvider";
import type { StudioAppPage } from "@/studio/studioRegistry";

/**
 * Markdown page with the annotation pass wired to the Studio's live services:
 * highlights/notes persist to `.studio/annotations/<page>.json` (readable by
 * any local agent), and "Send pass" dispatches the formatted pass over Scout
 * to the agent picked in the modal — the same registry that backs the drawer's
 * target picker, with the drawer's current target offered first.
 */
export function AnnotatableMarkdown({
  page,
  body,
}: {
  page: StudioAppPage;
  body: string;
}) {
  const { agents, target } = useStudioScout();
  // Pages aren't required to declare an id; fall back to the href tail.
  const slug = page.id ?? page.href.split("/").filter(Boolean).pop() ?? "page";

  const sendTargets = useMemo(() => {
    const ordered = target
      ? [target, ...agents.filter((a) => a.selector !== target.selector)]
      : agents;
    return ordered.map((a) => ({ id: a.selector, label: a.label }));
  }, [agents, target]);

  const handleAnnotationsChange = useCallback(
    (annotations: Annotation[]) => {
      void persistAnnotations({ persistKey: slug, slug, annotations });
    },
    [slug],
  );

  const handleSendPass = useCallback(
    async (payload: SendPassPayload) => {
      const addressed = payload.target
        ? agents.find((a) => a.selector === payload.target)
        : undefined;
      await sendStudioScoutMessage({
        body: payload.formatted,
        // Intent left unset: the addressed target's manifest default applies.
        target: addressed
          ? { agent: addressed.selector, label: addressed.label, intent: addressed.intent }
          : undefined,
        context: {
          title: `${payload.docTitle} — annotation pass`,
          url: window.location.href,
        },
      });
    },
    [agents],
  );

  return (
    <AnnotatableDoc
      body={body}
      slug={slug}
      docTitle={page.label}
      persistKey={slug}
      sendTargets={sendTargets.length > 0 ? sendTargets : undefined}
      onAnnotationsChange={handleAnnotationsChange}
      onSendPass={handleSendPass}
    />
  );
}
