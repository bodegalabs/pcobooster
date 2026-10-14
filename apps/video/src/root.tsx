import "@pcobooster/design-tokens/tokens.css";
import "./theme.css";
import { useLayoutEffect } from "react";
import {
  Composition,
  Folder,
  cancelRender,
  continueRender,
  delayRender,
} from "remotion";

import { CUT_IDS, Cut, FEED_CUT_IDS, cutDuration } from "./cuts";
import type { CutId } from "./cuts";
import { fontsReady } from "./lib/fonts";
import { FORMATS, FORMAT_IDS, FPS } from "./lib/format";

const FORMAT_NAMES = {
  landscape: { folder: "Landscape-16x9", suffix: "16x9" },
  portrait: { folder: "Portrait-9x16", suffix: "9x16" },
  feed: { folder: "Feed-4x5", suffix: "4x5" },
} as const;

const CUTS_BY_FORMAT = {
  landscape: CUT_IDS,
  portrait: CUT_IDS,
  feed: FEED_CUT_IDS,
} as const;

/** Holds the first frame until Inter has loaded, so no frame renders in a fallback font. */
const WithFonts = ({ cut }: { cut: CutId }) => {
  useLayoutEffect(() => {
    const handle = delayRender("Loading Inter");
    void (async () => {
      try {
        await fontsReady();
        continueRender(handle);
      } catch (error) {
        cancelRender(error);
      }
    })();
  }, []);
  return <Cut cut={cut} />;
};

export const RemotionRoot = () => (
  <>
    {FORMAT_IDS.map((format) => (
      <Folder key={format} name={FORMAT_NAMES[format].folder}>
        {CUTS_BY_FORMAT[format].map((cut) => (
          <Composition
            key={cut}
            id={`${cut}-${FORMAT_NAMES[format].suffix}`}
            component={WithFonts}
            defaultProps={{ cut }}
            durationInFrames={cutDuration(cut)}
            fps={FPS}
            width={FORMATS[format].width}
            height={FORMATS[format].height}
          />
        ))}
      </Folder>
    ))}
  </>
);
