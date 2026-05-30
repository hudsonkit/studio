"use client";

import NextLink from "next/link";
import {
  usePathname as useNextPathname,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import type { ReactNode } from "react";
import {
  StudioRouterProvider,
  type StudioRouter,
  type StudioLinkProps,
} from "./context";

const NextStudioLink = ({ href, className, children }: StudioLinkProps) => (
  <NextLink href={href} className={className}>
    {children}
  </NextLink>
);

function useNextSearchParamsAdapter(): URLSearchParams {
  const params = useNextSearchParams();
  return params ?? new URLSearchParams();
}

export const nextRouter: StudioRouter = {
  Link: NextStudioLink,
  usePathname: useNextPathname,
  useSearchParams: useNextSearchParamsAdapter,
};

/**
 * Drop this near the root of a Next.js App Router consumer. Inside
 * it, studio's shell components use `next/link` + `next/navigation`
 * for routing.
 */
export function NextRouterProvider({ children }: { children: ReactNode }) {
  return (
    <StudioRouterProvider router={nextRouter}>{children}</StudioRouterProvider>
  );
}
