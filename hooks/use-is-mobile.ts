"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

const MOBILE_MAX_WIDTH_PX = 639;

export const useIsMobile = () =>
  useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
