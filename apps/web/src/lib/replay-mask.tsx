import { REPLAY_MASK_ATTRIBUTE } from "@pcobooster/analytics/replay-markers";
import type { HTMLAttributes, ReactNode } from "react";

/** Masks descendant text in PostHog replay while leaving layout and chrome readable. */
export const ReplayMask = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) => (
  <span className={className} {...{ [REPLAY_MASK_ATTRIBUTE]: "" }} {...props}>
    {children}
  </span>
);
