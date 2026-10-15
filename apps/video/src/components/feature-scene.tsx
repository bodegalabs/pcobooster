import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";

import type { Shot } from "../lib/camera";
import { useFormat } from "../lib/format";
import { useFeatureLayout } from "../lib/layout";
import { easeInOut, progress } from "../lib/motion";
import { ProductStage } from "../lib/product-stage";
import type { CursorStep, Highlight } from "../lib/product-stage";
import type { Beat } from "../lib/replica";
import { Headline } from "./headline";
import type { Lines } from "./headline";
import { Scene } from "./scene";
import type { Transition } from "./scene";

const CARRY_IN_AT = 3;
const CARRY_FRAMES = 22;
/** How long a handed-off scene's toast and rings take to clear as the camera pulls back. */
const LET_GO_FRAMES = 12;

/**
 * The camera's shots with the scene's joins added. A carried scene opens on the whole
 * window and eases in to its first subject; a wider canvas than the scene it carries on
 * from opens on its top-left corner at the narrower one's scale, so the sidebar and header
 * keep their size across the cut. A scene that hands off eases back out from `handOffAt`,
 * so the camera never jumps between scenes.
 */
const joinedShots = (
  shots: readonly Shot[],
  join: { carry: boolean; widened: number; handOffAt: number | undefined }
): readonly Shot[] => {
  const framed = shots.map((shot, index) =>
    join.carry && index === 0 && shot.at === 0
      ? { ...shot, at: CARRY_IN_AT, duration: CARRY_FRAMES }
      : shot
  );
  const opening =
    join.carry && join.widened > 1
      ? [{ at: 0, zoom: join.widened, duration: 1 }]
      : [];
  const closing =
    join.handOffAt === undefined
      ? []
      : [{ at: join.handOffAt, duration: CARRY_FRAMES }];
  return [...opening, ...framed, ...closing];
};

/**
 * As the camera pulls back to hand off, the moment is over: rings and toasts let go
 * instead of vanishing with the cut.
 */
const LetGo = ({ at, children }: { at: number; children: ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 1 - progress(frame, at, LET_GO_FRAMES, easeInOut),
      }}
    >
      {children}
    </div>
  );
};

const stretched = (height: number, ratio: number | undefined) =>
  ratio === undefined ? undefined : Math.round(height * ratio);

/** One caption of a scene that narrates as it goes, shown from `at` until the next. */
export interface Caption {
  readonly at: number;
  readonly lines: Lines;
}

/** Captions take turns in one spot: each lands fast and clears just before the next. */
const Captions = ({
  captions,
  size,
  width,
  endAt,
}: {
  captions: readonly Caption[];
  size: number;
  width: number;
  /** Where the last caption clears, when the scene ends on a hard edge. */
  endAt?: number;
}) =>
  captions.map((caption, index) => {
    const next = captions[index + 1];
    const exitAt = next === undefined ? endAt : next.at - 4;
    return (
      <div
        key={caption.at}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Headline
          lines={caption.lines}
          size={size}
          at={caption.at}
          pace="caption"
          exitAt={exitAt}
          style={{ maxWidth: width }}
        />
      </div>
    );
  });

/**
 * A caption over the product, the shape of every feature beat. `lines` is one headline
 * for the whole scene; `captions` narrate it step by step. A `cut` scene opens with the
 * product already in place, for hard cuts.
 */
export const FeatureScene = ({
  duration,
  lines,
  captions,
  beats,
  shots,
  cursor,
  highlights,
  revealAt,
  swaps,
  dissolves,
  transition = "soft",
  carry = false,
  handOff = false,
  canvasWidth,
  tallCanvas,
  overlay,
  children,
}: {
  duration: number;
  lines?: Lines;
  captions?: readonly Caption[];
  beats: readonly Beat[];
  shots?: readonly Shot[];
  cursor?: readonly CursorStep[];
  highlights?: readonly Highlight[];
  revealAt?: number;
  /** Frames where the replica changes screen, softened with a brief blur. */
  swaps?: readonly number[];
  /** Beat frames where part of the screen changes in place: crossfade, don't jump. */
  dissolves?: readonly number[];
  transition?: Transition;
  /**
   * Picks up from a product scene before it: the window is already in place and only its
   * contents change, softened like any screen swap, as if the same app moved on.
   */
  carry?: boolean;
  /** The next scene carries the product on: ease back to the whole window to meet it. */
  handOff?: boolean;
  /**
   * In the 4:5 feed, lays the replica out this wide and scales it into the same window,
   * for pages whose columns would otherwise truncate their names.
   */
  canvasWidth?: number;
  /**
   * Lays the replica out this many times taller than its window, so the camera can pan
   * down a long list instead of the window scrolling it out of reach.
   */
  tallCanvas?: number;
  /** Drawn over the product window, outside the camera (a saved toast, say). */
  overlay?: ReactNode;
  children: ReactNode;
}) => {
  const base = useFeatureLayout();
  const format = useFormat();
  const layout =
    // Only the 4:5 feed widens: portrait keeps the phone layout, landscape is already wide.
    canvasWidth === undefined || format !== "feed"
      ? base
      : {
          ...base,
          nativeWidth: canvasWidth,
          nativeHeight: Math.round(
            (base.nativeHeight * canvasWidth) / base.nativeWidth
          ),
        };
  const handOffAt = handOff ? duration - CARRY_FRAMES - 2 : undefined;
  const cameraShots = joinedShots(shots ?? [], {
    carry,
    widened: layout.nativeWidth / base.nativeWidth,
    handOffAt,
  });
  const lastFrame = handOffAt ?? duration;
  const framedHighlights = highlights?.map((entry) => ({
    ...entry,
    to: Math.min(entry.to, lastFrame),
  }));
  // A hard cut or a carried scene arrives with the product already in place.
  const inPlace = carry || transition === "cut";

  return (
    <Scene duration={duration} transition={transition}>
      <div
        style={{
          position: "absolute",
          top: layout.headlineTop,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        {captions === undefined ? (
          <Headline
            lines={lines ?? []}
            size={layout.headlineSize}
            // From the cut: the scene's own fade-in already softens its first frames.
            at={0}
            style={{ maxWidth: layout.headlineWidth }}
          />
        ) : (
          <Captions
            captions={captions}
            size={layout.headlineSize}
            width={layout.headlineWidth}
            endAt={
              transition === "cut" || transition === "soft-in"
                ? duration - 8
                : undefined
            }
          />
        )}
      </div>
      <ProductStage
        beats={beats}
        nativeWidth={layout.nativeWidth}
        nativeHeight={layout.nativeHeight}
        box={layout.product}
        shots={cameraShots}
        cursor={cursor}
        highlights={framedHighlights}
        // A spring that started a second ago has settled: in place from the first frame.
        // Otherwise the window rises right behind the caption, so the cut has no dead air.
        enterAt={inPlace ? -30 : 2}
        revealAt={revealAt}
        canvasHeight={stretched(layout.nativeHeight, tallCanvas)}
        dissolves={dissolves}
        swaps={[
          ...(carry ? [0] : []),
          ...(swaps ?? []),
          // The outgoing screen softens into the cut as the incoming one sharpens out of it.
          ...(handOff ? [duration] : []),
        ]}
      >
        {children}
      </ProductStage>
      {handOffAt === undefined ? (
        overlay
      ) : (
        <LetGo at={handOffAt}>{overlay}</LetGo>
      )}
    </Scene>
  );
};
