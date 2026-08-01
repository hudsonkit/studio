import { ActionStage } from "@/studio/studies/actKeycap/ActionStage";
import {
  SCENE_KEYS,
  SCENE_LABEL,
  type KeyCaptionScene,
} from "@/studio/studies/actKeycap/scenes";
import {
  KeyCaptionOpusA,
  KeyCaptionOpusB,
} from "@/studio/studies/actKeycap/KeyCaptions";
import { BASELINE, SPECS } from "@/studio/studies/actKeycap/specs";

const TREATMENTS = { a: KeyCaptionOpusA, b: KeyCaptionOpusB } as const;

/**
 * ACT-KEYCAP review index — both treatments, both scenes, plus the spec sheet.
 *
 * Standalone render route: this study is intentionally *not* registered in
 * studioRegistry.ts / StudioPages.tsx, because those files carry unrelated
 * in-progress Talkie study edits in this checkout.
 */

const SCENES: readonly KeyCaptionScene[] = ["return", "chord"];

export default function ActKeycapIndex() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 40px 96px",
        background: "#0f1112",
        color: "#e8e5df",
        fontFamily: "ui-sans-serif, -apple-system, system-ui, sans-serif",
      }}
    >
      <header style={{ maxWidth: 1000, marginBottom: 40 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#ef6a47",
            margin: "0 0 10px",
          }}
        >
          Action · live keyboard-action captions
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 600, margin: "0 0 12px" }}>
          Two caption treatments
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#a8a49c", margin: 0 }}>
          Design exploration only — no Action source is modified. Baseline is the
          shipping <code>KeyCaptionRenderer</code> ({BASELINE.chord} chord,{" "}
          {BASELINE.return} return): {BASELINE.note}. Every scene below renders in
          the same 960 × 540 capture viewport with the caption pinned to{" "}
          <code>viewport.minY + 24</code>.
        </p>
      </header>

      {(["a", "b"] as const).map((key, index) => {
        const spec = SPECS[index];
        const Caption = TREATMENTS[key];

        return (
          <section key={key} style={{ marginBottom: 72 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>
              {spec.id} · {spec.name}
            </h2>
            <p
              style={{
                fontSize: 14.5,
                lineHeight: 1.65,
                color: "#a8a49c",
                maxWidth: 940,
                margin: "0 0 24px",
              }}
            >
              {spec.thesis}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 28 }}>
              {SCENES.map((scene) => (
                <figure key={scene} style={{ margin: 0 }}>
                  <div
                    style={{
                      width: 960,
                      height: 540,
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <ActionStage caption={<Caption keys={SCENE_KEYS[scene]} />} />
                  </div>
                  <figcaption
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      letterSpacing: "0.06em",
                      color: "#79756e",
                    }}
                  >
                    {SCENE_LABEL[scene]} — /renders/act-keycap/{key}/{scene}
                  </figcaption>
                </figure>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 20,
                maxWidth: 1960,
              }}
            >
              {(
                [
                  ["Material", spec.material],
                  ["Typography", spec.typography],
                  ["Dimensions", spec.dimensions],
                  ["Timing", spec.timing],
                  ["Tradeoffs", spec.tradeoffs],
                ] as const
              ).map(([title, items]) => (
                <div
                  key={title}
                  style={{
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 8,
                    padding: "16px 18px",
                    background: "#141718",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "#79756e",
                      margin: "0 0 12px",
                    }}
                  >
                    {title}
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc" }}>
                    {items.map((item) => (
                      <li
                        key={item}
                        style={{
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: "#b6b2aa",
                          marginBottom: 7,
                        }}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
