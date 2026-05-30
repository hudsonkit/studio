/*
 * Studio theme — re-exports from hudsonkit/theme.
 *
 * Consumers wire up via:
 *   import { HudsonThemeScript, ThemeProvider } from "studio/theme";
 *   import "studio/theme.css";
 *
 * The aliases.css file (exported as "studio/theme.css") maps studio's
 * --studio-* / --scout-* / --status-* / --code-* variables onto hudsonkit's
 * --hud-* tokens, so studio's component code stays unchanged while the
 * actual values flow from hudsonkit's theme system.
 *
 * Note: lower-level theme-script utilities (getHudsonThemeScript,
 * DEFAULT_THEME, etc.) currently lack a .d.ts in hudsonkit's dist build.
 * Import them directly from "hudsonkit/theme-script" until that's fixed.
 */

export {
  HudsonThemeScript,
  ThemeProvider,
  useTheme,
  useOptionalTheme,
} from "hudsonkit/theme";

export type {
  HudsonTheme,
  HudsonTemplate,
  ThemeProviderProps,
} from "hudsonkit/theme";
