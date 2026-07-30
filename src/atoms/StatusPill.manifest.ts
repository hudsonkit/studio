import type { ComponentManifest } from "../components/manifest";

/**
 * StatusPill's manifest — the specimen for `@arach/studio/components` in this
 * repo. If you are writing the second manifest, copy this one and delete what
 * does not apply. Note what it does NOT do: it never restates the source.
 * Props carry what a prop's *name and type cannot* say, and states are the
 * ones an adopter gets wrong.
 */
export const statusPillManifest: ComponentManifest = {
  id: "status-pill",
  name: "StatusPill",
  status: "graduated",
  summary:
    "Mono-caps status chip that colors itself from the consumer's --status-{tone} CSS vars, replacing hand-rolled per-app badge markup.",
  keywords: [
    "status",
    "pill",
    "badge",
    "chip",
    "tag",
    "label",
    "state indicator",
    "tone",
    "status dot",
  ],
  whenToUse: [
    "Anywhere a page, row or strip needs a compact read-only status marker — registry pages, host leases, health checks.",
    "Surfaces that must theme-flip for free: colors come from the consumer's --status-{tone}-fg/bg vars, not from the component.",
    "As the typed half of createStatusPalette, which binds the pill to a consumer's status union (tone + label lookups included).",
  ],
  whenNotToUse: [
    "Interactive filters or toggles — it renders a span, not a button; reaching for onClick means you want a different control.",
    "Long prose or multi-word sentences — the 9px mono caps treatment is for one or two words.",
    "Statuses outside the five tones (ok, warn, error, info, neutral) unless the consumer defines matching --status-* vars first.",
  ],
  import: {
    from: "studio/atoms",
    symbols: [
      "StatusPill",
      "StatusPillProps",
      "StatusPillVariant",
      "StatusTone",
      "StatusEntry",
      "StatusPalette",
      "createStatusPalette",
    ],
  },
  props: [
    {
      name: "tone",
      type: "StatusTone",
      required: true,
      summary:
        "Picks the --status-{tone}-fg/bg var pair, so the palette lives in the consumer's globals rather than in the component.",
    },
    {
      name: "label",
      type: "string",
      required: true,
      summary: "Rendered verbatim in mono caps; keep it to one or two words.",
    },
    {
      name: "variant",
      type: "StatusPillVariant",
      default: '"filled"',
      summary:
        "filled is the bordered chip, outlined drops the bg, text is bare colored caps for dense rows.",
    },
    {
      name: "className",
      type: "string",
      summary: "Appended to the span; layout tweaks only, never color overrides.",
    },
  ],
  states: [
    {
      name: "Missing theme vars",
      trigger: "Consumer globals do not define --status-{tone}-fg/bg for the passed tone",
      behavior:
        "Renders with unset (inherited) color and transparent background — visible as an unstyled pill, not a crash, so the gap is obvious in review.",
    },
    {
      name: "Over-long label",
      trigger: "A label beyond two short words",
      behavior:
        "Grows inline without truncation; the 9px tracking makes long text read as shouting, which is the signal to shorten the label.",
    },
  ],
  a11y: [
    "Purely presentational span — status must also be conveyed by adjacent text or the row's accessible name; the pill alone is color-plus-caps.",
    "No interactive states: it is never focusable and never receives pointer handlers.",
  ],
  dependencies: {
    tokens: ["--status-{tone}-fg", "--status-{tone}-bg"],
  },
  examples: [
    {
      title: "Drop-in",
      summary: "The whole adoption cost, given the consumer's globals define the tone vars.",
      code: `<StatusPill tone="ok" label="GRADUATED" />`,
    },
    {
      title: "Bound to a status union",
      summary:
        "createStatusPalette gives a pill typed to the consumer's own statuses plus tone/label/color lookups for dots and strips.",
      code: `const palette = createStatusPalette({
  proposed: { tone: "info", label: "PROPOSED" },
  "in-flight": { tone: "warn", label: "IN FLIGHT" },
});

<palette.StatusPill status="in-flight" variant="outlined" />`,
    },
    {
      title: "Text variant in a dense row",
      code: `<StatusPill tone="error" label="STOPPED" variant="text" />`,
    },
  ],
  atom: "/studio/package/atoms",
  source: ["src/atoms/StatusPill.tsx", "src/atoms/index.ts"],
  port: {
    status: "none",
    notes:
      "This package IS the shared home — consumers import it directly, so there is no production counterpart to drift against.",
  },
};
