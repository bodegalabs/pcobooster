import { useVideoConfig } from "remotion";

/**
 * Every cut renders natively in each shape it is registered for; scenes lay themselves
 * out per format. `feed` is the 4:5 shape LinkedIn and Instagram feeds show largest.
 */
export const FORMAT_IDS = ["landscape", "portrait", "feed"] as const;
export type Format = (typeof FORMAT_IDS)[number];

export const FPS = 30;

export const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
} as const satisfies Record<Format, { width: number; height: number }>;

export const useFormat = (): Format => {
  const { width, height } = useVideoConfig();
  if (width >= height) {
    return "landscape";
  }
  return height / width > 1.5 ? "portrait" : "feed";
};

/** Picks a value per format, so layout numbers sit side by side at the call site. */
export const useByFormat = <T>(values: Record<Format, T>): T =>
  values[useFormat()];

/**
 * Portrait feeds (Reels, TikTok, Shorts) cover roughly the top 14% and bottom 24% with
 * their own UI, so text and product stay inside this band.
 */
export const PORTRAIT_SAFE = { top: 270, bottom: 1460 } as const;

export const seconds = (count: number): number => Math.round(count * FPS);
