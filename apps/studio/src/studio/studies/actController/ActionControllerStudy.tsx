"use client";

import { useState } from "react";
import "./actionControllerStudy.css";

/**
 * Faithful HTML design harness for Action's native StageHUDRootView and
 * StageOverlayView. This page owns no capture state and sends no commands.
 */

type PreviewPhase = "staging" | "countdown" | "recording" | "completing" | "completed";

type PhaseModel = {
  status: string;
  instrumentTitle: string;
  readout: string;
  accent: "cyan" | "coral";
  summary: string;
  event: string;
  eventCount: string;
  primary: string;
};

const PHASES: Record<PreviewPhase, PhaseModel> = {
  staging: {
    status: "STAGING",
    instrumentTitle: "RECORDER READY",
    readout: "00:00",
    accent: "cyan",
    summary: "Guided capture session",
    event: "Surface staged · Calculator",
    eventCount: "02",
    primary: "START",
  },
  countdown: {
    status: "COUNTDOWN",
    instrumentTitle: "T−3",
    readout: "3",
    accent: "cyan",
    summary: "Capture area locked",
    event: "Capture begins in three seconds",
    eventCount: "04",
    primary: "START NOW",
  },
  recording: {
    status: "LIVE",
    instrumentTitle: "LIVE CAPTURE",
    readout: "00:08",
    accent: "coral",
    summary: "Press Command Shift Option P",
    event: "Press key · Command + Shift + Option + P",
    eventCount: "07",
    primary: "END TAKE",
  },
  completing: {
    status: "COMPLETING",
    instrumentTitle: "FINALIZING",
    readout: "WRITE",
    accent: "cyan",
    summary: "Packaging take 07",
    event: "Writing movie + marker",
    eventCount: "09",
    primary: "SAVING TAKE",
  },
  completed: {
    status: "COMPLETED",
    instrumentTitle: "TAKE SAVED",
    readout: "SAVED",
    accent: "cyan",
    summary: "calculator-take-07.mov",
    event: "Artifact verified · Take 07",
    eventCount: "10",
    primary: "REPLAY TAKE",
  },
};

const PHASE_LABELS: Array<[PreviewPhase, string]> = [
  ["staging", "Staging"],
  ["countdown", "Countdown"],
  ["recording", "Recording"],
  ["completing", "Saving"],
  ["completed", "Saved"],
];

function CaptureAperture({ active }: { active: boolean }) {
  const ticks = Array.from({ length: 32 }, (_, index) => index);

  return (
    <div className={`act-hud-aperture${active ? " is-active" : ""}`} aria-hidden="true">
      <span className="act-hud-aperture__crosshair act-hud-aperture__crosshair--x" />
      <span className="act-hud-aperture__crosshair act-hud-aperture__crosshair--y" />
      <span className="act-hud-aperture__ring act-hud-aperture__ring--outer" />
      <span className="act-hud-aperture__ring act-hud-aperture__ring--middle" />
      <span className="act-hud-aperture__ring act-hud-aperture__ring--inner" />
      <span className="act-hud-aperture__arc act-hud-aperture__arc--one" />
      <span className="act-hud-aperture__arc act-hud-aperture__arc--two" />
      <span className="act-hud-aperture__arc act-hud-aperture__arc--three" />
      {ticks.map((tick) => (
        <i key={tick} style={{ "--tick": tick } as React.CSSProperties} />
      ))}
    </div>
  );
}

function SignalTrace({ active }: { active: boolean }) {
  const heights = [3, 5, 7, 10, 6, 12, 8, 15, 11, 18, 13, 20, 15, 22, 17, 12, 19, 14, 16, 10, 13, 8, 10, 6, 8, 5, 6, 3];
  return (
    <div className={`act-hud-wave${active ? " is-active" : ""}`} aria-hidden="true">
      {heights.map((height, index) => <i key={`${height}-${index}`} style={{ height }} />)}
    </div>
  );
}

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

function OverlayHUD({ phase, model }: { phase: PreviewPhase; model: PhaseModel }) {
  const isRecording = phase === "recording";
  const isActive = isRecording || phase === "countdown";
  const isSaving = phase === "completing";

  return (
    <aside className={`act-hud-panel is-${model.accent}`} aria-label={`Action overlay HUD, ${model.status.toLowerCase()}`}>
      <div className="act-hud-panel__topline"><i /><i /><i /></div>
      <header className="act-hud-panel__header">
        <span className="act-hud-panel__mark">A</span>
        <i className="act-hud-panel__divider" />
        <strong>CALCULATOR</strong>
        <i className="act-hud-panel__divider" />
        <span className="act-hud-panel__status"><i />{model.status}</span>
      </header>

      <section className="act-hud-panel__instrument">
        <CaptureAperture active={isActive} />
        <div className="act-hud-panel__instrument-copy">
          <div className="act-hud-panel__instrument-label"><strong>{model.instrumentTitle}</strong><span>STEP 3 OF 5</span></div>
          <output aria-label={phase === "countdown" ? `Capture begins in ${model.readout}` : `Capture readout ${model.readout}`}>{model.readout}</output>
          <SignalTrace active={isActive} />
          <div className="act-hud-panel__summary"><i /><span>{model.summary}</span><i /></div>
        </div>
      </section>

      <section className="act-hud-panel__controls" aria-label="Preview controls">
        {isSaving ? (
          <div className="act-hud-panel__busy"><span className="act-hud-panel__spinner" /><strong>SAVING TAKE</strong><small>WRITING MOVIE + MARKER</small></div>
        ) : phase === "staging" ? (
          <div className="act-hud-panel__button-row has-hardware">
            <button type="button" className="is-hardware" aria-label="Clear, design preview only">×</button>
            <button type="button" aria-label="Start, design preview only"><span>●</span>START</button>
            <button type="button" className="is-hardware" aria-label="Quit, design preview only">⏻</button>
          </div>
        ) : phase === "countdown" ? (
          <div className="act-hud-panel__button-row has-pair">
            <button type="button" aria-label="Start Now, design preview only"><span>▶</span>START NOW</button>
            <button type="button" className="is-destructive" aria-label="Cancel, design preview only"><span>×</span>CANCEL</button>
          </div>
        ) : phase === "completed" ? (
          <div className="act-hud-panel__button-row has-hardware">
            <button type="button" className="is-hardware" aria-label="Dismiss, design preview only">×</button>
            <button type="button" aria-label="Replay Take, design preview only"><span>↺</span>REPLAY TAKE</button>
            <button type="button" className="is-hardware" aria-label="Quit, design preview only">⏻</button>
          </div>
        ) : (
          <div className="act-hud-panel__button-row">
            <button type="button" className={isRecording ? "is-destructive" : ""} aria-label={`${model.primary}, design preview only`}>
              <span>{isRecording ? "■" : "●"}</span>{model.primary}
            </button>
          </div>
        )}
      </section>

      <footer className="act-hud-panel__footer"><span>{model.event}</span><i /><strong>{model.eventCount}</strong></footer>
    </aside>
  );
}

export function ActionControllerStudy() {
  const [phase, setPhase] = useState<PreviewPhase>("recording");
  const model = PHASES[phase];

  return (
    <main className="act-hud-study">
      <header className="act-hud-study__header">
        <div>
          <p>Action · native overlay study</p>
          <h1>Overlay HUD, in context.</h1>
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
        <div className="act-hud-desktop__caption"><span>Native HUD · 336 × 456</span><i /><span>Key overlay · viewport anchored</span></div>
      </section>
    </main>
  );
}
