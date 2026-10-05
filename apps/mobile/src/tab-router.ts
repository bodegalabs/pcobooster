import { router } from "expo-router";
import type { Href } from "expo-router";

import { withinTab } from "./tab-routing";

export const tabRouter = {
  push: (href: Href): void => {
    router.push(withinTab(href));
  },
  replace: (href: Href): void => {
    router.replace(withinTab(href));
  },
  back: (): void => {
    router.back();
  },
};
