"use client";

import { useMemo, useState } from "react";
import {
  Mic,
  Brain,
  Wand2,
  Share2,
  Archive,
  Sprout,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { DataRow, EngDocSheet } from "studio/doc";
import type { StudioAppPage } from "@/studio/studioRegistry";
import { TalkieFeatureExplorer } from "./talkie/TalkieFeatureExplorer";
import "./talkieFeatureAtlas.css";

/**
 * TALKIE-ATLAS — Talkie feature atlas.
 *
 * A capability map for the Talkie product family, organised by the user's job
 * (Capture → Understand → Transform → Route → Recall) rather than by repo
 * module. Every entry is grounded in the repo-verified inventory
 * (talkie-feature-inventory-2026-07-25.md); maturity labels are honest
 * (Shipped / Experimental / Partial / Legacy) and match that document's S/E/P/L
 * legend. The public surface celebrates capability; a restrained "product
 * garden" layer at the bottom carries consolidation + cleanup evidence
 * (inventory §3 Partial, §4 Legacy, §6 Overlaps) without making the page
 * negative.
 *
 * Structure, top to bottom:
 *   1. Masthead + spectrum   — every feature as one bar; the whole inventory in
 *                              a single glance, coloured by maturity, grouped
 *                              by job. Doubles as the page's Talkie motif.
 *   2. Pipeline              — the five jobs as a left-to-right flow with a
 *                              per-job maturity split bar.
 *   3. Surface matrix        — surfaces × jobs, so you can see where the
 *                              product's mass actually sits.
 *   4. Index                 — a dense ledger (not a card grid): one row per
 *                              capability, with an 8-cell surface matrix.
 *   5. Reference strata      — flag defaults, workflow steps, templates, agent
 *                              hotkeys, and the process/product surface map.
 *   6. Product garden        — consolidation + cleanup evidence, collapsed.
 *   7. Provenance            — evidence, method, and the inventory's own
 *                              stated confidence gaps.
 *
 * Everything is scoped under `.talkie-atlas` so the rest of Studio is untouched;
 * colours derive from the Hudson --hud-* tokens and re-resolve per theme.
 */

type Maturity = "shipped" | "experimental" | "partial" | "legacy";

type SurfaceKey =
  | "mac"
  | "agent"
  | "ios"
  | "watch"
  | "keyboard"
  | "share"
  | "server"
  | "cli";

type JobKey = "capture" | "understand" | "transform" | "route" | "recall";

interface Feature {
  name: string;
  job: JobKey;
  blurb: string;
  surfaces: SurfaceKey[];
  maturity: Maturity;
}

const MATURITY: Record<
  Maturity,
  { label: string; code: string; blurb: string }
> = {
  shipped: {
    label: "Shipped",
    code: "S",
    blurb: "User-facing and on by default.",
  },
  experimental: {
    label: "Experimental",
    code: "E",
    blurb: "Flag- or launch-arg-gated; off by default.",
  },
  partial: {
    label: "Partial",
    code: "P",
    blurb: "Stubbed, incomplete, or env-dependent.",
  },
  legacy: {
    label: "Legacy",
    code: "L",
    blurb: "Superseded or aliased; still reachable.",
  },
};

const MATURITY_ORDER: Maturity[] = [
  "shipped",
  "experimental",
  "partial",
  "legacy",
];

const SURFACES: Record<SurfaceKey, { label: string; short: string }> = {
  mac: { label: "macOS", short: "MAC" },
  agent: { label: "Agent", short: "AGT" },
  ios: { label: "iOS", short: "IOS" },
  watch: { label: "Watch", short: "WCH" },
  keyboard: { label: "Keyboard", short: "KBD" },
  share: { label: "Share", short: "SHR" },
  server: { label: "Server", short: "SRV" },
  cli: { label: "CLI / SDK", short: "CLI" },
};

const SURFACE_ORDER: SurfaceKey[] = [
  "mac",
  "agent",
  "ios",
  "watch",
  "keyboard",
  "share",
  "server",
  "cli",
];

const JOBS: {
  key: JobKey;
  index: string;
  title: string;
  verb: string;
  icon: typeof Mic;
  spark: string[];
}[] = [
  {
    key: "capture",
    index: "01",
    title: "Capture",
    verb: "Get a thought, a voice, or the screen out of the world and into Talkie.",
    icon: Mic,
    spark: ["Dictation", "Voice memos", "Screenshots", "Share sheet"],
  },
  {
    key: "understand",
    index: "02",
    title: "Understand",
    verb: "Turn raw audio and pixels into text, structure, and meaning.",
    icon: Brain,
    spark: ["Whisper / Parakeet", "Live ASR", "Search", "Ask AI"],
  },
  {
    key: "transform",
    index: "03",
    title: "Transform",
    verb: "Reshape a capture with workflows, LLMs, and voice.",
    icon: Wand2,
    spark: ["Workflows", "Providers", "Polish", "TTS"],
  },
  {
    key: "route",
    index: "04",
    title: "Route",
    verb: "Send the result where it needs to go — apps, devices, the network.",
    icon: Share2,
    spark: ["Paste / shelf", "Bridge", "Server", "Sync"],
  },
  {
    key: "recall",
    index: "05",
    title: "Recall",
    verb: "Find, replay, and act on everything Talkie has kept.",
    icon: Archive,
    spark: ["Library", "Home", "Widgets", "Siri"],
  },
];

/**
 * Feature set — grounded in talkie-feature-inventory-2026-07-25.md. Maturity
 * mirrors the inventory's S/E/P/L legend; nothing here is invented.
 */
const FEATURES: Feature[] = [
  // ── Capture ──────────────────────────────────────────────
  {
    name: "Global dictation",
    job: "capture",
    blurb:
      "Hold or toggle a hotkey to dictate into any app; the transcript pastes, polishes, or files itself.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Voice memos",
    job: "capture",
    blurb: "Record memos in the main app, on iPhone, or from an Apple Watch preset.",
    surfaces: ["mac", "ios", "watch"],
    maturity: "shipped",
  },
  {
    name: "Screenshot + markup",
    job: "capture",
    blurb:
      "Fullscreen, region, window, or shelf capture with an annotation overlay and OCR.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Screen recording",
    job: "capture",
    blurb: "Hyper-chord screen recording with a target HUD; clips land in the library.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Desktop ink + magnifier",
    job: "capture",
    blurb: "Draw over the desktop or freeze a region into a magnifier.",
    surfaces: ["agent"],
    maturity: "shipped",
  },
  {
    name: "Selection reader",
    job: "capture",
    blurb: "Grab selected text anywhere, optionally run it through an LLM, then speak it back.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Capture target pin / jump",
    job: "capture",
    blurb: "Pin the prompt target during a capture, then jump straight back to it.",
    surfaces: ["agent"],
    maturity: "shipped",
  },
  {
    name: "Audio-drop import",
    job: "capture",
    blurb: "Drag audio files into Talkie to transcribe and file them.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "URL bookmark import",
    job: "capture",
    blurb: "Pull bookmarks into the library as first-class content from Home.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Scrolling capture",
    job: "capture",
    blurb: "Stitch a long, scrolling page into a single capture.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Share to Talkie",
    job: "capture",
    blurb: "Send URLs, text, or images from any app via the system share sheet.",
    surfaces: ["share", "ios"],
    maturity: "shipped",
  },
  {
    name: "System keyboard dictation",
    job: "capture",
    blurb: "Dictate into any text field with the Talkie custom keyboard.",
    surfaces: ["keyboard", "ios"],
    maturity: "shipped",
  },
  {
    name: "Watch record presets",
    job: "capture",
    blurb: "Start quick or thought-style recordings straight from the wrist.",
    surfaces: ["watch"],
    maturity: "shipped",
  },
  {
    name: "Context capture",
    job: "capture",
    blurb: "Attach the active app, window, and live screenshots to a dictation.",
    surfaces: ["agent"],
    maturity: "shipped",
  },
  {
    name: "Camera bubble",
    job: "capture",
    blurb: "Floating camera preview and clip recording — flag-gated, off by default.",
    surfaces: ["agent", "mac"],
    maturity: "experimental",
  },
  {
    name: "Rich capture UI",
    job: "capture",
    blurb: "Enhanced capture overlay visuals behind enableCaptureRichUI.",
    surfaces: ["agent"],
    maturity: "experimental",
  },
  {
    name: "Web capture browser",
    job: "capture",
    blurb: "An in-app browser for capturing web content on iPhone; maturity varies.",
    surfaces: ["ios"],
    maturity: "partial",
  },
  {
    name: "Notch composer (Talkie-owned)",
    job: "capture",
    blurb: "The older in-app notch renderer; the Agent owns the notch by default now.",
    surfaces: ["mac"],
    maturity: "legacy",
  },

  // ── Understand ───────────────────────────────────────────
  {
    name: "Local Whisper STT",
    job: "understand",
    blurb: "Offline transcription with WhisperKit, from tiny to large-distil models.",
    surfaces: ["mac", "agent"],
    maturity: "shipped",
  },
  {
    name: "Parakeet STT",
    job: "understand",
    blurb: "Fast English / multilingual speech-to-text via FluidAudio Parakeet.",
    surfaces: ["mac", "agent"],
    maturity: "shipped",
  },
  {
    name: "Apple Speech",
    job: "understand",
    blurb: "The system speech recogniser as a zero-setup transcription option.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Live sidecar ASR",
    job: "understand",
    blurb: "Chunked, streaming transcription that keeps up while you speak.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Priority transcription",
    job: "understand",
    blurb: "A high-priority engine path so agent dictation jumps the queue.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Retranscribe",
    job: "understand",
    blurb: "Re-run speech-to-text on any recording with a different model.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Mic selection + diagnostics",
    job: "understand",
    blurb: "Choose an input device and troubleshoot it when audio misbehaves.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Full-text search",
    job: "understand",
    blurb: "Search memos, dictations, and captures in-app or from the CLI.",
    surfaces: ["mac", "cli"],
    maturity: "shipped",
  },
  {
    name: "Dictionary + context rules",
    job: "understand",
    blurb:
      "Domain vocabularies (finance, legal, medical, technical) and app-aware rules.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "On-device text formatting",
    job: "understand",
    blurb: "User-triggered AI cleanup of a memo transcript on iPhone.",
    surfaces: ["ios"],
    maturity: "shipped",
  },
  {
    name: "Ask AI",
    job: "understand",
    blurb: "Conversational AI sessions grounded in your own content.",
    surfaces: ["ios"],
    maturity: "shipped",
  },
  {
    name: "Learn knowledge base",
    job: "understand",
    blurb: "In-app articles on the tray, hyper keys, workflows, providers, and privacy.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "AI memo titles",
    job: "understand",
    blurb: "Auto-title memos on-device — launch-arg gated.",
    surfaces: ["ios"],
    maturity: "experimental",
  },
  {
    name: "AI summaries",
    job: "understand",
    blurb: "On-device memo summaries — launch-arg gated.",
    surfaces: ["ios"],
    maturity: "experimental",
  },
  {
    name: "AI task extraction",
    job: "understand",
    blurb: "Pull action items out of a memo — launch-arg gated.",
    surfaces: ["ios"],
    maturity: "experimental",
  },
  {
    name: "Voice foregrounding",
    job: "understand",
    blurb: "A DSP experiment that emphasises speech over background — off by default.",
    surfaces: ["agent"],
    maturity: "experimental",
  },
  {
    name: "Agent model management",
    job: "understand",
    blurb: "Model download UI is solid in the main app; the Agent side is still XPC-TODO.",
    surfaces: ["agent"],
    maturity: "partial",
  },

  // ── Transform ────────────────────────────────────────────
  {
    name: "Workflows",
    job: "transform",
    blurb: "Author and run multi-step workflows across 19 executor-backed step types.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Workflow templates",
    job: "transform",
    blurb: "Starters like quick-summary, action-items, brain-dump, and cloud-transcribe.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "System workflows",
    job: "transform",
    blurb: "Built-ins that ship with the app — hey-talkie and transcribe.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Automations",
    job: "transform",
    blurb: "Bind workflows to events (memo synced / created) or to a schedule.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Interstitial polish",
    job: "transform",
    blurb: "Edit and diff a dictation with an LLM before it lands in the target app.",
    surfaces: ["agent"],
    maturity: "shipped",
  },
  {
    name: "LLM providers",
    job: "transform",
    blurb:
      "OpenAI, Anthropic, Gemini, and Groq, plus an Apple on-device path and a server route.",
    surfaces: ["mac", "server"],
    maturity: "shipped",
  },
  {
    name: "Apple Foundation Models",
    job: "transform",
    blurb: "On-device LLM provider on supported macOS versions.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Text-to-speech",
    job: "transform",
    blurb: "Apple, OpenAI, and ElevenLabs voices for outputs and read-aloud selections.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Compose + markdown studio",
    job: "transform",
    blurb: "Dictate-and-edit drafts in an embedded markdown editor.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Skills / starters",
    job: "transform",
    blurb: "Load skill starters — monitor, prepare, research, screenshot.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Action workbench",
    job: "transform",
    blurb: "Inspect action runs, events, subjects, and inputs in one place.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Intent fan-out",
    job: "transform",
    blurb: "Extract intents from a capture and spawn child workflows.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Console / managed agents",
    job: "transform",
    blurb: "Power-user terminals for running and watching managed agent sessions.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "MiniMax (gateway)",
    job: "transform",
    blurb: "Reachable through the server gateway; less first-class inside the app.",
    surfaces: ["server"],
    maturity: "partial",
  },
  {
    name: "WFKit visual canvas",
    job: "transform",
    blurb: "A separate canvas workflow editor — dual-path with the in-app builder.",
    surfaces: ["mac"],
    maturity: "partial",
  },
  {
    name: "Portable server workflows",
    job: "transform",
    blurb: "A TypeScript subset of the step catalogue running inside TalkieServer.",
    surfaces: ["server"],
    maturity: "partial",
  },
  {
    name: "Keyboard smart transforms",
    job: "transform",
    blurb: "Summarise, bullet, and topic transforms inside the keyboard — gated.",
    surfaces: ["keyboard", "ios"],
    maturity: "experimental",
  },

  // ── Route ────────────────────────────────────────────────
  {
    name: "Quick paste + shelf",
    job: "route",
    blurb: "Chord to paste recent captures in several formats, or drag files back out.",
    surfaces: ["agent", "mac"],
    maturity: "shipped",
  },
  {
    name: "Queue paste",
    job: "route",
    blurb: "Pick from queued or previously failed transcripts.",
    surfaces: ["agent"],
    maturity: "shipped",
  },
  {
    name: "Workflow output steps",
    job: "route",
    blurb:
      "Webhook, email, Apple Notes / Reminders / Calendar, clipboard, save-file, iOS push, cloud upload.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "iOS ↔ Mac bridge",
    job: "route",
    blurb: "Pair, browse sessions, request screenshots, transfer memos, and run the CLI remotely.",
    surfaces: ["ios", "server", "agent"],
    maturity: "shipped",
  },
  {
    name: "TalkieServer",
    job: "route",
    blurb: "Local bridge, inference gateway, portable workflows, and an extension host.",
    surfaces: ["server"],
    maturity: "shipped",
  },
  {
    name: "Claude CLI session bridge",
    job: "route",
    blurb: "Discover local Claude sessions and inject prompts into them.",
    surfaces: ["server", "cli"],
    maturity: "shipped",
  },
  {
    name: "CLI (@talkie/cli)",
    job: "route",
    blurb: "List and search data, install, pair, show a companion QR, and run doctor checks.",
    surfaces: ["cli"],
    maturity: "shipped",
  },
  {
    name: "TypeScript SDK",
    job: "route",
    blurb: "Programmatic bridge discovery, auth, and dictation event streaming.",
    surfaces: ["cli"],
    maturity: "shipped",
  },
  {
    name: "Sync (CloudKit)",
    job: "route",
    blurb: "CloudKit plus an out-of-process XPC sync helper (TalkieSync).",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "URL scheme + App Intents",
    job: "route",
    blurb: "talkie:// routes and Siri / Shortcuts actions: record, search, play.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Terminal / SSH companion",
    job: "route",
    blurb: "Open a remote terminal into the paired Mac from iOS.",
    surfaces: ["ios", "server"],
    maturity: "shipped",
  },
  {
    name: "Tailscale / Bonjour pairing",
    job: "route",
    blurb: "LAN discovery and remote companion pairing.",
    surfaces: ["server"],
    maturity: "shipped",
  },
  {
    name: "JS apps / extension API",
    job: "route",
    blurb: "Sample calendar and milestone apps behind an extension surface — flag-gated.",
    surfaces: ["mac", "server"],
    maturity: "experimental",
  },
  {
    name: "Cloud sync surfaces",
    job: "route",
    blurb: "Extra CloudKit UI behind enableCloudSync, off by default.",
    surfaces: ["mac"],
    maturity: "experimental",
  },
  {
    name: "Connection Center",
    job: "route",
    blurb: "A connectivity panel in settings — flag-gated on macOS, launch-arg gated on iOS.",
    surfaces: ["mac", "ios"],
    maturity: "experimental",
  },
  {
    name: "talkie.to cloud queue",
    job: "route",
    blurb: "A web-side workflow queue that depends on a deployed environment.",
    surfaces: ["server"],
    maturity: "partial",
  },
  {
    name: "Return-to-origin after paste",
    job: "route",
    blurb: "Refocusing the source app after a paste is hard-disabled in the Agent.",
    surfaces: ["agent"],
    maturity: "partial",
  },
  {
    name: "live/* URL aliases",
    job: "route",
    blurb: "Compatibility routes that quietly forward to the Agent's agent/* paths.",
    surfaces: ["mac"],
    maturity: "legacy",
  },

  // ── Recall ───────────────────────────────────────────────
  {
    name: "Unified library",
    job: "recall",
    blurb: "One home for memos, dictations, notes, and captures.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Object detail",
    job: "recall",
    blurb: "Playback, transcript, attachments, workflow runs, and refinement per item.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Notes + captures",
    job: "recall",
    blurb: "Standalone notes and a screenshot-native capture browser.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Home dashboard",
    job: "recall",
    blurb: "Recent activity, calendar / devices / shortcuts / heatmap widgets, and search.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "AI results history",
    job: "recall",
    blurb: "Revisit past AI outputs.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Activity log",
    job: "recall",
    blurb: "A running record of system activity.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Pending actions",
    job: "recall",
    blurb: "Approve or complete queued actions.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Usage stats",
    job: "recall",
    blurb: "Usage and activity statistics screens.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Read aloud",
    job: "recall",
    blurb: "Play any stored content back as speech on iPhone.",
    surfaces: ["ios"],
    maturity: "shipped",
  },
  {
    name: "Recently deleted",
    job: "recall",
    blurb: "Restore or purge removed items.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Command palette",
    job: "recall",
    blurb: "Palette actions, quick open, and a voice-command overlay.",
    surfaces: ["mac"],
    maturity: "shipped",
  },
  {
    name: "Widgets + Live Activities",
    job: "recall",
    blurb: "Home / control / live-activity widgets and Watch complications.",
    surfaces: ["ios", "watch"],
    maturity: "shipped",
  },
  {
    name: "Siri / App Intents",
    job: "recall",
    blurb: "Record, count memos, play the last item, and search by voice.",
    surfaces: ["ios"],
    maturity: "shipped",
  },
  {
    name: "Feedback + reporting",
    job: "recall",
    blurb: "File a bug or send a report from inside the product.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Onboarding + permissions",
    job: "recall",
    blurb: "A first-run storyboard and an ongoing permissions center.",
    surfaces: ["mac", "ios"],
    maturity: "shipped",
  },
  {
    name: "Watch AI assistant",
    job: "recall",
    blurb: "Conversational replies on the wrist — launch-arg gated.",
    surfaces: ["watch", "ios"],
    maturity: "experimental",
  },
  {
    name: "Deck mirror",
    job: "recall",
    blurb: "A command-deck mirror on iPhone; the snapshot model is still a fire-stub.",
    surfaces: ["ios"],
    maturity: "partial",
  },
  {
    name: "Sync conflicts / workspaces",
    job: "recall",
    blurb: "Surfaces exist in the iOS router but are early.",
    surfaces: ["ios"],
    maturity: "partial",
  },
  {
    name: "Legacy memos / dictations screens",
    job: "recall",
    blurb: "Pre-unification screens still reachable behind debug.showLegacyScreens.",
    surfaces: ["mac"],
    maturity: "legacy",
  },
  {
    name: "TalkieLive history panel",
    job: "recall",
    blurb: "All that remains of the TalkieLive target after the Agent absorbed live.",
    surfaces: ["mac"],
    maturity: "legacy",
  },
];

/** §7 — RuntimeFeatureFlags.swift defaults, verbatim. */
const FLAGS: { name: string; on: boolean }[] = [
  { name: "enableCapture", on: true },
  { name: "enableScreenshots", on: true },
  { name: "enableAutoUpdates", on: true },
  { name: "enableCameraBubble", on: false },
  { name: "enableCaptureRichUI", on: false },
  { name: "enableNotchComposer", on: false },
  { name: "enableVoiceForegrounding", on: false },
  { name: "showConnectionCenter", on: false },
  { name: "showExtensionAPI", on: false },
  { name: "paywallEnabled", on: false },
  { name: "showProFeatures", on: false },
  { name: "enableCloudSync", on: false },
  { name: "showDebugInfo", on: false },
];

/** §8 — executor-backed workflow steps. */
const STEPS: string[] = [
  "llm",
  "transform",
  "conditional",
  "shell",
  "saveFile",
  "clipboard",
  "transcribe",
  "speak",
  "notification",
  "iOSPush",
  "trigger",
  "intentExtract",
  "executeWorkflows",
  "appleNotes",
  "appleReminders",
  "appleCalendar",
  "webhook",
  "email",
  "cloudUpload",
];

/** §8 — templates shipped on disk. */
const TEMPLATES: string[] = [
  "brain-dump-processor",
  "cloud-transcribe",
  "describe-ui-minimax",
  "extract-action-items",
  "feature-ideation",
  "hq-transcribe",
  "key-insights",
  "last-word",
  "learning-capture",
  "quick-summary",
  "speak-summary",
  "tweet-summary",
];

/** §9 — Agent hotkey capability inventory. */
const HOTKEYS: string[] = [
  "Toggle record",
  "Push-to-talk",
  "Queue paste picker",
  "Compose with selection",
  "Speak selection",
  "Screenshot during recording",
  "Markup screenshot",
  "Direct SS — fullscreen / region / buffer / window / shelf",
  "Screen record chord",
  "Desktop ink toggle + arrange",
  "Desktop magnifier",
  "Markup emergency dismiss",
  "Capture target pin / jump",
  "Quick paste chord",
  "Agent voice panel",
  "DEBUG paste test",
];

/** Process / product surface map — the binaries behind the capability list. */
const PROCESSES: { name: string; path: string; role: string }[] = [
  { name: "Talkie", path: "apps/macos/Talkie", role: "Library, workflows, settings, compose, home, console" },
  { name: "TalkieAgent", path: "apps/macos/TalkieAgent", role: "Always-on capture, overlays, hotkeys, bridge HTTP, live dictation" },
  { name: "TalkieServer", path: "apps/macos/TalkieServer", role: "Bun / Elysia bridge, gateway, portable workflows, pairing" },
  { name: "TalkieSync", path: "apps/macos/TalkieSync", role: "Out-of-process Core Data + CloudKit sync helper (XPC)" },
  { name: "TalkieKit", path: "apps/macos/TalkieKit", role: "Shared capture, interstitial, LLM, context, UI primitives" },
  { name: "TalkieEngineCore", path: "apps/macos/TalkieEngineCore", role: "WhisperKit + Parakeet inference core package" },
  { name: "TalkieHeadless", path: "apps/macos/TalkieHeadless", role: "Headless engine / live client + local server (ops tooling)" },
  { name: "TalkieLive", path: "apps/macos/TalkieLive", role: "Orphan — residual history panel views only" },
  { name: "Talkie iOS", path: "apps/ios/Talkie iOS", role: "Mobile capture, library, compose, bridge, AI" },
  { name: "TalkieKeys", path: "apps/ios/TalkieKeys", role: "Custom keyboard + dictation" },
  { name: "TalkieShare", path: "apps/ios/TalkieShare", role: "Share → App Group handoff" },
  { name: "Watch / Widgets", path: "apps/ios/TalkieWatch*", role: "Record presets, complications, live activities" },
  { name: "CLI / SDK", path: "packages/npm/{cli,sdk}", role: "Terminal data access + bridge client" },
  { name: "Web services", path: "services/talkie-*", role: "Flags admin, reports, public workflow queue" },
];

/**
 * Product-garden layer — consolidation + cleanup evidence from the inventory.
 * Framed constructively; sourced from §6 Overlaps, §4 Legacy, §3 Partial.
 */
const GARDEN: {
  key: string;
  title: string;
  note: string;
  items: { name: string; note: string }[];
}[] = [
  {
    key: "overlaps",
    title: "Consolidation opportunities",
    note: "inventory §6 — overlapping feature families",
    items: [
      { name: "Dictation stacks", note: "Agent live dictation, main-app memos, iOS recording, and keyboard headless dictation are one job with four entry points and different stores." },
      { name: "Capture stacks", note: "Capture / Camera / Paste / Tray / ScreenRecording run near-parallel in Talkie and TalkieAgent." },
      { name: "Notch / overlay", note: "Agent NotchOverlay is primary; Talkie's NotchComposer is flag-gated legacy." },
      { name: "Workflow editors", note: "In-app builder, WFKit canvas, and the server portable planner are three authoring layers." },
      { name: "LLM client stacks", note: "Provider logic duplicated across Talkie, TalkieKit, the server gateway, and iOS inference." },
      { name: "Sync paths", note: "In-process CloudKit, TalkieSync XPC, local provider, and bridge memo transfer." },
      { name: "History UIs", note: "Agent history panel, macOS dictations library, iOS history, and CLI all read the same family." },
      { name: "URL alias forest", note: "live/*, agent/*, a/* plus a long tail of settings path aliases." },
      { name: "Settings duplication", note: "The Agent keeps its own settings window while the main app configures it through shared defaults." },
      { name: "Compose surfaces", note: "macOS drafts / markdown studio vs iOS ComposeNext are parallel compose products." },
    ],
  },
  {
    key: "partial",
    title: "Partial / stubbed",
    note: "inventory §3 — reachable but incomplete",
    items: [
      { name: "Agent /v1/talkie/*", note: "Data routes return 503 “not yet implemented”." },
      { name: "Engine HTTP routes", note: "Phase 3 TODO / serviceUnavailable in BridgeServer." },
      { name: "Agent model mgmt bindings", note: "Stubs plus “replace with XPC” TODOs." },
      { name: "iOS Deck mirror", note: "Surface exists; the snapshot model is a fire-stub." },
      { name: "Return-to-origin", note: "Hard-disabled constant after paste." },
      { name: "Paywall", note: "Flag and UI hooks only — no commerce stack in-repo." },
      { name: "TalkieSync multi-backend", note: "S3 / Dropbox listed as “future” in the README." },
      { name: "Email workflow step", note: "Implemented as prepare / compose; send path unverified." },
      { name: "TalkieGateway", note: "Minimal stub tree." },
      { name: "services/talkie.to", note: "Present, but depends on a deployed environment." },
    ],
  },
  {
    key: "legacy",
    title: "Legacy / superseded",
    note: "inventory §4 — kept for reference",
    items: [
      { name: "TalkieLive residual", note: "Only history panel views remain; the Agent absorbed live." },
      { name: "Settings section aliases", note: "Many cases redirect into consolidated settings." },
      { name: "live/* URL aliases", note: "Compatibility routes mapping onto the Agent." },
      { name: "navigateToLive* notifications", note: "Deprecated; renamed to Agent." },
      { name: ".disabled sources", note: "LLMModelsSettingsView and LiveHistoryView are parked." },
      { name: "HomeNextStub", note: "Phase 0 leftover, superseded by the real HomeNextView." },
      { name: "docs/donors + archived-talkie-os", note: "Pre-rebuild snapshots and the old iOS project." },
      { name: "SYSTEM_ARCHITECTURE drift", note: "Still centres a standalone TalkieEngine XPC app; the repo has moved to TalkieEngineCore + EngineClient." },
    ],
  },
];

const NAV: { id: string; label: string }[] = [
  { id: "pipeline", label: "Pipeline" },
  { id: "matrix", label: "Surface matrix" },
  { id: "index", label: "Index" },
  { id: "reference", label: "Reference" },
  { id: "garden", label: "Garden" },
  { id: "provenance", label: "Provenance" },
];

export function TalkieFeatureAtlasStudy({ page }: { page: StudioAppPage }) {
  const [gardenOpen, setGardenOpen] = useState(false);

  const counts = useMemo(() => {
    const byMaturity = {} as Record<Maturity, number>;
    const bySurface = {} as Record<SurfaceKey, number>;
    const byJob = {} as Record<JobKey, number>;
    const byJobMaturity = {} as Record<JobKey, Record<Maturity, number>>;
    const cell = {} as Record<SurfaceKey, Record<JobKey, number>>;

    for (const m of MATURITY_ORDER) byMaturity[m] = 0;
    for (const s of SURFACE_ORDER) {
      bySurface[s] = 0;
      cell[s] = {} as Record<JobKey, number>;
      for (const j of JOBS) cell[s][j.key] = 0;
    }
    for (const j of JOBS) {
      byJob[j.key] = 0;
      byJobMaturity[j.key] = {} as Record<Maturity, number>;
      for (const m of MATURITY_ORDER) byJobMaturity[j.key][m] = 0;
    }

    let peak = 0;
    for (const f of FEATURES) {
      byMaturity[f.maturity] += 1;
      byJob[f.job] += 1;
      byJobMaturity[f.job][f.maturity] += 1;
      for (const s of f.surfaces) {
        bySurface[s] += 1;
        cell[s][f.job] += 1;
        if (cell[s][f.job] > peak) peak = cell[s][f.job];
      }
    }
    return { byMaturity, bySurface, byJob, byJobMaturity, cell, peak };
  }, []);

  return (
    <main className="talkie-atlas w-full px-6 py-10 lg:px-8">
      {/* ── Masthead ────────────────────────────────────────── */}
      <header className="atlas-wide">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
          {page.bucket} / talkie · feature atlas
        </div>

        <div className="mast">
          <div className="mast-lede">
            <h1 className="mast-title">
              Everything Talkie can do, by the job you came to do.
            </h1>
            <p className="mast-para">
              Talkie spans a macOS app, an always-on capture agent, iPhone,
              Watch, a keyboard and share extension, a local server, and a CLI.
              This atlas maps that surface onto five jobs —{" "}
              <span className="text-studio-ink-strong">
                Capture, Understand, Transform, Route, Recall
              </span>{" "}
              — so the capability reads as one product, not a pile of modules.
              Every entry is grounded in the repo inventory, and each carries an
              honest maturity label.
            </p>
          </div>

          <dl className="mast-meta">
            <div>
              <dt>Evidence</dt>
              <dd>talkie-feature-inventory-2026-07-25</dd>
            </div>
            <div>
              <dt>Checkout</dt>
              <dd>~/dev/talkie · master · clean</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>Traced entry points, not marketing copy</dd>
            </div>
          </dl>
        </div>

        <div className="stat-band mt-8">
          <StatCell num={FEATURES.length} label="Capabilities" />
          <StatCell num={counts.byMaturity.shipped} label="Shipped" />
          <StatCell num={JOBS.length} label="User jobs" />
          <StatCell num={SURFACE_ORDER.length} label="Surfaces" />
          <StatCell num={PROCESSES.length} label="Processes" />
          <StatCell num={STEPS.length} label="Workflow steps" />
          <StatCell num={HOTKEYS.length} label="Agent hotkeys" />
          <StatCell num={FLAGS.length} label="Runtime flags" />
        </div>

        {/* Spectrum — one bar per capability. Height reads surface span,
            colour reads maturity, grouping reads the pipeline. */}
        <figure className="spectrum-fig">
          <div className="spectrum">
            {JOBS.map((j) => {
              const bars = FEATURES.filter((f) => f.job === j.key);
              return (
                <div key={j.key} className="spec-group" style={{ flexGrow: bars.length }}>
                  <div className="spec-bars">
                    {bars.map((f) => (
                      <span
                        key={f.name}
                        className="spec-bar"
                        data-maturity={f.maturity}
                        style={{ height: `${28 + f.surfaces.length * 18}%` }}
                        title={`${f.name} — ${MATURITY[f.maturity].label} · ${f.surfaces
                          .map((s) => SURFACES[s].label)
                          .join(", ")}`}
                      />
                    ))}
                  </div>
                  <div className="spec-key">
                    <span className="spec-key-idx">{j.index}</span>
                    {j.title}
                    <span className="spec-key-n">{bars.length}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <figcaption>
            Every capability in the inventory, one bar each — bar height is how
            many surfaces it spans, colour is its maturity, and the five groups
            are the pipeline below.
          </figcaption>
        </figure>

        <nav className="jump-nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="jump-link">
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Pipeline ────────────────────────────────────────── */}
      <section id="pipeline" className="atlas-wide mt-14 scroll-mt-6">
        <SectionLabel>Pipeline</SectionLabel>
        <p className="section-note">
          A capture flows left to right — spoken or seen, made legible,
          reshaped, routed to its destination, then kept for later. The bar
          under each job is its maturity split.
        </p>
        <div className="cap-map">
          {JOBS.map((j) => {
            const Icon = j.icon;
            const total = counts.byJob[j.key];
            return (
              <div key={j.key} className="cap-lane">
                <div className="cap-index">{j.index}</div>
                <div className="cap-title">
                  <Icon size={16} strokeWidth={1.75} />
                  {j.title}
                </div>
                <div className="cap-verb">{j.verb}</div>
                <div className="cap-split" role="img"
                  aria-label={MATURITY_ORDER.map(
                    (m) => `${counts.byJobMaturity[j.key][m]} ${MATURITY[m].label}`,
                  ).join(", ")}
                >
                  {MATURITY_ORDER.map((m) => {
                    const n = counts.byJobMaturity[j.key][m];
                    if (n === 0) return null;
                    return (
                      <span
                        key={m}
                        data-maturity={m}
                        style={{ flexGrow: n }}
                        title={`${n} ${MATURITY[m].label}`}
                      />
                    );
                  })}
                </div>
                <div className="cap-count">
                  {total} capabilities
                  <span className="cap-count-s">
                    {counts.byJobMaturity[j.key].shipped} shipped
                  </span>
                </div>
                <div className="cap-spark">
                  {j.spark.map((s) => (
                    <span key={s} className="cap-chip">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Data-driven capability nano app ────────────────── */}
      <section className="atlas-wide mt-14">
        <TalkieFeatureExplorer
          features={FEATURES}
          jobs={JOBS}
          surfaces={SURFACES}
          surfaceOrder={SURFACE_ORDER}
          maturities={MATURITY}
          maturityOrder={MATURITY_ORDER}
        />
      </section>
      {/* ── Reference strata ────────────────────────────────── */}
      <section id="reference" className="atlas-wide mt-16 scroll-mt-6">
        <SectionLabel>Reference</SectionLabel>
        <p className="section-note">
          The parts of the inventory that are lists, not capabilities: what is
          on by default, what a workflow can do, and what the hotkeys reach.
        </p>

        <div className="ref-grid">
          <div className="ref-panel ref-flags">
            <h3 className="ref-title">
              Runtime flag defaults
              <span className="ref-src">§7 · RuntimeFeatureFlags.swift</span>
            </h3>
            <ul className="flag-list">
              {FLAGS.map((f) => (
                <li key={f.name} data-on={f.on}>
                  <span className="flag-name">{f.name}</span>
                  <span className="flag-state">{f.on ? "on" : "off"}</span>
                </li>
              ))}
            </ul>
            <p className="ref-foot">
              Remote override: <code>api.usetalkie.com/api/flags</code>
            </p>
          </div>

          <div className="ref-panel">
            <h3 className="ref-title">
              Workflow steps
              <span className="ref-src">§8 · executor-backed</span>
            </h3>
            <div className="tok-wrap">
              {STEPS.map((s) => (
                <span key={s} className="tok">
                  {s}
                </span>
              ))}
            </div>
            <h4 className="ref-sub">Templates on disk</h4>
            <div className="tok-wrap">
              {TEMPLATES.map((t) => (
                <span key={t} className="tok tok-quiet">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="ref-panel">
            <h3 className="ref-title">
              Agent hotkeys
              <span className="ref-src">§9 · AppDelegate registrations</span>
            </h3>
            <ol className="hk-list">
              {HOTKEYS.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="ref-panel mt-4">
          <h3 className="ref-title">
            Process &amp; product surfaces
            <span className="ref-src">what actually runs</span>
          </h3>
          <div className="proc-grid">
            {PROCESSES.map((p) => (
              <div key={p.name} className="proc">
                <div className="proc-name">{p.name}</div>
                <div className="proc-path">{p.path}</div>
                <div className="proc-role">{p.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product garden (internal cleanup layer) ─────────── */}
      <section id="garden" className="atlas-wide mt-16 scroll-mt-6">
        <div className="garden">
          <button
            type="button"
            className="garden-toggle"
            aria-expanded={gardenOpen}
            onClick={() => setGardenOpen((v) => !v)}
          >
            {gardenOpen ? (
              <ChevronDown size={16} strokeWidth={1.75} />
            ) : (
              <ChevronRight size={16} strokeWidth={1.75} />
            )}
            <Sprout size={15} strokeWidth={1.75} />
            <span className="flex flex-col">
              <span className="garden-eyebrow">Internal · product garden</span>
              <span className="text-[13px] font-medium text-studio-ink-strong">
                Consolidation &amp; cleanup candidates
              </span>
            </span>
            <span className="garden-n">
              {GARDEN.reduce((n, c) => n + c.items.length, 0)}
            </span>
          </button>
          {gardenOpen ? (
            <>
              <div className="garden-body">
                {GARDEN.map((col) => (
                  <div key={col.key} className="garden-col">
                    <h4>{col.title}</h4>
                    {col.items.map((item) => (
                      <div key={item.name} className="garden-item">
                        <div className="gi-name">{item.name}</div>
                        <div className="gi-note">{item.note}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="garden-src-note">
                Sourced from talkie-feature-inventory-2026-07-25.md (§3 Partial,
                §4 Legacy, §6 Overlaps). This layer stays restrained on purpose —
                the atlas above celebrates capability. If a dedicated
                cleanup-candidates document lands, its highest-confidence
                recommendations fold in here.
              </p>
            </>
          ) : null}
        </div>
      </section>

      {/* ── Provenance ──────────────────────────────────────── */}
      <section id="provenance" className="mt-14 max-w-[860px] scroll-mt-6">
        <SectionLabel>Provenance</SectionLabel>
        <EngDocSheet className="mt-3 w-full">
          <DataRow label="evidence" labelWidth={160}>
            talkie-feature-inventory-2026-07-25.md
          </DataRow>
          <DataRow label="organising model" labelWidth={160}>
            Capture · Understand · Transform · Route · Recall
          </DataRow>
          <DataRow label="maturity legend" labelWidth={160}>
            S Shipped · E Experimental · P Partial · L Legacy
          </DataRow>
          <DataRow label="surfaces" labelWidth={160}>
            {SURFACE_ORDER.map((s) => SURFACES[s].label).join(" · ")}
          </DataRow>
          <DataRow label="high confidence" labelWidth={160}>
            Dictation, capture, workflow steps, settings sections, iOS shell
            surfaces, CLI commands, server modules, feature flags — all traced
            to enums, routes, executors, or hotkey registrations.
          </DataRow>
          <DataRow label="medium confidence" labelWidth={160}>
            The production CloudKit default for end users; whether the email
            step sends or only composes; how often the Agent rather than the
            main capture UI is shown in release builds.
          </DataRow>
          <DataRow label="known drift" labelWidth={160}>
            SYSTEM_ARCHITECTURE.md still centres a standalone TalkieEngine XPC
            app; the repo has moved to TalkieEngineCore + EngineClient.
          </DataRow>
          <DataRow label="not claimed" labelWidth={160}>
            Design mocks, icon exploration, archived donors, packaging scripts,
            and specs without runtime entry points.
          </DataRow>
        </EngDocSheet>
      </section>
    </main>
  );
}

function StatCell({ num, label }: { num: number; label: string }) {
  return (
    <div className="stat-cell">
      <div className="stat-num">{num}</div>
      <span className="stat-key">{label}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
      {children}
    </div>
  );
}
