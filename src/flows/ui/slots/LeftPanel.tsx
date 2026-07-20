/**
 * Left rail — maps + journeys (Atelier/Shaper section style).
 * Minimap lives in LeftFooter, not here.
 */

import { RefreshCw } from "lucide-react";
import { useFlowState } from "../FlowState";

export function FlowLeftPanel() {
  const {
    files,
    filesError,
    refreshFiles,
    fileId,
    setFileId,
    pageId,
    payload,
    focusPage,
  } = useFlowState();

  return (
    <div className="flex h-full min-h-0 flex-col font-mono text-[11px]">
      {/* Flow maps */}
      <div className="border-b border-border/60">
        <div className="flow-section-head justify-between">
          <span className="flex items-center gap-2">Flow maps</span>
          <button
            type="button"
            onClick={() => void refreshFiles()}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Refresh maps"
          >
            <RefreshCw size={11} strokeWidth={1.5} />
          </button>
        </div>
        <div className="space-y-0.5 px-2 py-2">
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              data-active={f.id === fileId ? "true" : "false"}
              onClick={() => setFileId(f.id)}
              className="flow-list-row"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{f.name}</span>
                <span className="flow-eyebrow mt-0.5 block normal-case tracking-normal opacity-70">
                  {f.pageCount} pages
                </span>
              </span>
            </button>
          ))}
          {!files.length ? (
            <p className="px-2 py-2 text-[10px] text-muted-foreground">
              No flows — create via MCP
            </p>
          ) : null}
        </div>
      </div>

      {/* Journeys */}
      <div className="min-h-0 flex-1 overflow-y-auto frame-scrollbar">
        {payload?.journeys.map((j) => (
          <div key={j.id} className="border-b border-border/60">
            <div className="flow-section-head">
              <span className="flex-1 text-left">{j.name}</span>
              <span className="tabular-nums font-normal text-muted-foreground/70">
                {j.pageIds.length}
              </span>
            </div>
            <div className="space-y-0.5 px-2 py-2">
              {j.pageIds.map((id) => {
                const p = payload.pages.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    data-active={p.id === pageId ? "true" : "false"}
                    onClick={() => focusPage(p.id)}
                    className="flow-list-row"
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {fileId && !payload && !filesError ? (
          <p className="flow-eyebrow px-3 py-4">Loading journeys…</p>
        ) : null}
        {filesError ? (
          <p className="px-3 py-2 text-[10px] text-warning">{filesError}</p>
        ) : null}
      </div>
    </div>
  );
}
