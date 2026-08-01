"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import "./talkieReceipt.css";

export type TalkieReceiptTone =
  | "delivered"
  | "shipped"
  | "experimental"
  | "partial"
  | "legacy";

export interface TalkieReceiptLine {
  id: string;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  state?: "complete" | "present" | "attention";
}

export interface TalkieReceiptProps {
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  status: string;
  tone?: TalkieReceiptTone;
  lines: TalkieReceiptLine[];
  footer?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function TalkieReceipt({
  eyebrow,
  title,
  meta,
  status,
  tone = "delivered",
  lines,
  footer,
  compact = false,
  className = "",
}: TalkieReceiptProps) {
  return (
    <article
      className={`talkie-receipt ${compact ? "is-compact" : ""} ${className}`.trim()}
      data-tone={tone}
    >
      <header className="talkie-receipt__head">
        <span className="talkie-receipt__signal" aria-hidden="true">
          ✦
        </span>
        <div className="talkie-receipt__identity">
          {eyebrow ? <span className="talkie-receipt__eyebrow">{eyebrow}</span> : null}
          <strong>{title}</strong>
          {meta ? <small>{meta}</small> : null}
        </div>
        <span className="talkie-receipt__status">{status}</span>
      </header>

      <div className="talkie-receipt__body">
        {lines.map((line) => (
          <div
            key={line.id}
            className="talkie-receipt__row"
            data-state={line.state ?? "complete"}
          >
            <span className="talkie-receipt__label">
              <span className="talkie-receipt__icon" aria-hidden="true">
                {line.icon}
              </span>
              {line.label}
            </span>
            <strong className="talkie-receipt__value">{line.value}</strong>
            <Check className="talkie-receipt__check" size={12} strokeWidth={2} />
          </div>
        ))}
      </div>

      {footer ? <footer className="talkie-receipt__foot">{footer}</footer> : null}
    </article>
  );
}
