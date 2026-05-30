import type { ReactNode } from "react";

export type StatusTone = "ok" | "warn" | "error" | "info" | "neutral";

export type StatusPillVariant = "filled" | "outlined" | "text";

export interface StatusPillProps {
  tone: StatusTone;
  label: string;
  variant?: StatusPillVariant;
  className?: string;
}

/**
 * Status pill primitive. Colors come from `--status-{tone}-fg` /
 * `--status-{tone}-bg` CSS vars in the consumer's globals, so the
 * same component theme-flips for free.
 *
 * Variants:
 *   filled    — colored bg + matching fg, the bordered chip form
 *   outlined  — transparent bg, colored fg + matching outline
 *   text      — just colored mono caps, no bg, no border
 */
export function StatusPill({
  tone,
  label,
  variant = "filled",
  className,
}: StatusPillProps): ReactNode {
  const fg = `var(--status-${tone}-fg)`;
  const bg = `var(--status-${tone}-bg)`;

  const base =
    "inline-block rounded-[3px] font-mono text-[9px] font-semibold tracking-[0.18em]";

  if (variant === "text") {
    return (
      <span
        className={cls(base, "px-0", className)}
        style={{ color: fg }}
      >
        {label}
      </span>
    );
  }

  if (variant === "outlined") {
    return (
      <span
        className={cls(base, "border px-1.5 py-0.5", className)}
        style={{ color: fg, borderColor: fg }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={cls(base, "px-1.5 py-0.5", className)}
      style={{ color: fg, background: bg }}
    >
      {label}
    </span>
  );
}

export interface StatusEntry {
  tone: StatusTone;
  label: string;
}

export interface StatusPalette<Status extends string> {
  /** Pill bound to the consumer's status union. */
  StatusPill: (props: {
    status: Status;
    variant?: StatusPillVariant;
    className?: string;
    /** Override the looked-up label. */
    label?: string;
  }) => ReactNode;
  statusToTone(status: Status): StatusTone;
  statusToLabel(status: Status): string;
  /** Status → CSS var for the foreground color, for status dots etc. */
  statusToColor(status: Status): string;
}

/**
 * Bind the generic pill to a consumer's status union by providing the
 * status → { tone, label } mapping. Returns a typed component plus
 * lookup helpers — `statusToColor` is handy for the sidebar's status
 * dots.
 */
export function createStatusPalette<Status extends string>(
  map: Record<Status, StatusEntry>,
): StatusPalette<Status> {
  function statusToTone(status: Status): StatusTone {
    return map[status].tone;
  }

  function statusToLabel(status: Status): string {
    return map[status].label;
  }

  function statusToColor(status: Status): string {
    return `var(--status-${map[status].tone}-fg)`;
  }

  function BoundStatusPill({
    status,
    variant,
    className,
    label,
  }: {
    status: Status;
    variant?: StatusPillVariant;
    className?: string;
    label?: string;
  }): ReactNode {
    const entry = map[status];
    return (
      <StatusPill
        tone={entry.tone}
        label={label ?? entry.label}
        variant={variant}
        className={className}
      />
    );
  }

  return {
    StatusPill: BoundStatusPill,
    statusToTone,
    statusToLabel,
    statusToColor,
  };
}

function cls(...parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(" ");
}
