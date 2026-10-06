"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Code2, FileCode2, MessageSquare, Mic, Play } from "lucide-react";
import "./talkieBehavior.css";

const stages = [
  { title: "Start with a message", short: "Prompt", note: "The request leads. The code pane stays quiet until there is something to inspect.", question: "Should a new behavior start here, or inside an existing behavior’s source?" },
  { title: "Watch the draft take shape", short: "Generate", note: "A proposed generation state keeps the original request visible beside the emerging file.", question: "How much generation detail helps: a short plan, streaming code, or both?" },
  { title: "Read the code. Pick a recording.", short: "Code ready", note: "One file is the artifact. A recording gives the first test a concrete target.", question: "Should the first test always preview intended actions before allowing side effects?" },
  { title: "Inspect what the test would do", short: "Test result", note: "The example result connects the source recording, matched phrase, and proposed action.", question: "What evidence would make this result trustworthy enough to use?" },
  { title: "Give the next instruction", short: "Follow-up", note: "The conversation continues against the same file and the same recording.", question: "Should a follow-up revise immediately, or propose a change for review?" },
  { title: "Review the revision", short: "Revision", note: "A small source change is paired with a new example result. The cycle can repeat.", question: "Where should accepting a revision end and enabling a behavior begin?" },
];
const prompt = "When I say ‘hey Talkie’ near the end of a recording, find the command and show which workflow it would run. Stop if the phrase isn’t there.";
const followup = "Only match ‘hey Talkie’ when it starts the final sentence. Don’t trigger when I mention it in the middle of a thought.";
const source = [
  "// Design sketch · proposed API, not executable",
  'export default behavior("Hey Talkie", {',
  '  input: "recording.transcript",',
  "",
  "  async preview(recording, talkie) {",
  "    const command = matchPhrase(recording.transcript, {",
  '      phrase: "hey talkie",',
  '      location: "end",',
  "      contextWindow: 200,",
  "      caseSensitive: false,",
  "    });",
  "",
  '    if (!command) return { status: "skipped" };',
  "",
  "    const intents = await talkie.extractIntents(command);",
  "    return talkie.previewWorkflows(intents);",
  "  },",
  "});",
];

function CodeLines({ generating, revised }: { generating: boolean; revised: boolean }) {
  const lines = revised ? source.flatMap((line, index) => index === 7 ? ['      location: "finalSentence",', '      position: "start",'] : index === 8 ? [] : [line]) : source;
  return <div className="tb-code" aria-label={revised ? "Proposed revised source" : "Illustrative source"}>
    {(generating ? lines.slice(0, 8) : lines).map((line, i) => <div key={i} className={`tb-line ${revised && (i === 7 || i === 8) ? "tb-added" : ""}`}><span className="tb-number" aria-hidden="true">{i + 1}</span><code>{line.split(/("[^"]*"|\b(?:export|default|async|const|if|return|await|false)\b|\/\/.*)/g).map((part, j) => <span key={j} className={part.startsWith('//') ? 'tb-comment' : part.startsWith('"') ? 'tb-string' : /^(export|default|async|const|if|return|await|false)$/.test(part) ? 'tb-keyword' : undefined}>{part}</span>)}</code></div>)}
    {generating && <p className="tb-generating">Draft continues here… <span>Illustrated progress, paused</span></p>}
  </div>;
}

export function TalkieBehaviorStudy() {
  const [step, setStep] = useState(0);
  const state = stages[step];
  return <main className="tb-study">
    <header className="tb-heading"><div><h1>Programming a Talkie behavior</h1><p>A conversation becomes code, then evidence, then a better version.</p></div><span className="tb-study-label">Interactive wireframe · mock data</span></header>
    <nav className="tb-sequence" aria-label="Illustrative chronological states">{stages.map((stage, index) => <button key={stage.short} type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, '0')}</span>{stage.short}</button>)}</nav>
    <section className="tb-caption" aria-live="polite"><div><h2>{state.title}</h2><p>{state.note}</p></div><div className="tb-pagination"><button type="button" aria-label="Previous illustrative state" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /></button><span>{step + 1} / {stages.length}</span><button type="button" aria-label="Next illustrative state" disabled={step === stages.length - 1} onClick={() => setStep(step + 1)}><ArrowRight size={16} /></button></div></section>
    <div className="tb-workspace">
      <div className="tb-workspace-title"><span><Code2 size={15} /> Talkie <span className="tb-muted">/ Behaviors / Hey Talkie</span></span><span className="tb-muted">Study workspace</span></div>
      <div className="tb-panes">
        <section className="tb-conversation" aria-label="Illustrative conversation">
          <div className="tb-pane-title"><MessageSquare size={14} /> Conversation</div>
          <div className="tb-chat-body">
            {step === 0 ? <div className="tb-start"><h3>What should Talkie do?</h3><p>Describe a behavior in your own words. Start with a recording you understand.</p></div> : <><div className="tb-message"><span>You</span><p>{prompt}</p></div><div className="tb-response"><span>Proposed assistant response</span><p>{step === 1 ? "I’ll draft the phrase match and intent extraction, then show the actions against a sample recording." : "The draft follows the existing Hey Talkie sequence: match a phrase, extract intent, route to a workflow. This proposed preview stops before execution."}</p><div className="tb-file-receipt"><FileCode2 size={15} /><div>hey-talkie.ts<small>{step === 1 ? "Drafting source…" : "Draft 1 · ready to inspect"}</small></div></div></div></>}
            {step >= 4 && <div className="tb-message"><span>You · follow-up</span><p>{followup}</p></div>}
            {step === 5 && <div className="tb-response"><span>Proposed assistant response</span><p>The match now starts at the final sentence. The same recording still matches; the incidental mention is skipped.</p><div className="tb-file-receipt"><FileCode2 size={15} /><div>hey-talkie.ts<small>Draft 2 · two lines replaced</small></div></div></div>}
          </div>
          <div className="tb-composer"><label htmlFor="tb-prompt">{step === 0 ? "Example starting message" : step === 4 ? "Example follow-up message" : "Continue the conversation"}</label><textarea id="tb-prompt" readOnly value={step === 0 ? prompt : step === 4 ? followup : ""} placeholder="Your next instruction would go here…" /><div><span>Read-only illustration</span><button type="button" onClick={() => setStep(step === 0 ? 1 : step === 4 ? 5 : Math.min(step + 1, 5))} disabled={step === 5}>Next study state <ArrowRight size={13} /></button></div></div>
        </section>
        <section className="tb-editor" aria-label="Illustrative code and test"><div className="tb-pane-title"><FileCode2 size={14} /><span>hey-talkie.ts</span><span className="tb-editor-tag">{step === 0 ? "No draft yet" : step === 1 ? "Generating" : step === 5 ? "Draft 2" : "Draft 1"}</span></div>
          {step === 0 ? <div className="tb-empty"><FileCode2 size={28} strokeWidth={1} /><h3>Your behavior will appear here</h3><p>Message first. Inspect the resulting code here, then try it against a recording.</p></div> : <><CodeLines generating={step === 1} revised={step === 5} />{step >= 2 && <div className="tb-test"><div className="tb-test-title"><span><Mic size={14} /> Example recording</span><span className="tb-muted">Synthetic fixture · 18 seconds</span></div><p className="tb-recording-name">Friday launch notes</p><blockquote>“The launch plan looks good. Hey Talkie, summarize this recording.”</blockquote>{step === 2 ? <button type="button" className="tb-preview-button" onClick={() => setStep(3)}><Play size={13} /> Show example test result</button> : <div className="tb-result"><div><Check size={14} /><strong>Matched</strong><span>Summary workflow would be selected</span></div><p>Input → {step === 5 ? "start of final sentence" : "final 200 characters"} → “hey talkie” → summarize</p><small>Illustrative output. No recording loaded and no workflow run.</small></div>}{step === 5 && <div className="tb-revision-result"><span>Revision comparison</span><p><del>location: "end" · contextWindow: 200</del><br /><ins>location: "finalSentence" · position: "start"</ins></p><p>“I mentioned hey Talkie during the meeting.” <strong>Skipped</strong></p><small>Expected example result · not a measured test</small></div>}</div>}</>}
          <div className="tb-status"><span>TypeScript illustration</span><span>{step === 5 ? "2 replaced lines" : "Proposed API"} · no runtime connected</span></div>
        </section>
      </div>
    </div>
    <footer className="tb-notes"><div><h3>For discussion</h3><p>{state.question}</p></div><details><summary>Source grounding & study boundaries</summary><p>The existing Talkie system workflow matches “hey talkie” near the end of a transcript (200-character context, case-insensitive), extracts intent, and routes to workflows. Source: <code>apps/macos/Talkie/Resources/SystemWorkflows/hey-talkie.json</code>.</p><p>The source editor, file tab, and adjacent conversation borrow Iris’s web IDE format. All code APIs, generation, revisions, and results here are proposals. There is no Monaco instance, agent connection, execution, or change to the workflow engine. Enabling a behavior is deliberately an open design question.</p></details></footer>
  </main>;
}
