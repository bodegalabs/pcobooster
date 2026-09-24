import { cn } from "cn";
import type { ReactNode } from "react";

/** A lifted card around the product replica. */
export const DemoFrame = ({
  children,
  label,
  overflow = "hidden",
}: {
  children: ReactNode;
  label: string;
  /** `visible` lets popovers inside the replica extend past the frame. */
  overflow?: "hidden" | "visible";
}) => (
  <figure
    aria-label={label}
    className={cn(
      "shadow-frame min-w-0 rounded-xl bg-white md:rounded-2xl",
      overflow === "hidden" && "overflow-hidden"
    )}
  >
    {children}
  </figure>
);
