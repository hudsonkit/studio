"use client";

import "./keyCaptionOpusA.css";
import "./keyCaptionOpusB.css";

/**
 * ACT-KEYCAP-OPUS-A / -B — two independent caption treatments.
 *
 * Both consume the same key-token list produced by `keyCaptionKeys(from:)`
 * and share one semantic rule: every key before the last is *context*
 * (a modifier), the last key is the *action* and carries the only coral in
 * the component. The treatments express that rule in opposite materials.
 */

const MODIFIER_GLYPHS = new Set(["⌘", "⇧", "⌥", "⌃", "fn"]);

function isModifier(key: string): boolean {
  return MODIFIER_GLYPHS.has(key);
}

/* -------------------------------------------------------------------------
 * ACT-KEYCAP-OPUS-A — "Letterpress Plate"
 * ---------------------------------------------------------------------- */

export function KeyCaptionOpusA({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) return null;
  const solo = keys.length === 1;

  return (
    <div className="keycap-a" role="img" aria-label={keys.join(" + ")}>
      {keys.map((key, index) => {
        const action = index === keys.length - 1;
        const modifier = !action && isModifier(key);
        const cellClass = [
          "keycap-a__cell",
          modifier ? "keycap-a__cell--modifier" : "keycap-a__cell--action",
          action && solo ? "keycap-a__cell--solo" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <span className={cellClass} key={`${key}-${index}`}>
            <span className="keycap-a__glyph">{key}</span>
            {action ? (
              <span
                className="keycap-a__rule"
                style={{ width: solo ? 34 : 32 }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * ACT-KEYCAP-OPUS-B — "Machined Rail"
 * ---------------------------------------------------------------------- */

export function KeyCaptionOpusB({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) return null;
  const solo = keys.length === 1;

  return (
    <div
      className={`keycap-b${solo ? " keycap-b--solo" : ""}`}
      role="img"
      aria-label={keys.join(" + ")}
    >
      {keys.map((key, index) => {
        const action = index === keys.length - 1;
        const separator =
          index > 0 ? (
            <span className="keycap-b__sep" key={`sep-${index}`}>
              <span className="keycap-b__dot" />
            </span>
          ) : null;

        if (action) {
          return (
            <span key={`frag-${index}`} style={{ display: "contents" }}>
              {separator}
              <span
                className={`keycap-b__inlay${solo ? " keycap-b__inlay--solo" : ""}`}
              >
                <span className="keycap-b__glyph">{key}</span>
                <span className="keycap-b__lip" />
              </span>
            </span>
          );
        }

        return (
          <span key={`frag-${index}`} style={{ display: "contents" }}>
            {separator}
            <span className="keycap-b__well">
              <span className="keycap-b__glyph">{key}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/*
 * NOTE: no treatment *map* is exported from this module. It is a "use client"
 * module, so a server component importing a plain object from it receives a
 * client-reference proxy, not the object. Server routes build their own map
 * from the two component exports above.
 */
