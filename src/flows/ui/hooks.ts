/**
 * Flow commands for Cmd+K — no AppShell dependency.
 */

import { useMemo } from "react";
import type { CommandOption } from "hudsonkit/overlays";
import { useFlowState } from "./FlowState";

export type FlowCommandBridge = {
  openInspector: () => void;
  openSettings: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
};

export function useFlowCommands(bridge?: FlowCommandBridge): CommandOption[] {
  const {
    files,
    payload,
    pageId,
    focusPage,
    setFileId,
    fitAll,
    refreshFiles,
    settings,
    updateSettings,
  } = useFlowState();

  return useMemo(() => {
    const cmds: CommandOption[] = [
      {
        id: "flow:fit-all",
        label: "Fit all pages",
        shortcut: "Cmd+0",
        action: () => fitAll(),
      },
      {
        id: "flow:refresh",
        label: "Refresh maps",
        action: () => void refreshFiles(),
      },
      {
        id: "flow:toggle-minimap",
        label: settings.showMinimap ? "Hide minimap" : "Show minimap",
        action: () => updateSettings({ showMinimap: !settings.showMinimap }),
      },
      {
        id: "flow:toggle-labels",
        label: settings.showJourneyLabels
          ? "Hide journey labels"
          : "Show journey labels",
        action: () =>
          updateSettings({ showJourneyLabels: !settings.showJourneyLabels }),
      },
    ];

    if (bridge) {
      cmds.push(
        {
          id: "flow:open-settings",
          label: "Open settings",
          shortcut: "Cmd+,",
          action: bridge.openSettings,
        },
        {
          id: "flow:open-inspector",
          label: "Open inspector",
          action: bridge.openInspector,
        },
        {
          id: "flow:toggle-left",
          label: "Toggle journeys panel",
          shortcut: "Cmd+[",
          action: bridge.toggleLeft,
        },
        {
          id: "flow:toggle-right",
          label: "Toggle inspector",
          shortcut: "Cmd+]",
          action: bridge.toggleRight,
        },
      );
    }

    for (const f of files) {
      cmds.push({
        id: `flow:map:${f.id}`,
        label: `Open map: ${f.name}`,
        action: () => setFileId(f.id),
      });
    }

    if (payload) {
      for (const p of payload.pages) {
        const label = [p.journeyName, p.name].filter(Boolean).join(" · ");
        cmds.push({
          id: `flow:page:${p.id}`,
          label: `Go to ${label}`,
          action: () => focusPage(p.id),
        });
      }

      if (pageId) {
        const ids = payload.pages.map((p) => p.id);
        const i = ids.indexOf(pageId);
        if (i > 0) {
          const prev = payload.pages[i - 1]!;
          cmds.push({
            id: "flow:prev-page",
            label: `Previous page: ${prev.name}`,
            action: () => focusPage(prev.id),
          });
        }
        if (i >= 0 && i < ids.length - 1) {
          const next = payload.pages[i + 1]!;
          cmds.push({
            id: "flow:next-page",
            label: `Next page: ${next.name}`,
            action: () => focusPage(next.id),
          });
        }
      }
    }

    return cmds;
  }, [
    files,
    payload,
    pageId,
    focusPage,
    setFileId,
    fitAll,
    refreshFiles,
    settings,
    updateSettings,
    bridge,
  ]);
}
