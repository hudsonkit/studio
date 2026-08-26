"use client";

import { useState } from "react";
import "./actionControllerStudy.css";

/**
 * Faithful HTML design harness for Action's native StageHUDRootView and
 * StageOverlayView. This page owns no capture state and sends no commands.
 */

export type PreviewPhase = "staging" | "countdown" | "recording" | "completing" | "completed";

type PhaseModel = {
  status: string;
  readout: string;
  accent: "neutral" | "coral" | "amber";
};

const PHASES: Record<PreviewPhase, PhaseModel> = {
  staging: { status: "Ready", readout: "Ready", accent: "neutral" },
  countdown: { status: "Starting", readout: "3", accent: "neutral" },
  recording: { status: "Recording", readout: "00:08", accent: "coral" },
  completing: { status: "Saving", readout: "Saving", accent: "neutral" },
  completed: { status: "Saved", readout: "Saved", accent: "neutral" },
};

const PHASE_LABELS: Array<[PreviewPhase, string]> = [
  ["staging", "Staging"],
  ["countdown", "Countdown"],
  ["recording", "Recording"],
  ["completing", "Saving"],
  ["completed", "Saved"],
];

function NativeKeyChord() {
  return (
    <div className="act-hud-key-caption" aria-label="Command Shift Option P">
      <span className="is-modifier">⌘</span>
      <i aria-hidden="true">+</i>
      <span className="is-modifier">⇧</span>
      <i aria-hidden="true">+</i>
      <span className="is-modifier">⌥</span>
      <i aria-hidden="true">+</i>
      <strong>P<i aria-hidden="true" /></strong>
    </div>
  );
}

function CalculatorWindow({ completed }: { completed: boolean }) {
  return (
    <div className="act-hud-calculator" aria-label="Calculator capture target">
      <div className="act-hud-calculator__chrome"><i /><i /><i /><span>Calculator</span></div>
      <div className="act-hud-calculator__body">
        <div className="act-hud-calculator__display"><small>12 + 30</small><strong>{completed ? "42" : "30"}</strong></div>
        <div className="act-hud-calculator__keys" aria-hidden="true">
          {["AC", "±", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="].map((key) => (
            <i key={key} className={key === "+" || key === "=" ? "is-coral" : ""}>{key}</i>
          ))}
        </div>
      </div>
    </div>
  );
}

function BookmarkButton({ icon, label, small = false }: { icon: string; label: string; small?: boolean }) {
  return (
    <button type="button" className={small ? "is-small" : ""} aria-label={`${label}, design preview only`}>
      <span aria-hidden="true">{icon}</span>{small ? null : label}
    </button>
  );
}

function OverlayHUD({ phase, model }: { phase: PreviewPhase; model: PhaseModel }) {
  return (
    <aside className={`act-hud-bookmark is-${model.accent} is-${phase}`} aria-label={`Action overlay HUD, ${model.status.toLowerCase()}`}>
      <div className="act-hud-bookmark__status"><i /><span>{model.status}</span></div>
      <output aria-label={phase === "countdown" ? `Capture begins in ${model.readout}` : `Capture readout ${model.readout}`}>
        {model.readout}
      </output>

      <section className="act-hud-bookmark__controls" aria-label="Preview controls">
        {phase === "completing" ? (
          <div className="act-hud-bookmark__busy"><span /><small>Writing</small></div>
        ) : phase === "countdown" ? (
          <div className="act-hud-bookmark__pair">
            <BookmarkButton icon="▶" label="Start Now" />
            <BookmarkButton icon="■" label="Cancel" />
          </div>
        ) : phase === "recording" ? (
          <BookmarkButton icon="■" label="End" />
        ) : (
          <>
            <BookmarkButton icon={phase === "completed" ? "↺" : "●"} label={phase === "completed" ? "Replay" : "Start"} />
            <div className="act-hud-bookmark__hardware">
              <BookmarkButton icon="×" label={phase === "completed" ? "Dismiss" : "Clear"} small />
              <BookmarkButton icon="⏻" label="Quit" small />
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

export function ActionControllerStudy({ initialPhase = "recording" }: { initialPhase?: PreviewPhase }) {
  const [phase, setPhase] = useState<PreviewPhase>(initialPhase);
  const model = PHASES[phase];

  return (
    <main className="act-hud-study">
      <header className="act-hud-study__header">
        <div>
          <p>Action · native overlay study</p>
          <h1>Recording bookmark, in context.</h1>
          <span>Faithful HTML design harness for StageHUDRootView + StageOverlayView</span>
        </div>
        <div className="act-hud-study__legend"><i /><span>Design preview only</span><strong>No runtime attached</strong></div>
      </header>

      <nav className="act-hud-study__states" aria-label="Preview native HUD state">
        {PHASE_LABELS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={phase === value} onClick={() => setPhase(value)}>{label}</button>
        ))}
      </nav>

      <section className={`act-hud-desktop is-${phase}`} aria-label="Simulated macOS recording screen">
        <div className="act-hud-desktop__wallpaper" aria-hidden="true"><i /><i /></div>
        <div className="act-hud-desktop__menubar"><span>● ● ●</span><strong>Action recording test</strong><time>09:41</time></div>
        <div className="act-hud-desktop__capture">
          <div className="act-hud-desktop__capture-label"><span>CAPTURE VIEWPORT</span><strong>960 × 620</strong></div>
          <CalculatorWindow completed={phase === "completed"} />
          {phase === "recording" ? <NativeKeyChord /> : null}
          {phase === "countdown" ? <div className="act-hud-countdown">3</div> : null}
          <i className="act-hud-desktop__corner act-hud-desktop__corner--tl" />
          <i className="act-hud-desktop__corner act-hud-desktop__corner--tr" />
          <i className="act-hud-desktop__corner act-hud-desktop__corner--bl" />
          <i className="act-hud-desktop__corner act-hud-desktop__corner--br" />
        </div>
        <OverlayHUD phase={phase} model={model} />
        <div className="act-hud-desktop__caption"><span>Native HUD · 82 × 184 · edge docked</span><i /><span>Key overlay · viewport anchored</span></div>
      </section>
    </main>
  );
}
