"use client";

import { useCallback, useEffect, useId, useRef } from "react";

import { BrandRocketLogo } from "@/components/brand-rocket-logo";
import { useSidebar } from "@/components/ui/sidebar";

const BRAND_ANIMATION_MS = 320;
const ROCKET_REPLAY_MS = 340;

const ROCKET_ANIMATION = {
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

const canPlayRocketHoverAnimation = (): boolean =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
  window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

const clearRocketAnimation = (rocket: HTMLElement): void => {
  for (const { className } of Object.values(ROCKET_ANIMATION)) {
    rocket.classList.remove(className);
  }
};

const playRocketAnimation = (
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

export const SidebarBrandMark = () => {
  const { open } = useSidebar();
  const brandRef = useRef<HTMLDivElement>(null);
  const rocketRef = useRef<HTMLDivElement>(null);
  const skipFirstOpen = useRef(true);
  const hoverCleanupRef = useRef<(() => void) | null>(null);
  const maskId = useId().replaceAll(":", "");

  const handleRocketMouseEnter = useCallback(() => {
    if (!canPlayRocketHoverAnimation()) {
      return;
    }

    hoverCleanupRef.current?.();
    const rocket = rocketRef.current;
    if (rocket) {
      hoverCleanupRef.current = playRocketAnimation(rocket, "replay");
    }
  }, []);

  useEffect(() => {
    let timer: number | undefined;

    if (!skipFirstOpen.current && open && brandRef.current) {
      const text = brandRef.current.querySelector<HTMLElement>(
        "[data-sidebar-brand-text]"
      );
      const rocket = rocketRef.current;

      text?.classList.remove("sidebar-brand-unroll");
      hoverCleanupRef.current?.();
      hoverCleanupRef.current = null;

      if (rocket) {
        clearRocketAnimation(rocket);
      }

      void brandRef.current.offsetWidth;

      text?.classList.add("sidebar-brand-unroll");
      if (rocket) {
        rocket.classList.add(ROCKET_ANIMATION.takeoff.className);
      }

      timer = window.setTimeout(() => {
        text?.classList.remove("sidebar-brand-unroll");
        if (rocket) {
          rocket.classList.remove(ROCKET_ANIMATION.takeoff.className);
        }
      }, BRAND_ANIMATION_MS);
    }

    if (skipFirstOpen.current) {
      skipFirstOpen.current = false;
    }

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [open]);

  useEffect(
    () => () => {
      hoverCleanupRef.current?.();
    },
    []
  );

  return (
    <div ref={brandRef} className="flex min-w-0 items-center gap-2">
      <span data-sidebar-brand-text className="truncate text-base">
        <strong className="font-bold">PCO</strong>Booster
      </span>
      <div
        ref={rocketRef}
        data-sidebar-brand-rocket
        className="size-8 shrink-0 overflow-visible"
        onMouseEnter={handleRocketMouseEnter}
      >
        <BrandRocketLogo maskId={maskId} />
      </div>
    </div>
  );
};
