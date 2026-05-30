"use client";

import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { useEffect, useState } from "react";
import { languageForFilename } from "./languages";
import { studioCodeTheme } from "./studioCodeTheme";

export type CodeViewerMode = "light" | "dark";

export type ThemeDetection =
  | { mode: "media" }
  | {
      mode: "data-attribute";
      /** Attribute on `documentElement` to watch. Default "data-theme". */
      attr?: string;
      /** Value that means light mode. Default "light". */
      lightValue?: string;
    }
  | { mode: "controlled"; value: CodeViewerMode };

export interface CodeViewerProps {
  content: string;
  filename: string;
  /**
   * How to detect light vs dark. Default `{ mode: "media" }` — follows
   * `prefers-color-scheme`. Use `{ mode: "data-attribute" }` when the
   * consumer toggles theme by setting `data-theme` on `<html>`. Use
   * `{ mode: "controlled" }` to drive it externally.
   */
  themeDetection?: ThemeDetection;
  /**
   * Build CodeMirror theme extensions for a given mode. Defaults to
   * `studioCodeTheme` — pulls colors from CSS vars in the consumer's
   * globals. Pass a different builder to use any other theme.
   */
  theme?: (mode: CodeViewerMode) => Extension | Extension[];
  /**
   * Extra extensions appended after the theme + language. Useful for
   * line-wrap, key bindings, etc.
   */
  extraExtensions?: ReadonlyArray<Extension>;
  className?: string;
}

/**
 * Read-only CodeMirror viewer with line numbers and language-aware
 * highlighting. Language pack covers Swift / TS / JS / JSX / TSX / MD /
 * JSON / CSS / SCSS / HTML / shell / YAML / TOML / Rust / Go / Python /
 * SQL. Unknown extensions render as plain text.
 */
export function CodeViewer({
  content,
  filename,
  themeDetection = { mode: "media" },
  theme = studioCodeTheme,
  extraExtensions,
  className,
}: CodeViewerProps) {
  const mode = useThemeMode(themeDetection);

  const lang = languageForFilename(filename);
  const themeExt = theme(mode);
  const themeArr = Array.isArray(themeExt) ? themeExt : [themeExt];

  const extensions: Extension[] = [
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ tabindex: "0" }),
    ...themeArr,
  ];
  if (lang) extensions.push(lang);
  if (extraExtensions) extensions.push(...extraExtensions);

  return (
    <div className={className}>
      <CodeMirror
        value={content}
        readOnly
        theme="none"
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          foldGutter: true,
          dropCursor: false,
          allowMultipleSelections: false,
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: false,
          crosshairCursor: false,
          indentOnInput: false,
        }}
      />
    </div>
  );
}

function useThemeMode(detection: ThemeDetection): CodeViewerMode {
  const initial: CodeViewerMode =
    detection.mode === "controlled" ? detection.value : "dark";
  const [mode, setMode] = useState<CodeViewerMode>(initial);

  useEffect(() => {
    if (detection.mode === "controlled") {
      setMode(detection.value);
      return;
    }

    if (detection.mode === "media") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const update = () => setMode(mq.matches ? "dark" : "light");
      update();
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    const attr = detection.attr ?? "data-theme";
    const lightValue = detection.lightValue ?? "light";
    const root = document.documentElement;
    const read = () =>
      setMode(root.getAttribute(attr) === lightValue ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: [attr] });
    return () => obs.disconnect();
  }, [
    detection.mode,
    detection.mode === "controlled" ? detection.value : null,
    detection.mode === "data-attribute" ? detection.attr : null,
    detection.mode === "data-attribute" ? detection.lightValue : null,
  ]);

  return mode;
}
