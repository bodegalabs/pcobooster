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
}: {
  captions: readonly Caption[];
  size: number;
  width: number;
}) =>
  captions.map((caption, index) => {
    const next = captions[index + 1];
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
          exitAt={next === undefined ? undefined : next.at - 6}
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
  transition = "soft",
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
  transition?: Transition;
  /** Drawn over the product window, outside the camera (a saved toast, say). */
  overlay?: ReactNode;
  children: ReactNode;
}) => {
  const layout = useFeatureLayout();
  const cut = transition === "cut";

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
          />
        )}
      </div>
      <ProductStage
        beats={beats}
        nativeWidth={layout.nativeWidth}
        nativeHeight={layout.nativeHeight}
        box={layout.product}
        shots={shots}
        cursor={cursor}
        highlights={highlights}
        // A spring that started a second ago has settled: in place from the first frame.
        enterAt={cut ? -30 : 6}
        revealAt={revealAt}
      >
        {children}
      </ProductStage>
      {overlay}
    </Scene>
  );
};
