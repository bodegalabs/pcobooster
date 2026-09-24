import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Hosts a decorative looping animation and pauses it while it is offscreen, so phones do not
 * spend frames on graphics nobody can see. Before hydration (and without JavaScript) the loop
 * simply runs; `prefers-reduced-motion` stops it entirely in `globals.css`.
 */
export const LoopWhenVisible = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Written straight to the DOM: visibility changes never need a React render.
          if (entry.target instanceof HTMLElement) {
            entry.target.dataset.loop = entry.isIntersecting
              ? "running"
              : "paused";
          }
        }
      },
      { rootMargin: "120px 0px" }
    );
    if (ref.current !== null) {
      observer.observe(ref.current);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={className} data-loop="running" aria-hidden="true">
      {children}
    </div>
  );
};
