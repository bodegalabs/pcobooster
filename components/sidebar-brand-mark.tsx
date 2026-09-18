"use client";

import { useEffect, useId, useRef } from "react";

import { useSidebar } from "@/components/ui/sidebar";

const BRAND_ANIMATION_MS = 320;

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
  const skipFirstOpen = useRef(true);
  const maskId = useId().replaceAll(":", "");

  useEffect(() => {
    let timer: number | undefined;

    if (!skipFirstOpen.current && open && brandRef.current) {
      const text = brandRef.current.querySelector<HTMLElement>(
        "[data-sidebar-brand-text]"
      );
      const rocket = brandRef.current.querySelector<HTMLElement>(
        "[data-sidebar-brand-rocket]"
      );

      for (const element of [text, rocket]) {
        element?.classList.remove(
          "sidebar-brand-unroll",
          "sidebar-brand-rocket-takeoff"
        );
      }

      void brandRef.current.offsetWidth;

      text?.classList.add("sidebar-brand-unroll");
      rocket?.classList.add("sidebar-brand-rocket-takeoff");

      timer = window.setTimeout(() => {
        text?.classList.remove("sidebar-brand-unroll");
        rocket?.classList.remove("sidebar-brand-rocket-takeoff");
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

  return (
    <div ref={brandRef} className="flex min-w-0 items-center gap-2">
      <span data-sidebar-brand-text className="truncate text-base">
        <strong className="font-bold">PCO</strong>Booster
      </span>
      <div
        data-sidebar-brand-rocket
        className="size-8 shrink-0 overflow-visible"
      >
        <SidebarRocketLogo maskId={maskId} />
      </div>
    </div>
  );
};
