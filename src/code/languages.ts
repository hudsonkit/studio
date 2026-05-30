import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { css as cssLang } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { go } from "@codemirror/legacy-modes/mode/go";
import { python } from "@codemirror/legacy-modes/mode/python";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

/**
 * Resolve a CodeMirror language extension from a filename's extension.
 * Returns null for unknown extensions — the viewer falls back to plain
 * text rather than erroring.
 */
export function languageForFilename(filename: string): Extension | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "swift":
      return StreamLanguage.define(swift);
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "md":
    case "mdx":
      return markdown();
    case "json":
      return json();
    case "css":
    case "scss":
      return cssLang();
    case "html":
    case "htm":
      return html();
    case "sh":
    case "bash":
    case "zsh":
      return StreamLanguage.define(shell);
    case "yaml":
    case "yml":
      return StreamLanguage.define(yaml);
    case "toml":
      return StreamLanguage.define(toml);
    case "rs":
      return StreamLanguage.define(rust);
    case "go":
      return StreamLanguage.define(go);
    case "py":
      return StreamLanguage.define(python);
    case "sql":
      return StreamLanguage.define(standardSQL);
    default:
      return null;
  }
}
