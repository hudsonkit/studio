import { createContext, useContext, type ReactNode } from "react";

export type FlowDiscussTarget = {
  projectName?: string;
  projectRoot?: string;
};

export type FlowRuntimeOptions = {
  discuss?: FlowDiscussTarget;
};

const FlowRuntimeContext = createContext<FlowRuntimeOptions>({});

export function FlowRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: FlowRuntimeOptions;
}) {
  return (
    <FlowRuntimeContext.Provider value={value}>
      {children}
    </FlowRuntimeContext.Provider>
  );
}

export function useFlowRuntime(): FlowRuntimeOptions {
  return useContext(FlowRuntimeContext);
}
