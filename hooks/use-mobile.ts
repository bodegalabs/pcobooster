"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

const MOBILE_QUERY = "(max-width: 767px)";

export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);
