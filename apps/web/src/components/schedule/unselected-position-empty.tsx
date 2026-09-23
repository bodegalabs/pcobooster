"use client";

/** Wide layouts keep the position list in a sidebar; phones show it inline instead. */
export const UnselectedPositionEmpty = () => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center max-lg:hidden lg:h-full">
    <p className="text-muted-foreground text-sm">
      Pick a position on the left.
    </p>
  </div>
);
