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
  // Aim where the camera can actually go: a focus the clamp would move is pulled in here,
  // so moves between shots never run into the edge and stop short.
  const fitted = Math.min(
    viewport.width / (rect.width + pad * 2),
    viewport.height / (rect.height + pad * 2)
  );
  // At phone width the replica already fills the frame edge to edge, and most zooms
  // crop names or buttons off a side; portrait shots pan unless they opt in.
  const zoom = viewport.portrait
    ? (shot.portraitZoom ?? 1)
    : Math.min(MAX_ZOOM, Math.max(1, shot.zoom ?? fitted));
  const within = (value: number, size: number, content: number) =>
    Math.min(Math.max(value, size / (2 * zoom)), content - size / (2 * zoom));
  return {
    zoom,
    focusX: within(rect.x + rect.width / 2, viewport.width, viewport.width),
    focusY: within(
      rect.y + rect.height / 2,
      viewport.height,
      Math.max(viewport.height, viewport.contentHeight)
    ),
  };
};

const lerpView = (from: View, to: View, amount: number): View => ({
  zoom: mix(from.zoom, to.zoom, amount),
  focusX: mix(from.focusX, to.focusX, amount),
  focusY: mix(from.focusY, to.focusY, amount),
});

/**
 * Where the camera is at `frame`. Each shot eases from wherever the camera actually is
 * when the shot starts, so a shot that begins before the last one has settled carries on
 * from mid-move instead of snapping to that move's end. The pan is clamped so the replica
 * always covers the window.
 */
export const cameraAt = (
  frame: number,
  shots: readonly Shot[],
  beats: readonly Beat[],
  viewport: Viewport,
  rectFor: (target: Target, beat: number) => Rect | undefined
): Camera => {
  let view = viewFor(undefined, beats, viewport, rectFor);
  for (const [index, shot] of shots.entries()) {
    if (shot.at > frame) {
      break;
    }
    const next = shots[index + 1];
    // Ease toward this shot until the frame, or until the next shot takes over.
    const until = next === undefined ? frame : Math.min(frame, next.at);
    const amount = progress(
      until,
      shot.at,
      shot.duration ?? DEFAULT_SHOT_FRAMES,
      easeInOut
    );
    view = lerpView(view, viewFor(shot, beats, viewport, rectFor), amount);
  }
  const { zoom, focusX, focusY } = view;
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
