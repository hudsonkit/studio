import type { ReactNode } from "react";

export interface EngDocSheetProps {
  children: ReactNode;
  className?: string;
}

/**
 * Container frame for an engineering-doc metadata sheet. Lightweight
 * styling via `.eng-sheet` — used now for footer/colophon panels rather
 * than the page header. Visual treatment lives in the host app's CSS.
 */
export function EngDocSheet({ children, className }: EngDocSheetProps) {
  const classes = ["eng-sheet", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div>{children}</div>
    </div>
  );
}

export interface DataRowProps {
  label: string;
  children: ReactNode;
  /**
   * Width of the label column in px. Defaults to 120 to match the
   * existing studio sheets.
   */
  labelWidth?: number;
}

/**
 * One row in a data sheet — fixed-width label column on the left, free
 * value column on the right. Identifier mono, label uppercase-eyebrow.
 */
export function DataRow({ label, children, labelWidth = 120 }: DataRowProps) {
  return (
    <div
      className="eng-sheet__row grid gap-6 px-4 py-3 sm:px-6"
      style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}
    >
      <div className="pt-[3px] font-mono text-[9px] font-semibold uppercase tracking-eyebrow text-studio-ink-faint">
        {label}
      </div>
      <div className="min-w-0 text-[13px] text-studio-ink">{children}</div>
    </div>
  );
}
