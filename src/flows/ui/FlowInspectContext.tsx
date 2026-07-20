/**
 * Inspect context — live embeds read selected region + report clicks.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { FlowSelection } from "./inspect";

export type FlowInspectContextValue = {
  /** Page currently being inspected (active map selection). */
  pageId: string | null;
  /** When true, pointer on the embed picks regions instead of pan/zoom. */
  inspectMode: boolean;
  selection: FlowSelection | null;
  selectRegion: (args: {
    pageId?: string;
    regionId: string;
    label: string;
    role: string | null;
    note: string | null;
    text: string | null;
  }) => void;
};

const FlowInspectContext = createContext<FlowInspectContextValue | null>(
  null,
);

export function FlowInspectProvider({
  value,
  children,
}: {
  value: FlowInspectContextValue;
  children: ReactNode;
}) {
  return (
    <FlowInspectContext.Provider value={value}>
      {children}
    </FlowInspectContext.Provider>
  );
}

export function useFlowInspect(): FlowInspectContextValue | null {
  return useContext(FlowInspectContext);
}
