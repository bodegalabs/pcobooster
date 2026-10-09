import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";

import { Cursor } from "../components/cursor";
import { cameraAt } from "./camera";
import type { Rect, Shot } from "./camera";
import { fontsReady } from "./fonts";
import { FPS, useFormat } from "./format";
import { mix, progress, settle } from "./motion";
import { ScriptedReplica, beatIndexAt, findTarget, targetKey } from "./replica";
import type { Beat, Target } from "./replica";

import styles from "../../../marketing/src/components/product-demo/product-demo.module.css";

export interface CursorStep {
  readonly at: number;
  readonly target: Target;
  readonly click?: boolean;
  /** Frames spent travelling from the previous point, ending at `at`. */
  readonly travel?: number;
  /** Where inside the target to land, as fractions of its box. */
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly beat?: number;
}

export interface Highlight {
  readonly from: number;
  readonly to: number;
  readonly target: Target;
  readonly beat?: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  /** On-screen width; height follows from the native aspect. */
  readonly width: number;
}

const DEFAULT_TRAVEL = 20;
const CARD_RADIUS = 28;
const MS_PER_FRAME = 1000 / FPS;
const RING = 6;
const NO_SHOTS: readonly Shot[] = [];
const NO_STEPS: readonly CursorStep[] = [];
const NO_HIGHLIGHTS: readonly Highlight[] = [];

interface BeatLayout {
  readonly rects: Readonly<Record<string, Rect>>;
  /** How tall the replica's content runs, so the camera can pan down past the window. */
  readonly contentHeight: number;
}

const measureAll = (
  root: HTMLElement,
  targets: readonly Target[]
): BeatLayout => {
  const rootRect = root.getBoundingClientRect();
  const scale = rootRect.width / root.offsetWidth;
  const rects: Record<string, Rect> = {};
  for (const target of targets) {
    const element = findTarget(root, target);
    if (element !== null) {
      const rect = element.getBoundingClientRect();
      rects[targetKey(target)] = {
        x: (rect.left - rootRect.left) / scale,
        y: (rect.top - rootRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    }
  }
  return { rects, contentHeight: root.scrollHeight };
};

/** Brand rings around parts of the replica while they matter. */
const Highlights = ({
  frame,
  highlights,
  beats,
  rectFor,
}: {
  frame: number;
  highlights: readonly Highlight[];
  beats: readonly Beat[];
  rectFor: (target: Target, beat: number) => Rect | undefined;
}) =>
  highlights.map((entry) => {
    const rect = rectFor(
      entry.target,
      entry.beat ?? beatIndexAt(beats, entry.from)
    );
    if (rect === undefined) {
      return null;
    }
    const shown =
      progress(frame, entry.from, 10) * (1 - progress(frame, entry.to, 10));
    return (
      <div
        key={`${targetKey(entry.target)}-${entry.from}`}
        style={{
          position: "absolute",
          left: rect.x - RING,
          top: rect.y - RING,
          width: rect.width + RING * 2,
          height: rect.height + RING * 2,
          borderRadius: 12,
          border: "2px solid var(--brand)",
          boxShadow:
            "0 0 0 6px color-mix(in oklch, var(--brand) 16%, transparent)",
          opacity: shown,
          transform: `scale(${mix(1.06, 1, shown)})`,
          pointerEvents: "none",
        }}
      />
    );
  });

/**
 * The product replica in a lifted white card, driven by a script of beats, with a camera
 * that frames parts of it and a cursor that clicks through it.
 *
 * On mount it renders each beat once and measures every target, so the camera and cursor
 * know where things are in any beat before the first frame is captured.
 */
export const ProductStage = ({
  beats,
  nativeWidth,
  nativeHeight,
  box,
  shots = NO_SHOTS,
  cursor = NO_STEPS,
  highlights = NO_HIGHLIGHTS,
  enterAt = 0,
  revealAt,
  children,
}: {
  beats: readonly Beat[];
  nativeWidth: number;
  nativeHeight: number;
  box: Box;
  shots?: readonly Shot[];
  cursor?: readonly CursorStep[];
  highlights?: readonly Highlight[];
  enterAt?: number;
  /** Frame the history bars start growing in, as they do on the site. */
  revealAt?: number;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const portrait = useFormat() === "portrait";
  const rootRef = useRef<HTMLDivElement>(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [calibrating, setCalibrating] = useState(0);
  const [measurements, setMeasurements] = useState<
    readonly BeatLayout[] | null
  >(null);
  const partial = useRef<BeatLayout[]>([]);
  const calibrated = measurements !== null;

  const targets = useMemo(() => {
    const all = [
      ...shots.flatMap((shot) =>
        shot.target === undefined ? [] : [shot.target]
      ),
      ...cursor.map((step) => step.target),
      ...highlights.map((entry) => entry.target),
    ];
    return [
      ...new Map(all.map((target) => [targetKey(target), target])).values(),
    ];
  }, [shots, cursor, highlights]);

  // Hold every frame until each beat has been measured. Registered while rendering, as
  // Remotion asks, so no frame can be captured before the hold exists.
  // oxlint-disable-next-line react/hook-use-state -- the handle never changes; it only needs to exist before the first capture
  const [hold] = useState(() => delayRender("Measuring the replica"));
  useEffect(
    () => () => {
      continueRender(hold);
    },
    [hold]
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      await fontsReady();
      if (live) {
        setFontsLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const onSettled = (settledBeat: number) => {
    const root = rootRef.current;
    if (calibrated || settledBeat !== calibrating || root === null) {
      return;
    }
    partial.current[settledBeat] = measureAll(root, targets);
    if (settledBeat + 1 < beats.length) {
      setCalibrating(settledBeat + 1);
    } else {
      setMeasurements([...partial.current]);
      continueRender(hold);
    }
  };

  const liveBeat = beatIndexAt(beats, frame);
  const rectFor = (target: Target, beat: number): Rect | undefined =>
    measurements?.[beat]?.rects[targetKey(target)];
  const camera = cameraAt(
    frame,
    shots,
    beats,
    {
      width: nativeWidth,
      height: nativeHeight,
      contentHeight: measurements?.[liveBeat]?.contentHeight ?? nativeHeight,
      portrait,
    },
    rectFor
  );
  const points = cursor.map((step) => {
    const rect = rectFor(
      step.target,
      step.beat ?? beatIndexAt(beats, step.at - 1)
    );
    const anchor = step.anchor ?? { x: 0.5, y: 0.5 };
    return rect === undefined
      ? null
      : {
          x: rect.x + rect.width * anchor.x,
          y: rect.y + rect.height * anchor.y,
        };
  });

  const fit = box.width / nativeWidth;
  const enter = settle(frame, enterAt, 30);
  const replicaStyle: CSSProperties & { "--reveal-ms"?: number } = {
    position: "relative",
    width: nativeWidth,
    height: nativeHeight,
    "--reveal-ms":
      revealAt === undefined || !calibrated
        ? undefined
        : Math.max(0, (frame - revealAt) * MS_PER_FRAME),
  };

  return (
    <div
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: nativeWidth * fit,
        height: nativeHeight * fit,
        borderRadius: CARD_RADIUS,
        overflow: "hidden",
        background: "white",
        boxShadow: "var(--shadow-frame)",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 80}px) scale(${mix(0.94, 1, enter)})`,
      }}
    >
      <style>
        {`.${styles.demo}:not(.${styles.embedded}){height:${nativeHeight}px}` +
          `.${styles["sample-badge"]}{display:none !important}`}
      </style>
      <div
        style={{
          width: nativeWidth,
          height: nativeHeight,
          transform: `scale(${fit})`,
          transformOrigin: "0 0",
        }}
      >
        <div
          style={{
            position: "relative",
            width: nativeWidth,
            height: nativeHeight,
            transform: `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <div
            ref={rootRef}
            data-replica=""
            data-reveal-wave={revealAt === undefined ? undefined : ""}
            style={replicaStyle}
          >
            {fontsLoaded ? (
              <ScriptedReplica
                beats={beats}
                beat={calibrated ? liveBeat : calibrating}
                onSettled={onSettled}
              >
                {children}
              </ScriptedReplica>
            ) : null}
          </div>
          {calibrated ? (
            <Highlights
              frame={frame}
              highlights={highlights}
              beats={beats}
              rectFor={rectFor}
            />
          ) : null}
          {calibrated && cursor.length > 0 ? (
            <Cursor
              frame={frame}
              steps={cursor.map((step) => ({
                at: step.at,
                travel: step.travel ?? DEFAULT_TRAVEL,
                click: step.click ?? false,
              }))}
              points={points}
              zoom={camera.zoom}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
