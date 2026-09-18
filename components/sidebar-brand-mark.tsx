"use client";

import { useCallback, useEffect, useId, useRef } from "react";

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

const SidebarRocketLogo = ({ maskId }: { maskId: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="46 42 168 168"
    fill="none"
    aria-hidden
    className="text-chart-2 size-full overflow-visible"
  >
    <defs>
      <mask
        id={`${maskId}-fin-clearance`}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="256"
        height="256"
      >
        <rect
          width="256"
          height="256"
          fill="var(--color-pc-services-foreground)"
        />
        <path
          d="M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z"
          fill="var(--color-overlay-shadow)"
          stroke="var(--color-overlay-shadow)"
          strokeWidth="12"
          strokeLinejoin="round"
        />
      </mask>
      <mask
        id={`${maskId}-rocket-window`}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="256"
        height="256"
      >
        <rect
          width="256"
          height="256"
          fill="var(--color-pc-services-foreground)"
        />
        <circle cx="176" cy="128" r="13" fill="var(--color-overlay-shadow)" />
      </mask>
    </defs>
    <g className="sidebar-brand-rocket-flight">
      <g
        transform="translate(128 128) rotate(-45) scale(1.12) translate(-128 -128)"
        fill="currentColor"
      >
        <g mask={`url(#${maskId}-fin-clearance)`}>
          <path d="M150 104C137 90 127 83 118 82Q112 82 112 89V104Z" />
          <path d="M150 152C137 166 127 173 118 174Q112 174 112 167V152Z" />
        </g>
        <path
          d="M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z"
          mask={`url(#${maskId}-rocket-window)`}
        />
        <g className="sidebar-brand-rocket-exhaust">
          <rect x="71" y="104" width="33" height="12" rx="6" />
          <rect x="65" y="122" width="33" height="12" rx="6" />
          <rect x="71" y="140" width="33" height="12" rx="6" />
          <circle cx="59" cy="110" r="6" />
          <circle cx="53" cy="128" r="6" />
          <circle cx="59" cy="146" r="6" />
        </g>
      </g>
    </g>
  </svg>
);

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
        <SidebarRocketLogo maskId={maskId} />
      </div>
    </div>
  );
};
