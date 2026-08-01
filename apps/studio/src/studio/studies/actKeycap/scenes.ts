/**
 * ACT-KEYCAP scene data.
 *
 * Deliberately a plain (non-"use client") module so server route components
 * can read the values directly instead of receiving client references.
 *
 * Key tokens match what `keyCaptionKeys(from:)` + `keyOverlayLabel(_:)` in
 * ActionHostMain.swift produce for each label.
 */

export type KeyCaptionScene = "return" | "chord";

export const SCENE_KEYS: Record<KeyCaptionScene, readonly string[]> = {
  return: ["↩"],
  chord: ["⌘", "⇧", "⌥", "P"],
};

export const SCENE_LABEL: Record<KeyCaptionScene, string> = {
  return: "Return",
  chord: "Command + Shift + Option + P",
};
