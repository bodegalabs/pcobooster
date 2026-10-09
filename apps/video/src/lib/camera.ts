import { easeInOut, mix, progress } from "./motion";
import { beatIndexAt } from "./replica";
import type { Beat, Target } from "./replica";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A camera move inside the product window: frame on `target` (or the whole view). */
export interface Shot {
  readonly at: number;
  readonly target?: Target;
  /** Fixed zoom; otherwise the target is fitted with `pad` around it. */
  readonly zoom?: number;
  /** Portrait shots only pan unless they ask for a zoom here. */
  readonly portraitZoom?: number;
  readonly pad?: number;
  readonly duration?: number;
  /** Beat whose layout to frame; defaults to the beat live at `at`. */
  readonly beat?: number;
}

export interface Camera {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

interface View {
  readonly zoom: number;
  readonly focusX: number;
  readonly focusY: number;
}

interface Viewport {
  readonly width: number;
  readonly height: number;
  /** How tall the replica's content runs in the live beat. */
  readonly contentHeight: number;
  readonly portrait: boolean;
}

const MAX_ZOOM = 2.4;
const DEFAULT_PAD = 24;
const DEFAULT_SHOT_FRAMES = 26;

const viewFor = (
  shot: Shot | undefined,
  beats: readonly Beat[],
  viewport: Viewport,
  rectFor: (target: Target, beat: number) => Rect | undefined
): View => {
  const full = {
    zoom: 1,
    focusX: viewport.width / 2,
    focusY: viewport.height / 2,
  };
  const rect =
    shot?.target === undefined
      ? undefined
      : rectFor(shot.target, shot.beat ?? beatIndexAt(beats, shot.at));
  if (shot === undefined || rect === undefined) {
    return full;
  }
  const pad = shot.pad ?? DEFAULT_PAD;
  const fitted = Math.min(
    viewport.width / (rect.width + pad * 2),
    viewport.height / (rect.height + pad * 2)
  );
  return {
    // At phone width the replica already fills the frame edge to edge, and most zooms
    // crop names or buttons off a side; portrait shots pan unless they opt in.
    zoom: viewport.portrait
      ? (shot.portraitZoom ?? 1)
      : Math.min(MAX_ZOOM, Math.max(1, shot.zoom ?? fitted)),
    focusX: rect.x + rect.width / 2,
    focusY: rect.y + rect.height / 2,
  };
};

/**
 * Where the camera is at `frame`: easing from the previous shot to the current one, with
 * the pan clamped so the replica always covers the window.
 */
export const cameraAt = (
  frame: number,
  shots: readonly Shot[],
  beats: readonly Beat[],
  viewport: Viewport,
  rectFor: (target: Target, beat: number) => Rect | undefined
): Camera => {
  const index = shots.findLastIndex((shot) => shot.at <= frame);
  const shot = shots[index];
  const current = viewFor(shot, beats, viewport, rectFor);
  const previous = viewFor(
    index > 0 ? shots[index - 1] : undefined,
    beats,
    viewport,
    rectFor
  );
  const amount =
    shot === undefined
      ? 1
      : progress(
          frame,
          shot.at,
          shot.duration ?? DEFAULT_SHOT_FRAMES,
          easeInOut
        );
  const zoom = mix(previous.zoom, current.zoom, amount);
  const focusX = mix(previous.focusX, current.focusX, amount);
  const focusY = mix(previous.focusY, current.focusY, amount);
  const clampPan = (value: number, size: number, content: number) =>
    Math.min(0, Math.max(size - content * zoom, value));
  return {
    zoom,
    panX: clampPan(
      viewport.width / 2 - focusX * zoom,
      viewport.width,
      viewport.width
    ),
    panY: clampPan(
      viewport.height / 2 - focusY * zoom,
      viewport.height,
      Math.max(viewport.height, viewport.contentHeight)
    ),
  };
};
