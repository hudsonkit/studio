"use client";

import { useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowRight,
  Camera,
  Check,
  FileText,
  Keyboard,
  MapPin,
  Mic,
  Monitor,
  MousePointer2,
  Share2,
  Smartphone,
  Sparkles,
  Watch,
} from "lucide-react";
import type { StudioAppPage } from "@/studio/studioRegistry";
import { TalkieReceipt } from "./talkie/TalkieReceipt";
import "./talkieOneThought.css";

type ScenarioKey = "bug" | "walk" | "response";

type Scenario = {
  key: ScenarioKey;
  label: string;
  route: string;
  source: string;
  destination: string;
  observation: string;
  transcript: string;
  artifact: string;
  time: string;
};

const SCENARIOS: Scenario[] = [
  {
    key: "bug",
    label: "Visual bug",
    route: "pinned prompt",
    source: "Preview · Checkout",
    destination: "Codex",
    observation: "The empty state loses its boundary in light mode.",
    transcript:
      "The card and canvas are reading as one surface. Keep the layout, but make the boundary unmistakable.",
    artifact: "UI fix request · 2 captures · context attached",
    time: "10:54",
  },
  {
    key: "walk",
    label: "Walking thought",
    route: "follow-up plan",
    source: "Watch · Voice memo",
    destination: "Reminders",
    observation: "Follow up while the meeting is still fresh.",
    transcript:
      "Send Mara the revised launch sequence, ask about Friday, and keep the original recording with the plan.",
    artifact: "Follow-up plan · 3 actions · source retained",
    time: "14:18",
  },
  {
    key: "response",
    label: "Dense text",
    route: "considered response",
    source: "Safari · Selected text",
    destination: "Mail",
    observation: "Turn a dense passage into a response without losing the source.",
    transcript:
      "Acknowledge the constraint, ask one clarifying question, and propose the smallest reversible next step.",
    artifact: "Response draft · reviewed · ready to paste",
    time: "16:32",
  },
];

const STAGES = [
  {
    number: "01",
    short: "Stay",
    title: "Stay in the work.",
    copy: "Pin where the evidence should land. Talkie remembers the destination while your attention stays on the problem.",
    proof: "Target pin + jump",
  },
  {
    number: "02",
    short: "Catch",
    title: "Capture what words miss.",
    copy: "Speak it, screenshot it, select it, or record it. The cheapest input wins; the thought does not have to wait.",
    proof: "Voice + screen capture",
  },
  {
    number: "03",
    short: "Context",
    title: "Let the context travel.",
    copy: "The app, window, source, time, transcript, and attachments remain part of the same object.",
    proof: "Context + attachments",
  },
  {
    number: "04",
    short: "Shape",
    title: "Choose how far it goes.",
    copy: "Keep the raw capture, review a polish, run a repeatable workflow, or involve an agent only when the work needs one.",
    proof: "Reviewable transformation",
  },
  {
    number: "05",
    short: "Land",
    title: "Send once.",
    copy: "Queued evidence lands together in the destination you chose—without making you babysit the handoff.",
    proof: "Destination-aware delivery",
  },
  {
    number: "06",
    short: "Remain",
    title: "Keep the trail.",
    copy: "Source, transcript, context, transformation, destination, and activity remain searchable and replayable.",
    proof: "Unified library receipt",
  },
] as const;

const INTELLIGENCE = [
  ["Raw", "Capture only"],
  ["Reviewed", "Polish with approval"],
  ["Workflow", "Repeatable path"],
  ["Agent", "Open-ended work"],
] as const;

export function TalkieOneThoughtStudy({ page }: { page: StudioAppPage }) {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("bug");
  const [stageIndex, setStageIndex] = useState(0);
  const scenario =
    SCENARIOS.find((candidate) => candidate.key === scenarioKey) ?? SCENARIOS[0];
  const stage = STAGES[stageIndex];

  function advance() {
    setStageIndex((current) => (current + 1) % STAGES.length);
  }

  return (
    <main className="talkie-thought">
      <header className="tt-hero">
        <div className="tt-hero-rule" aria-hidden="true" />
        <div className="tt-hero-copy">
          <p className="tt-kicker">The distance between noticing and acting</p>
          <h1>One thought, all the way through.</h1>
          <p className="tt-deck">
            Talkie catches what you say and see, keeps the context, helps shape
            it, and sends it where it belongs—without asking you to leave the
            moment.
          </p>
          <div className="tt-hero-actions">
            <button type="button" className="tt-primary" onClick={advance}>
              Follow a thought <ArrowDown size={14} />
            </button>
            <a className="tt-secondary" href="/studio/studies/talkie-feature-atlas">
              Explore the whole system <ArrowRight size={13} />
            </a>
          </div>
        </div>

        <div className="tt-hero-object" aria-label="A Talkie capture moving toward a destination">
          <div className="tt-app-frame">
            <div className="tt-app-topline">
              <span className="tt-window-dots"><i /><i /><i /></span>
              <span>{scenario.source}</span>
              <span className="tt-live-dot">LIVE</span>
            </div>
            <div className="tt-app-canvas">
              <div className="tt-code-lines" aria-hidden="true">
                <i /><i /><i /><i /><i /><i />
              </div>
              <div className="tt-observation">
                <span>noticed</span>
                <strong>{scenario.observation}</strong>
              </div>
              <div className="tt-lock-token">
                <span className="tt-t">T</span>
                <ArrowRight size={13} />
                <strong>{scenario.destination}</strong>
                <span className="tt-bracket">]</span>
              </div>
            </div>
          </div>
          <div className="tt-signal-drop" aria-hidden="true"><i /></div>
          <div className="tt-thought-chip">
            <span className="tt-spark">✦</span>
            <span>context held</span>
            <strong>01</strong>
          </div>
        </div>
      </header>

      <section className="tt-story" aria-labelledby="tt-story-title">
        <div className="tt-section-intro">
          <div>
            <p className="tt-kicker">A single causal story</p>
            <h2 id="tt-story-title">The handoff is the product.</h2>
          </div>
          <p>
            Most capture tools stop when they produce text. Talkie keeps the
            source, destination, and resulting trail connected.
          </p>
        </div>

        <div className="tt-scenario-switcher" aria-label="Choose a Talkie journey">
          {SCENARIOS.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              className={candidate.key === scenarioKey ? "is-active" : ""}
              onClick={() => {
                setScenarioKey(candidate.key);
                setStageIndex(0);
              }}
            >
              <span>{candidate.label}</span>
              <small>→ {candidate.route}</small>
            </button>
          ))}
        </div>

        <nav className="tt-stage-nav" aria-label="Journey stages">
          {STAGES.map((candidate, index) => (
            <button
              key={candidate.number}
              type="button"
              className={index === stageIndex ? "is-active" : ""}
              onClick={() => setStageIndex(index)}
              aria-current={index === stageIndex ? "step" : undefined}
            >
              <span>{candidate.number}</span>
              <strong>{candidate.short}</strong>
              <i aria-hidden="true" />
            </button>
          ))}
        </nav>

        <div className="tt-stage-layout">
          <article className="tt-stage-copy" key={`${scenarioKey}-${stageIndex}`}>
            <span className="tt-stage-number">{stage.number} / 06</span>
            <h3>{stage.title}</h3>
            <p>{stage.copy}</p>
            <div className="tt-proof">
              <Check size={12} />
              <span>Shipped proof</span>
              <strong>{stage.proof}</strong>
            </div>
            <button type="button" className="tt-next" onClick={advance}>
              {stageIndex === STAGES.length - 1 ? "Replay journey" : "Next handoff"}
              <ArrowRight size={14} />
            </button>
          </article>

          <JourneyInstrument scenario={scenario} stageIndex={stageIndex} />
        </div>
      </section>

      <section className="tt-intelligence">
        <div className="tt-section-intro tt-section-intro-dark">
          <div>
            <p className="tt-kicker">Control at every handoff</p>
            <h2>You choose the amount of intelligence.</h2>
          </div>
          <p>
            Automation is a spectrum. Talkie can simply hold the thought—or
            carry it further when the work benefits from it.
          </p>
        </div>
        <div className="tt-intelligence-scale">
          <div className="tt-scale-signal" aria-hidden="true"><i /></div>
          {INTELLIGENCE.map(([label, detail], index) => (
            <div className="tt-scale-stop" key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i aria-hidden="true" />
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
        <p className="tt-intelligence-note">
          Capture without transformation. Review before anything lands. Automate
          the repeatable. Use an agent for the genuinely open-ended.
        </p>
      </section>

      <section className="tt-system">
        <div className="tt-doorways">
          <div className="tt-section-intro">
            <div>
              <p className="tt-kicker">One system, many doorways</p>
              <h2>Use whatever is closest.</h2>
            </div>
            <p>
              The devices are not separate stories. They are entrances to—and
              exits from—the same body of work.
            </p>
          </div>
          <div className="tt-orbit">
            <div className="tt-orbit-core">
              <span className="tt-t">T</span>
              <strong>one thought</strong>
              <small>same trail</small>
            </div>
            <Doorway icon={<Monitor size={17} />} label="Mac" position="one" />
            <Doorway icon={<Smartphone size={17} />} label="iPhone" position="two" />
            <Doorway icon={<Watch size={17} />} label="Watch" position="three" />
            <Doorway icon={<Keyboard size={17} />} label="Keyboard" position="four" />
            <Doorway icon={<Share2 size={17} />} label="Share" position="five" />
          </div>
        </div>

        <div className="tt-receipt">
          <p className="tt-kicker">Receipts, not disappearance</p>
          <h2>Nothing important vanishes into automation.</h2>
          <TalkieReceipt
            className="tt-receipt-sheet"
            title={scenario.artifact}
            meta={`${scenario.time} · today`}
            status="Delivered"
            lines={[
              { id: "source", icon: <Camera size={13} />, label: "Source", value: scenario.source },
              { id: "transcript", icon: <Mic size={13} />, label: "Transcript", value: "Original retained" },
              { id: "context", icon: <MapPin size={13} />, label: "Context", value: "App + window attached" },
              { id: "transform", icon: <Sparkles size={13} />, label: "Transform", value: "Reviewed polish" },
              { id: "destination", icon: <ArrowRight size={13} />, label: "Destination", value: scenario.destination },
              { id: "recall", icon: <Archive size={13} />, label: "Recall", value: "Searchable in Library" },
            ]}
          />
        </div>
      </section>

      <footer className="tt-close">
        <span className="tt-close-signal" aria-hidden="true">✦</span>
        <p className="tt-kicker">That was one path through Talkie</p>
        <h2>Catch it before it changes.<br />Keep it until it matters.</h2>
        <div className="tt-close-actions">
          <a href="/studio/studies/talkie-feature-atlas">
            Open the feature atlas <ArrowRight size={14} />
          </a>
          <span>{page.status} study · narrative direction</span>
        </div>
      </footer>
    </main>
  );
}

function JourneyInstrument({
  scenario,
  stageIndex,
}: {
  scenario: Scenario;
  stageIndex: number;
}) {
  return (
    <div className="tt-instrument" data-stage={stageIndex}>
      <div className="tt-instrument-bar">
        <span><i /> TALKIE / LIVE PATH</span>
        <span>{scenario.label.toUpperCase()}</span>
      </div>
      <div className="tt-workspace">
        <div className="tt-workspace-nav">
          <span className="is-current"><MousePointer2 size={12} /> Work</span>
          <span><FileText size={12} /> Source</span>
          <span><Archive size={12} /> Trail</span>
        </div>
        <div className="tt-workspace-main">
          <div className="tt-source-window">
            <div className="tt-source-title">
              <span>{scenario.source}</span>
              <small>{scenario.time}</small>
            </div>
            <div className="tt-source-body">
              <div className="tt-faux-sidebar"><i /><i /><i /><i /></div>
              <div className="tt-faux-content">
                <div className="tt-faux-heading" />
                <div className="tt-faux-row"><i /><i /><i /></div>
                <div className="tt-faux-panel">
                  <span>{scenario.observation}</span>
                  {stageIndex >= 1 ? <b className="tt-markup-ring" /> : null}
                </div>
                <div className="tt-faux-row short"><i /><i /></div>
              </div>
            </div>
          </div>

          <div className="tt-flow-column">
            <div className="tt-target-pill">
              <span className="tt-t">T</span>
              <ArrowRight size={12} />
              <strong>{scenario.destination}</strong>
              <span className="tt-target-count">{stageIndex >= 1 ? "2" : ""}</span>
            </div>

            {stageIndex === 0 ? (
              <div className="tt-flow-card tt-lock-card">
                <MapPin size={16} />
                <strong>Destination remembered</strong>
                <span>Keep working here.</span>
              </div>
            ) : null}

            {stageIndex === 1 ? (
              <div className="tt-capture-stack">
                <div><Camera size={15} /><span>screen · 01</span></div>
                <div><Mic size={15} /><span>voice · 18s</span></div>
              </div>
            ) : null}

            {stageIndex === 2 ? (
              <div className="tt-context-card">
                <span>CONTEXT BUNDLE</span>
                <strong>{scenario.source}</strong>
                <small>window title</small>
                <strong>{scenario.time} · current session</strong>
                <small>time + activity</small>
              </div>
            ) : null}

            {stageIndex === 3 ? (
              <div className="tt-transform-card">
                <span>ORIGINAL</span>
                <p>{scenario.transcript}</p>
                <div><i /> reviewed polish <Check size={11} /></div>
              </div>
            ) : null}

            {stageIndex === 4 ? (
              <div className="tt-delivery-card">
                <div className="tt-attachment-row"><i /><i /></div>
                <p>{scenario.transcript}</p>
                <span><Check size={12} /> Delivered together</span>
              </div>
            ) : null}

            {stageIndex === 5 ? (
              <div className="tt-library-card">
                <Archive size={16} />
                <span>LIBRARY / TODAY</span>
                <strong>{scenario.artifact}</strong>
                <small>source · transcript · 2 attachments · delivery</small>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="tt-instrument-foot">
        <span>STAGE {STAGES[stageIndex].number}</span>
        <span>{STAGES[stageIndex].proof}</span>
      </div>
    </div>
  );
}

function Doorway({
  icon,
  label,
  position,
}: {
  icon: React.ReactNode;
  label: string;
  position: string;
}) {
  return (
    <div className={`tt-doorway tt-doorway-${position}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
