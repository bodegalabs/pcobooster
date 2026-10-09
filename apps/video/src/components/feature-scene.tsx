import type { ReactNode } from "react";

import type { Shot } from "../lib/camera";
import { useFeatureLayout } from "../lib/layout";
import { ProductStage } from "../lib/product-stage";
import type { CursorStep, Highlight } from "../lib/product-stage";
import type { Beat } from "../lib/replica";
import { Headline } from "./headline";
import type { Lines } from "./headline";
import { Scene } from "./scene";

/** A caption over the product, the shape of every feature beat. */
export const FeatureScene = ({
  duration,
  lines,
  beats,
  shots,
  cursor,
  highlights,
  revealAt,
  children,
}: {
  duration: number;
  lines: Lines;
  beats: readonly Beat[];
  shots?: readonly Shot[];
  cursor?: readonly CursorStep[];
  highlights?: readonly Highlight[];
  revealAt?: number;
  children: ReactNode;
}) => {
  const layout = useFeatureLayout();

  return (
    <Scene duration={duration}>
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
        <Headline
          lines={lines}
          size={layout.headlineSize}
          at={2}
          style={{ maxWidth: layout.headlineWidth }}
        />
      </div>
      <ProductStage
        beats={beats}
        nativeWidth={layout.nativeWidth}
        nativeHeight={layout.nativeHeight}
        box={layout.product}
        shots={shots}
        cursor={cursor}
        highlights={highlights}
        enterAt={6}
        revealAt={revealAt}
      >
        {children}
      </ProductStage>
    </Scene>
  );
};
