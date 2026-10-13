import { useEffect, useState } from "react";
import type { RefObject } from "react";

const observeEarlierPlansIntent = (
  scroller: HTMLDivElement,
  onEarlierIntent: () => void
): (() => void) => {
  const position = () =>
    getComputedStyle(scroller).overflowY === "auto"
      ? scroller.scrollTop
      : window.scrollY;
  let previousPosition = position();
  let touchY: number | null = null;
  const reveal = () => {
    if (position() <= 48) {
      onEarlierIntent();
    }
  };
  const onScroll = () => {
    const current = position();
    if (current < previousPosition) {
      reveal();
    }
    previousPosition = current;
  };
  // Scroll events cannot report attempts to scroll past the top edge.
  const onWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) {
      reveal();
    }
  };
  const onTouchStart = (event: TouchEvent) => {
    touchY = event.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (event: TouchEvent) => {
    const current = event.touches[0]?.clientY;
    if (current !== undefined && touchY !== null && current > touchY) {
      reveal();
    }
    touchY = current ?? null;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const { target } = event;
    if (
      !(target instanceof HTMLElement) ||
      target.closest("input, textarea, select, [contenteditable]")
    ) {
      return;
    }
    if (
      !scroller.contains(target) &&
      target !== document.body &&
      target !== document.documentElement
    ) {
      return;
    }
    if (
      event.key === "ArrowUp" ||
      event.key === "PageUp" ||
      event.key === "Home" ||
      (event.key === " " && event.shiftKey)
    ) {
      reveal();
    }
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("wheel", onWheel, { passive: true });
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  return () => {
    scroller.removeEventListener("scroll", onScroll);
    window.removeEventListener("scroll", onScroll);
    scroller.removeEventListener("wheel", onWheel);
    scroller.removeEventListener("touchstart", onTouchStart);
    scroller.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("keydown", onKeyDown);
  };
};

/** Reveal history only when someone scrolls upward near the start of the agenda. */
export const useEarlierPlansIntent = (
  scrollRef: RefObject<HTMLDivElement | null>
): boolean => {
  const [showEarlier, setShowEarlier] = useState(false);
  useEffect(() => {
    const scroller = scrollRef.current;
    const cleanup =
      scroller === null
        ? null
        : observeEarlierPlansIntent(scroller, () => {
            setShowEarlier(true);
          });
    return () => cleanup?.();
  }, [scrollRef, setShowEarlier]);
  return showEarlier;
};
