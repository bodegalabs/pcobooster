import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one centered column every product page sits in. It spans the whole inset and centers
 * its content with `--page-gutter` padding, so a scroll container here keeps its scrollbar on
 * the inset edge. Pages never pick their own width: `lint/page-width.test.ts` rejects `mx-auto`
 * with a `max-w-*` container width anywhere else.
 */
export const pageColumnClassName = "w-full px-(--page-gutter)";
// Scroll containers inside the column bleed out to the inset edge with
// `-mx-(--page-gutter)` and pad their content back with `px-(--page-gutter)`.

/**
 * Inset page layout: a full-height `main` with one centered column that scrolls on desktop.
 * It takes no width or class overrides so every page renders at the same width.
 */
export const PageShell = ({
  children,
  label,
  busy = false,
}: {
  children: ReactNode;
  /** Accessible name for the landmark, used by loading fallbacks. */
  label?: string;
  busy?: boolean;
}) => (
  <main
    className="bg-background flex flex-1 flex-col md:h-full md:min-h-0 md:overflow-hidden"
    aria-busy={busy || undefined}
    aria-label={label}
  >
    <div
      className={cn(
        pageColumnClassName,
        "pb-safe-4 flex flex-1 flex-col gap-3 pt-1 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:py-4"
      )}
    >
      {children}
    </div>
  </main>
);
