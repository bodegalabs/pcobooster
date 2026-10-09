import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
// oxlint-disable-next-line react-doctor/no-flush-sync -- frames are captured one at a time; each replayed click must render before the next action looks for what it opened
import { flushSync } from "react-dom";
import { continueRender, delayRender } from "remotion";

import { resetChordCharts } from "../../../marketing/src/components/product-demo/chart-model";
import {
  navigateDemo,
  resetAssignments,
} from "../../../marketing/src/components/product-demo/demo-model";
import { resetPlan } from "../../../marketing/src/components/product-demo/plan-model";

/**
 * Something in the replica to point at: the first visible match for `selector`, or, with
 * `text`, the smallest visible match whose text is exactly that (widened to its nearest
 * `closest` ancestor when given).
 */
export interface Target {
  readonly selector: string;
  readonly text?: string;
  readonly closest?: string;
}

/**
 * One step of a scene's story. The replica keeps its state in module stores and in
 * component state; a beat sets the stores (cumulatively, from a clean reset) and replays
 * clicks and focus on a fresh mount for menus and previews that live in component state.
 * Every frame's picture is a pure function of its beat, so frames render identically in
 * any order.
 */
export interface Beat {
  readonly at: number;
  readonly apply?: () => void;
  readonly clicks?: readonly Target[];
  /** Elements to focus after the clicks, for previews that open on hover or focus. */
  readonly focus?: readonly Target[];
}

export const targetKey = (target: Target): string =>
  `${target.selector}::${target.text ?? ""}::${target.closest ?? ""}`;

const isVisible = (element: Element): boolean =>
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== "hidden";

const area = (element: Element): number => {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
};

const smallestWithText = (
  root: HTMLElement,
  selector: string,
  text: string
): HTMLElement | null => {
  let best: HTMLElement | null = null;
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (
      element.textContent?.trim() === text &&
      isVisible(element) &&
      (best === null || area(element) < area(best))
    ) {
      best = element;
    }
  }
  return best;
};

export const findTarget = (
  root: HTMLElement,
  target: Target
): HTMLElement | null => {
  const match =
    target.text === undefined
      ? ([...root.querySelectorAll<HTMLElement>(target.selector)].find(
          isVisible
        ) ?? null)
      : smallestWithText(root, target.selector, target.text);
  return target.closest === undefined
    ? match
    : (match?.closest<HTMLElement>(target.closest) ?? null);
};

export const beatIndexAt = (beats: readonly Beat[], frame: number): number => {
  let index = 0;
  for (const [position, beat] of beats.entries()) {
    if (beat.at <= frame) {
      index = position;
    }
  }
  return index;
};

/** Holds frame capture until the returned release is called (once; later calls do nothing). */
const holdFrame = (label: string): (() => void) => {
  const handle = delayRender(label);
  let held = true;
  return () => {
    if (held) {
      held = false;
      continueRender(handle);
    }
  };
};

/** Puts every replica store back to the sample plan as the marketing site first shows it. */
const resetReplica = () => {
  resetAssignments();
  resetChordCharts();
  resetPlan();
  navigateDemo({ view: "assign", positionId: "acoustic", songId: null });
};

/**
 * Renders the replica in the state of `beat`: mount fresh, then once it has subscribed to
 * its stores, on the next animation frame reset the stores, apply every beat up to this one, and replay this beat's clicks
 * and focus, each flushed so the next action finds what the last one opened. The frame
 * is held until the replay finishes.
 */
export const ScriptedReplica = ({
  beats,
  beat,
  onSettled,
  children,
}: {
  beats: readonly Beat[];
  beat: number;
  onSettled: (beat: number) => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Replaying a beat twice on the same mount would click its toggles closed again.
  const replayed = useRef<number | null>(null);

  const replay = useEffectEvent((root: HTMLElement) => {
    flushSync(() => {
      resetReplica();
      for (const entry of beats.slice(0, beat + 1)) {
        entry.apply?.();
      }
    });
    const current = beats[beat];
    for (const target of current?.clicks ?? []) {
      flushSync(() => {
        findTarget(root, target)?.click();
      });
    }
    for (const target of current?.focus ?? []) {
      flushSync(() => {
        findTarget(root, target)?.focus();
      });
    }
    onSettled(beat);
  });

  // Hold the frame from the commit that mounts this beat until its replay is done.
  const release = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const done = holdFrame(`Replaying replica beat ${beat}`);
    release.current = done;
    return done;
  }, [beat]);

  // Replay from a passive effect: the replica's components subscribe to their stores in
  // passive effects, which run before this one, so every store change reaches them.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (ref.current !== null && replayed.current !== beat) {
        replayed.current = beat;
        replay(ref.current);
      }
      release.current?.();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [beat]);

  return (
    <div key={beat} ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
};
