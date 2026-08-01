/**
 * ACT-KEYCAP — treatment specs.
 *
 * Baseline for comparison is the shipping `KeyCaptionRenderer` in
 * native/engine/Sources/ActionHostMain.swift: a 264x72 graphite panel with
 * 48pt extruded keycaps, coral "+" connectors and a coral tick on the panel
 * top edge.
 */

export type TreatmentSpec = {
  id: string;
  name: string;
  thesis: string;
  material: readonly string[];
  typography: readonly string[];
  dimensions: readonly string[];
  timing: readonly string[];
  tradeoffs: readonly string[];
};

export const BASELINE = {
  chord: "264 × 72",
  return: "76 × 72",
  note: "graphite panel · 48pt extruded caps · coral '+' connectors · coral tick on top edge",
};

export const SPECS: readonly TreatmentSpec[] = [
  {
    id: "ACT-KEYCAP-OPUS-A",
    name: "Letterpress Plate",
    thesis:
      "Invert the material. One paper plate divided into ruled cells instead of a dark slab carrying separate 3D caps. Nothing is extruded — hierarchy is paper value plus type weight, so the caption reads as a printed legend over the capture rather than a floating keyboard fragment.",
    material: [
      "Plate: vertical gradient paper #FBF7EF → #F3EBDD, 10px radius, 1px ink @16% border",
      "Elevation: 0/7/20 black @38% drop shadow + 0/1/2 black @40% contact shadow + 1px white @50% inner top",
      "Modifier cells: recessed paper #EBE1CF @55–95%, one value back from the sheet",
      "Action cell: keeps the bright sheet — the lit cell inside the plate",
      "Dividers: 1px ink @14%, inset 10px top and bottom so they never meet the plate radius",
      "Coral: exactly one instance — the 32×2.5 action-key rule, 7px above the plate floor",
    ],
    typography: [
      "Modifier glyphs: SF Pro Text 19pt regular, ink @58%",
      "Action key: SF Pro Text 19pt semibold, ink @100%, +0.02em tracking",
      "Solo glyph (Return ↩): SF Pro Text 22pt medium, ink @100%",
      "Weight and value carry the modifier → action hierarchy; no size jump, no fill swap",
    ],
    dimensions: [
      "Plate height 44 (baseline 72) · radius 10 (baseline 15)",
      "Cells: modifier 44w · action 52w · solo 76w · dividers are 1px, not a 18pt gutter",
      "Return: 76 × 44 · Chord: 184 × 44 (44×3 + 52)",
      "Chord footprint is 57% smaller in area than the 264 × 72 baseline",
    ],
    timing: [
      "Entrance 160ms · easeOutQuart (1-(1-t)⁴) · alpha 0→1 · offsetY +6→0 (rises into place) · scale 0.99→1",
      "Accent wipe 120ms starting at t=160ms · coral action rule grows 0 → 32px, linear",
      "Hold: `duration-ms` (default 1700ms), floored at 900ms so a fast chord is still readable",
      "Exit 120ms · easeInQuad · alpha 1→0 · offsetY 0→+4 · scale held at 1",
      "Re-signature while visible: 90ms cut-out, no gap, 140ms entrance",
    ],
    tradeoffs: [
      "Paper-on-dark is a bright object; on a light capture surface it loses separation and leans entirely on the drop shadow",
      "Modifiers at ink @58% are the lowest-contrast element in either treatment — legible at 100% but the first thing to fail on a downscaled thumbnail",
      "The plate reads less literally as 'a keyboard', which is a cost for viewers who scan for keycap shapes",
      "Cell widths are fixed, so an unusually wide named key needs a width rule the baseline gets for free",
    ],
  },
  {
    id: "ACT-KEYCAP-OPUS-B",
    name: "Machined Rail",
    thesis:
      "Keep graphite, drop the keyboard metaphor. A low-profile rail with debossed modifier wells and a single paper inlay for the action key — machined out rather than extruded up. Monospaced type reads as an instrument readout, which is what a keystroke caption actually is.",
    material: [
      "Rail: vertical gradient #171C1D → #0B0F10, radius 13, 1px paper @11% border",
      "Elevation: 0/8/22 black @45% drop shadow + 1px paper @7% inner top",
      "Modifier wells: flat #080B0C with a 1px black @85% top inner edge and 1px paper @9% bottom inner edge — the exact inverse of the baseline's raised cap",
      "Action inlay: paper gradient #FBF7EF → #F3EBDD, 1px ink @22% border — the only lit element",
      "Coral: the 2px inlay lip (inset 8px each side) plus 3px separator dots @78%",
    ],
    typography: [
      "SF Mono throughout — the readout register, distinct from the app's UI face",
      "Modifier glyphs: 17pt medium, paper @76%",
      "Action key: 16pt semibold, ink, uppercase, +0.06em tracking",
      "Solo glyph (Return ↩): 18pt semibold, ink, no tracking",
    ],
    dimensions: [
      "Rail height 40 (baseline 72) · radius 13 · 9px end padding · radii are concentric (13 − 5px vertical inset = the 8px well/inlay radius)",
      "Well 32 × 30, radius 8 · Inlay min 36 × 30 (40 solo), radius 8, 9px padding",
      "Separator gutter 14px with a 3px dot — replaces the 18pt '+' glyph",
      "Return: 50 × 40 — a single key needs no rail to bind it, so end padding collapses 9 → 5 and the rail becomes an even 5px bezel on all four sides",
      "Chord: 192 × 40",
      "Chord footprint is 60% smaller in area than the 264 × 72 baseline",
    ],
    timing: [
      "Entrance 150ms · rail 0–90ms easeOutQuint · scaleX 0.92→1 · alpha 0→1 · offsetY +4→0",
      "Glyph stagger: each key 60ms alpha 0→1, start = 60ms + index×18ms, left→right; 4-key chord settles at 174ms",
      "Hold: `duration-ms` (default 1700ms), floored at 800ms",
      "Exit 110ms · easeInQuad · alpha 1→0 · scaleX 1→0.97 · no vertical travel",
      "Re-signature while visible: rail holds, glyphs re-stagger over 100ms",
    ],
    tradeoffs: [
      "Debossed wells are low contrast by construction; on a graphite-heavy capture the rail edge is the only thing separating it from the background",
      "The 3px separator dot is the smallest mark in either treatment — it survives at 1× but is the first casualty of a 2× downscale",
      "Mixing SF Mono with the product's UI face is deliberate but reads as a second voice if the caption ever sits next to product chrome",
      "40pt tall is a real legibility floor; there is no headroom left for a taller named key like 'Return' spelled out",
    ],
  },
];
