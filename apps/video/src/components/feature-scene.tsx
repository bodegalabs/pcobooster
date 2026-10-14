import type { ReactNode } from "react";

import type { Shot } from "../lib/camera";
import { useFeatureLayout } from "../lib/layout";
import { ProductStage } from "../lib/product-stage";
import type { CursorStep, Highlight } from "../lib/product-stage";
import type { Beat } from "../lib/replica";
import { Headline } from "./headline";
import type { Lines } from "./headline";
import { Scene } from "./scene";
import type { Transition } from "./scene";

const CARRY_IN_AT = 3;
const CARRY_FRAMES = 22;

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
  transition = "soft",
  carry = false,
  handOff = false,
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
  transition?: Transition;
  /**
   * Picks up from a product scene before it: the window is already in place and only its
   * contents change, softened like any screen swap, as if the same app moved on.
   */
  carry?: boolean;
  /** The next scene carries the product on: ease back to the whole window to meet it. */
  handOff?: boolean;
  /** Drawn over the product window, outside the camera (a saved toast, say). */
  overlay?: ReactNode;
  children: ReactNode;
}) => {
  const layout = useFeatureLayout();
  // A carried scene opens on the whole window and eases in to its first subject; a scene
  // that hands off eases back out, so the camera never jumps between scenes.
  const framed = (shots ?? []).map((shot, index) =>
    carry && index === 0 && shot.at === 0
      ? { ...shot, at: CARRY_IN_AT, duration: CARRY_FRAMES }
      : shot
  );
  const cameraShots = handOff
    ? [...framed, { at: duration - CARRY_FRAMES - 2, duration: CARRY_FRAMES }]
    : framed;
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
            at={2}
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
        highlights={highlights}
        // A spring that started a second ago has settled: in place from the first frame.
        enterAt={inPlace ? -30 : 6}
        revealAt={revealAt}
        swaps={[
          ...(carry ? [0] : []),
          ...(swaps ?? []),
          // The outgoing screen softens into the cut as the incoming one sharpens out of it.
          ...(handOff ? [duration] : []),
        ]}
      >
        {children}
      </ProductStage>
      {overlay}
    </Scene>
  );
};
