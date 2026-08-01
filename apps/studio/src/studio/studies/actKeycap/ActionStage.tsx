"use client";

import type { ReactNode } from "react";
import "./actionStage.css";

/**
 * ACT-KEYCAP shared capture stage.
 *
 * Reproduces the 960x540 Action capture viewport from the reference renders
 * so both keyboard-caption treatments are evaluated in identical context.
 * The caption slot sits bottom-centred at `viewport.minY + 24`, matching
 * `StageOverlayView.drawKeyOverlay` in ActionHostMain.swift.
 */

const DOC_LINES: readonly { top: number; text: string }[] = [
  { top: 32, text: "The capture reads as one continuous instinct." },
  { top: 116, text: "Each turn is folded back into the same capsule." },
  { top: 158, text: "Nothing is lost between the two documents." },
  {
    top: 203,
    text: "duction build passes, and the route/status interactions were verified.",
  },
];

const RAIL_ITEMS: readonly { top: number; text: string }[] = [
  { top: 15, text: "Tape Tra" },
  { top: 51, text: "Recordin" },
  { top: 183, text: "Home" },
  { top: 219, text: "Library" },
  { top: 254, text: "Memo Det" },
  { top: 290, text: "Dictatio" },
  { top: 326, text: "Compose" },
  { top: 361, text: "Notes" },
  { top: 397, text: "Capture" },
  { top: 433, text: "Command" },
  { top: 468, text: "Onboardi" },
  { top: 504, text: "Recordin" },
];

export function ActionStage({ caption }: { caption: ReactNode }) {
  return (
    <div className="act-stage">
      <div className="act-stage__doc">
        {DOC_LINES.map((line) => (
          <p className="act-stage__line" key={line.top} style={{ top: line.top }}>
            {line.text}
          </p>
        ))}

        <div className="act-stage__card" style={{ top: 268, height: 110 }}>
          <span className="act-stage__pill" style={{ top: 36, left: 490 }}>
            Open in
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <div className="act-stage__card" style={{ top: 396, height: 150 }}>
          <span className="act-stage__undo" style={{ top: 32, left: 424 }}>
            Undo
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M9 14L4 9l5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 9h9a7 7 0 010 14H9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="act-stage__undo-rule" />
          </span>
          <span className="act-stage__pill" style={{ top: 23, left: 522 }}>
            Review
          </span>
          <span className="act-stage__diff" style={{ top: 110, left: 540 }}>
            <span className="act-stage__diff-add">+14</span>
            <span className="act-stage__diff-del">-15</span>
          </span>
        </div>
      </div>

      <div className="act-stage__rail">
        <span className="act-stage__rail-eyebrow" style={{ top: 122 }}>
          · SURFAC
        </span>
        <span className="act-stage__rail-eyebrow" style={{ top: 150, left: 36, letterSpacing: "0.16em" }}>
          MAC
        </span>
        {RAIL_ITEMS.map((item) => (
          <span className="act-stage__rail-item" key={item.top} style={{ top: item.top }}>
            {item.text}
          </span>
        ))}
      </div>

      <div className="act-stage__caption">{caption}</div>
    </div>
  );
}

/*
 * Scene data lives in ./scenes.ts, not here: this is a "use client" module,
 * so plain objects exported from it reach server components as client
 * references rather than as the values themselves.
 */
