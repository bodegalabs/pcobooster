import { useEffect, useId, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Mask,
  Path,
  Rect,
} from "react-native-svg";

import { resolvedTokenColor, useColorVariant } from "../design/colors";
import type { ColorTokenName } from "../design/colors";
import { playHaptic } from "../design/haptics";
import { CssCurves } from "../design/motion";
import { Motion } from "../design/motion-tokens";
import { replayPose, restPose, takeoffPose } from "../design/rocket-pose";
import type { RocketPose } from "../design/rocket-pose";

/** The canvas is larger than the mark so the flight and exhaust can travel past its frame. */
const OVERFLOW = 1.5;
/** The logo's viewBox is 168 units square at (46, 42) in a 256-unit space. */
const VIEWBOX_SIZE = 168;
const VIEWBOX_X = 46;
const VIEWBOX_Y = 42;
const LAUNCH_TRAVEL = 0.7;
const LAUNCH_SCALE = 0.9;

const HULL =
  "M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z";
const FIN_TOP = "M150 104C137 90 127 83 118 82Q112 82 112 89V104Z";
const FIN_BOTTOM = "M150 152C137 166 127 173 118 174Q112 174 112 167V152Z";
const TRAILS = [
  { x: 71, y: 104, width: 33, height: 12 },
  { x: 65, y: 122, width: 33, height: 12 },
  { x: 71, y: 140, width: 33, height: 12 },
] as const;
const DOTS = [
  { x: 59, y: 110, travel: 10, startScale: 0.3 },
  { x: 53, y: 128, travel: 13, startScale: 0.25 },
  { x: 59, y: 146, travel: 16, startScale: 0.2 },
] as const;
const DOT_RADIUS = 6;
const EXHAUST_LEFT = 47;
const EXHAUST_RIGHT = 104;
const EXHAUST_TUCK = 7;
const TRAIL_TUCK = 9;
const EXHAUST_MIN_WIDTH = 0.3;
const TRAIL_MIN_LENGTH = 0.25;

/** Draws one pose with the logo's transforms: flight offset, then -45 degrees and 1.12x about (128, 128). */
const RocketDrawing = ({
  pose,
  tint,
  size,
  id,
}: {
  pose: RocketPose;
  tint: string;
  size: number;
  id: string;
}) => {
  const canvas = size * OVERFLOW;
  const inset = (VIEWBOX_SIZE * (OVERFLOW - 1)) / 2;
  const reveal = pose.exhaust;
  return (
    <Svg
      height={canvas}
      style={{
        left: (size - canvas) / 2,
        position: "absolute",
        top: (size - canvas) / 2,
      }}
      viewBox={`${VIEWBOX_X - inset} ${VIEWBOX_Y - inset} ${VIEWBOX_SIZE * OVERFLOW} ${VIEWBOX_SIZE * OVERFLOW}`}
      width={canvas}
    >
      <Defs>
        <Mask
          height={256}
          id={`${id}-fins`}
          maskUnits="userSpaceOnUse"
          width={256}
          x={0}
          y={0}
        >
          <Rect fill="white" height={256} width={256} />
          <Path
            d={HULL}
            fill="black"
            stroke="black"
            strokeLinejoin="round"
            strokeWidth={12}
          />
        </Mask>
        <Mask
          height={256}
          id={`${id}-window`}
          maskUnits="userSpaceOnUse"
          width={256}
          x={0}
          y={0}
        >
          <Rect fill="white" height={256} width={256} />
          <Circle cx={176} cy={128} fill="black" r={13} />
        </Mask>
        <ClipPath id={`${id}-exhaust`}>
          <Rect
            height={256}
            width={256}
            x={EXHAUST_LEFT + (1 - reveal) * (EXHAUST_RIGHT - EXHAUST_LEFT)}
            y={0}
          />
        </ClipPath>
      </Defs>
      <G
        opacity={pose.opacity}
        transform={`translate(${pose.flight} ${-pose.flight})`}
      >
        <G
          fill={tint}
          transform="translate(128 128) rotate(-45) scale(1.12) translate(-128 -128)"
        >
          <G mask={`url(#${id}-fins)`}>
            <Path d={FIN_TOP} />
            <Path d={FIN_BOTTOM} />
          </G>
          <Path d={HULL} mask={`url(#${id}-window)`} />
          {reveal > 0 ? (
            <G clipPath={`url(#${id}-exhaust)`}>
              <G
                transform={`translate(${(1 - reveal) * EXHAUST_TUCK * Math.SQRT2 + EXHAUST_RIGHT} 128) scale(${EXHAUST_MIN_WIDTH + (1 - EXHAUST_MIN_WIDTH) * reveal} 1) translate(${-EXHAUST_RIGHT} -128)`}
              >
                {TRAILS.map((trail, index) => {
                  const progress = pose.trails[index] ?? 0;
                  const maxX = trail.x + trail.width;
                  const midY = trail.y + trail.height / 2;
                  return progress > 0 ? (
                    <Rect
                      height={trail.height}
                      key={trail.y}
                      opacity={progress}
                      rx={trail.height / 2}
                      transform={`translate(${(1 - progress) * TRAIL_TUCK * Math.SQRT2 + maxX} ${midY}) scale(${TRAIL_MIN_LENGTH + (1 - TRAIL_MIN_LENGTH) * progress} 1) translate(${-maxX} ${-midY})`}
                      width={trail.width}
                      x={trail.x}
                      y={trail.y}
                    />
                  ) : null;
                })}
                {DOTS.map((dot, index) => {
                  const progress = pose.dots[index] ?? 0;
                  const scale =
                    dot.startScale + (1 - dot.startScale) * progress;
                  return progress > 0 ? (
                    <Circle
                      cx={0}
                      cy={0}
                      key={dot.y}
                      opacity={progress}
                      r={DOT_RADIUS}
                      transform={`translate(${dot.x + (1 - progress) * dot.travel * Math.SQRT2} ${dot.y}) scale(${scale})`}
                    />
                  ) : null;
                })}
              </G>
            </G>
          ) : null}
        </G>
      </G>
    </Svg>
  );
};

interface Flight {
  readonly mode: "takeoff" | "replay";
  /** Bumped for every new flight, so a replay mid-flight restarts the frame loop. */
  readonly serial: number;
}

interface RocketMarkProps {
  readonly size?: number;
  readonly playsTakeoffOnAppear?: boolean;
  /** Set before presenting Planning Center sign-in: the rocket flies off up-right and fades. */
  readonly isLaunching?: boolean;
  readonly replaysOnTap?: boolean;
  /** Changing this replays the takeoff (after an account switch, for example). */
  readonly takeoffTrigger?: number;
  /** A color token; SVG fills take a resolved color, so it follows the appearance here. */
  readonly tint?: ColorTokenName;
  /** Draw one fixed pose (gallery filmstrips). */
  readonly pose?: RocketPose;
}

/**
 * Calls `onFrame` with the milliseconds since the first frame on every display frame until
 * `duration` passes, then `onEnd`. Returns a cancel function.
 */
const runFrames = (
  duration: number,
  onFrame: (elapsed: number) => void,
  onEnd: () => void
): (() => void) => {
  let frame = 0;
  const begin = (first: number) => {
    const tick = (timestamp: number) => {
      const elapsed = timestamp - first;
      onFrame(elapsed);
      if (elapsed < duration) {
        frame = requestAnimationFrame(tick);
      } else {
        onEnd();
      }
    };
    tick(first);
  };
  frame = requestAnimationFrame(begin);
  return () => {
    cancelAnimationFrame(frame);
  };
};

const SVG_ID_UNSAFE = /[^\w-]/gu;

/**
 * The pcobooster rocket, drawn from the logo's geometry (`apps/web/public/icon.svg`) so its parts
 * move like the web mark: takeoff (320 ms, snappy), replay on tap (340 ms, glide), and
 * launch-away (420 ms ease-in). Reduce Motion skips takeoff and replay and turns launch-away into
 * a fade. Decorative for VoiceOver.
 */
export const RocketMark = ({
  size = 32,
  playsTakeoffOnAppear = false,
  isLaunching = false,
  replaysOnTap = false,
  takeoffTrigger = 0,
  tint = "brandRocket",
  pose: fixedPose,
}: RocketMarkProps) => {
  const reduceMotion = useReducedMotion();
  const fill = resolvedTokenColor(tint, useColorVariant());
  const id = `rocket${useId().replace(SVG_ID_UNSAFE, "")}`;
  const [flight, setFlight] = useState<Flight | null>(
    playsTakeoffOnAppear && !reduceMotion
      ? { mode: "takeoff", serial: 0 }
      : null
  );
  const [elapsed, setElapsed] = useState(0);
  const [seenTrigger, setSeenTrigger] = useState(takeoffTrigger);
  const [wasLaunching, setWasLaunching] = useState(isLaunching);

  const fly = (mode: Flight["mode"]) => {
    if (!reduceMotion) {
      setElapsed(0);
      setFlight((previous) => ({ mode, serial: (previous?.serial ?? 0) + 1 }));
    }
  };

  // A new trigger takes off again; so does coming back from a launch (sign-in cancelled)
  // rather than fading in place. Both adjust state while rendering, from the props that changed.
  if (seenTrigger !== takeoffTrigger) {
    setSeenTrigger(takeoffTrigger);
    fly("takeoff");
  }
  if (wasLaunching !== isLaunching) {
    setWasLaunching(isLaunching);
    if (wasLaunching) {
      fly("takeoff");
    }
  }

  // The frame loop is the external system: each frame reports how far into the flight it is.
  useEffect(() => {
    const cancel =
      flight === null
        ? null
        : runFrames(
            flight.mode === "takeoff"
              ? Motion.rocketTakeoff
              : Motion.rocketReplay,
            setElapsed,
            () => {
              setFlight(null);
            }
          );
    return () => {
      cancel?.();
    };
  }, [flight]);

  const pose = (() => {
    if (fixedPose !== undefined) {
      return fixedPose;
    }
    if (flight === null) {
      return restPose;
    }
    return flight.mode === "takeoff"
      ? takeoffPose(elapsed)
      : replayPose(elapsed);
  })();

  const launchMoves = isLaunching && !reduceMotion;
  const drawing = (
    <Animated.View
      style={{
        height: size,
        opacity: isLaunching ? 0 : 1,
        transform: [
          { translateX: launchMoves ? size * LAUNCH_TRAVEL : 0 },
          { translateY: launchMoves ? -size * LAUNCH_TRAVEL : 0 },
          { scale: launchMoves ? LAUNCH_SCALE : 1 },
        ],
        transitionDuration: isLaunching ? Motion.rocketLaunch : Motion.reveal,
        transitionProperty: ["opacity", "transform"],
        transitionTimingFunction: isLaunching
          ? CssCurves.launch
          : CssCurves.snappy,
        width: size,
      }}
    >
      <RocketDrawing id={id} pose={pose} size={size} tint={fill} />
    </Animated.View>
  );

  if (!replaysOnTap) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {drawing}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={() => {
        playHaptic("tap");
        fly("replay");
      }}
    >
      {drawing}
    </Pressable>
  );
};
