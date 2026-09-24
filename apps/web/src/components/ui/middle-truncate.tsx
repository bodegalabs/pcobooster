import {
  clearCache,
  measureNaturalWidth,
  prepareWithSegments,
} from "@chenglou/pretext";
import { useLayoutEffect, useRef, useState } from "react";

import { middleTruncate } from "@/lib/middle-truncate";
import type { MeasureText } from "@/lib/middle-truncate";

let fontsSettled: Promise<void> | null = null;

/**
 * Pretext caches glyph widths per font string, so widths measured with a
 * fallback font before the web font loads must be dropped once it arrives.
 */
const settleFonts = async (): Promise<void> => {
  await document.fonts.ready;
  clearCache();
};

const pixelLetterSpacing = (value: string): number =>
  value.endsWith("px") ? Number(value.slice(0, -2)) : 0;

const createMeasure = (element: HTMLElement): MeasureText => {
  const style = getComputedStyle(element);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const letterSpacing = pixelLetterSpacing(style.letterSpacing);
  return (text) =>
    measureNaturalWidth(prepareWithSegments(text, font, { letterSpacing }));
};

/** Re-fits `text` whenever the container resizes or web fonts finish loading. */
const observeFit = (
  container: HTMLElement,
  text: string,
  onFit: (fit: { text: string; display: string }) => void
): (() => void) => {
  let active = true;
  let frame = 0;
  const fit = () => {
    const { width } = container.getBoundingClientRect();
    // The hidden full-text span is the DOM's own measurement; trust it for the
    // "fits" case so sub-pixel rounding never shortens text that fits.
    const fullWidth =
      container.firstElementChild?.getBoundingClientRect().width ?? width;
    onFit({
      text,
      display:
        fullWidth <= width
          ? text
          : middleTruncate(text, width, createMeasure(container)),
    });
  };

  fit();
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });
  observer.observe(container);
  void (async () => {
    fontsSettled ??= settleFonts();
    await fontsSettled;
    if (active) {
      fit();
    }
  })();

  return () => {
    active = false;
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
};

/**
 * Single-line text that shortens from the middle ("Camera 2 Mid… PM") so the
 * distinguishing ending stays visible. It inherits typography from its parent,
 * fills the width CSS `truncate` would, measures with Pretext instead of DOM
 * reflow, and shows plain end truncation until it has measured.
 */
const MiddleTruncate = ({ text }: { text: string }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ text: string; display: string } | null>(
    null
  );
  // A fit measured for older text is stale; fall back to CSS truncation.
  const display = fit?.text === text ? fit.display : text;

  useLayoutEffect(() => {
    const container = containerRef.current;
    return container ? observeFit(container, text, setFit) : undefined;
  }, [text]);

  return (
    <span
      ref={containerRef}
      data-slot="middle-truncate"
      title={display === text ? undefined : text}
      className="relative block min-w-0 truncate"
    >
      {/* Reserves the width and height CSS truncation would take. */}
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0 truncate">
        {display}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
};

export { MiddleTruncate };
