import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TourStep {
  /** The `data-tour` value of the element this step points at. */
  readonly target: string;
  readonly title: string;
  readonly body: ReactNode;
  readonly side?: "top" | "bottom" | "left" | "right";
}

/** How long the tour waits for elements that are still loading (a list's first answer). */
const TARGET_WAIT_MS = 2500;
/** Once nothing new has shown up for this long, the page has settled. */
const TARGET_SETTLE_MS = 500;
const SPOTLIGHT_PADDING_PX = 6;

/** The first rendered, visible element for a step; the phone and desktop layouts each mark their own. */
const findTarget = (target: string): HTMLElement | null => {
  for (const element of document.querySelectorAll<HTMLElement>(
    `[data-tour="${target}"]`
  )) {
    const rect = element.getBoundingClientRect();
    const onScreen = rect.right > 0 && rect.left < window.innerWidth;
    if (rect.width > 0 && rect.height > 0 && onScreen) {
      return element;
    }
  }
  return null;
};

/**
 * Polls for the steps' elements until the page settles, then reports the steps that have
 * one. Steps for a section this account can't open, or one the phone layout doesn't show,
 * drop out so the step count is honest. Returns a cancel function.
 */
const watchForTargets = (
  steps: readonly TourStep[],
  onSettled: (available: readonly TourStep[]) => void
): (() => void) => {
  const startedAt = performance.now();
  let changedAt = startedAt;
  let foundCount = -1;
  let frame = 0;
  const look = () => {
    const now = performance.now();
    const found = steps.filter((step) => findTarget(step.target) !== null);
    if (found.length !== foundCount) {
      foundCount = found.length;
      changedAt = now;
    }
    const settled = found.length > 0 && now - changedAt > TARGET_SETTLE_MS;
    if (
      found.length === steps.length ||
      settled ||
      now - startedAt > TARGET_WAIT_MS
    ) {
      onSettled(found);
      return;
    }
    frame = requestAnimationFrame(look);
  };
  look();
  return () => {
    cancelAnimationFrame(frame);
  };
};

/** Reports the element's box now and whenever the page scrolls or resizes under it. */
const watchRect = (
  element: HTMLElement | null,
  onRect: (element: HTMLElement, rect: DOMRect) => void
): (() => void) => {
  if (element === null) {
    return () => {
      // Nothing is being watched.
    };
  }
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const measure = () => {
    onRect(element, element.getBoundingClientRect());
  };
  // The observer reports once on its own as soon as it starts.
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  window.addEventListener("resize", measure);
  window.addEventListener("scroll", measure, true);
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", measure);
    window.removeEventListener("scroll", measure, true);
  };
};

type SpotlightStyle = CSSProperties & {
  "--tour-x": string;
  "--tour-y": string;
  "--tour-width": string;
  "--tour-height": string;
};

const Spotlight = ({ rect }: { rect: DOMRect }) => {
  const style: SpotlightStyle = {
    "--tour-x": `${rect.left - SPOTLIGHT_PADDING_PX}px`,
    "--tour-y": `${rect.top - SPOTLIGHT_PADDING_PX}px`,
    "--tour-width": `${rect.width + SPOTLIGHT_PADDING_PX * 2}px`,
    "--tour-height": `${rect.height + SPOTLIGHT_PADDING_PX * 2}px`,
  };
  return (
    <div
      aria-hidden
      className="tour-spotlight pointer-events-none fixed top-0 left-0 z-50 rounded-xl outline-2 outline-white/70"
      style={style}
    />
  );
};

/**
 * A step-by-step tour that dims the page and points at one element at a time. Steps
 * whose element isn't on screen are skipped. Escape or "Skip tour" ends it early.
 */
export const GuidedTour = ({
  steps,
  onFinish,
}: {
  steps: readonly TourStep[];
  /** Called once, when the person finishes or skips the tour. */
  onFinish: () => void;
}) => {
  const [available, setAvailable] = useState<readonly TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [measured, setMeasured] = useState<{
    element: HTMLElement;
    rect: DOMRect;
  } | null>(null);
  const step = available?.at(index) ?? null;
  // Read when the step renders; the element was on the page when the tour settled.
  const target = step === null ? null : findTarget(step.target);
  const rect =
    measured !== null && measured.element === target ? measured.rect : null;

  useEffect(
    () =>
      watchForTargets(steps, (found) => {
        if (found.length === 0) {
          // Nothing to point at on this page.
          onFinish();
          return;
        }
        setAvailable(found);
      }),
    [onFinish, steps]
  );

  useLayoutEffect(
    () =>
      watchRect(target, (element, nextRect) => {
        setMeasured({ element, rect: nextRect });
      }),
    [target]
  );

  if (available === null || step === null || target === null || rect === null) {
    // The page stays dimmed while the tour finds its elements, so it doesn't flicker.
    return <div aria-hidden className="fixed inset-0 z-50 bg-black/45" />;
  }

  const count = available.length;
  const isLast = index === count - 1;

  return (
    <>
      {/* Blocks the page under the tour; the spotlight only shows the element. */}
      <div aria-hidden className="fixed inset-0 z-50" />
      <Spotlight rect={rect} />
      <Popover
        open
        onOpenChange={(open, details) => {
          if (!open && details.reason === "escape-key") {
            onFinish();
          }
        }}
      >
        <PopoverContent
          anchor={target}
          side={step.side ?? "right"}
          align="start"
          sideOffset={SPOTLIGHT_PADDING_PX + 10}
          className="w-80"
          initialFocus={nextButtonRef}
        >
          <div className="flex flex-col gap-3 p-4">
            <p className="text-muted-foreground text-xs tabular-nums">
              {index + 1} of {count}
            </p>
            <div className="flex flex-col gap-1">
              <PopoverTitle>{step.title}</PopoverTitle>
              <PopoverDescription render={<div />}>
                {step.body}
              </PopoverDescription>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn("-ml-2", isLast && "invisible")}
                onClick={onFinish}
              >
                Skip tour
              </Button>
              <span className="flex-1" />
              {index > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIndex(index - 1);
                  }}
                >
                  Back
                </Button>
              ) : null}
              <Button
                ref={nextButtonRef}
                size="sm"
                onClick={() => {
                  if (isLast) {
                    onFinish();
                  } else {
                    setIndex(index + 1);
                  }
                }}
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};
