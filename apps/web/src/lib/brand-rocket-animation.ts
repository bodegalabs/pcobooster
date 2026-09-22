/** Class-driven rocket animations shared by the sidebar and sign-in brand marks. */
export const BRAND_ANIMATION_MS = 320;
const ROCKET_REPLAY_MS = 340;

export const ROCKET_ANIMATION = {
  takeoff: {
    className: "sidebar-brand-rocket-takeoff",
    durationMs: BRAND_ANIMATION_MS,
  },
  replay: {
    className: "sidebar-brand-rocket-replay",
    durationMs: ROCKET_REPLAY_MS,
  },
} as const;

type RocketAnimationMode = keyof typeof ROCKET_ANIMATION;

export const canPlayRocketHoverAnimation = (): boolean =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
  window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

export const clearRocketAnimation = (rocket: HTMLElement): void => {
  for (const { className } of Object.values(ROCKET_ANIMATION)) {
    rocket.classList.remove(className);
  }
};

export const playRocketAnimation = (
  rocket: HTMLElement,
  mode: RocketAnimationMode
): (() => void) => {
  const { className, durationMs } = ROCKET_ANIMATION[mode];

  clearRocketAnimation(rocket);
  void rocket.offsetWidth;
  rocket.classList.add(className);

  const timer = window.setTimeout(() => {
    rocket.classList.remove(className);
  }, durationMs);

  return () => {
    window.clearTimeout(timer);
  };
};
