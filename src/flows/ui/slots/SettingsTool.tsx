/**
 * Settings tool — accordion body in the right rail (app.tools).
 */

import { HudButton } from "hudsonkit/primitives";
import { useFlowState } from "../FlowState";

export function SettingsTool() {
  const { settings, updateSettings, resetSettings, requestFitAll } =
    useFlowState();

  return (
    <div className="space-y-4 font-mono text-[11px]">
      <p className="text-[11px] leading-relaxed text-muted-foreground normal-case tracking-normal">
        Canvas and map display. Stored in this browser.
      </p>

      <div className="space-y-1.5">
        <label className="flow-list-row justify-between">
          <span>Show minimap</span>
          <input
            type="checkbox"
            checked={settings.showMinimap}
            onChange={(e) => updateSettings({ showMinimap: e.target.checked })}
            className="accent-[oklch(var(--accent))]"
          />
        </label>
        <label className="flow-list-row justify-between">
          <span>Journey row labels</span>
          <input
            type="checkbox"
            checked={settings.showJourneyLabels}
            onChange={(e) =>
              updateSettings({ showJourneyLabels: e.target.checked })
            }
            className="accent-[oklch(var(--accent))]"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="flow-eyebrow">Grid opacity</span>
          <span className="tabular-nums text-[10px] text-muted-foreground">
            {Math.round(settings.gridOpacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.gridOpacity * 100)}
          onChange={(e) =>
            updateSettings({ gridOpacity: Number(e.target.value) / 100 })
          }
          className="w-full accent-[oklch(var(--accent))]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <HudButton
          tone="neutral"
          variant="soft"
          density="compact"
          onClick={() => requestFitAll()}
        >
          Fit all pages
        </HudButton>
        <HudButton
          tone="neutral"
          variant="ghost"
          density="compact"
          onClick={() => resetSettings()}
        >
          Reset defaults
        </HudButton>
      </div>
    </div>
  );
}
