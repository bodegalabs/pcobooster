import type { UpdateStore } from "@pcobooster/api/modules/mobile-updates/update-store";
import { Effect } from "effect";

/** An update bucket with nothing published, for servers whose tests do not exercise updates. */
export const emptyUpdateStore: UpdateStore = {
  readText: () => Effect.succeed(null),
  readAsset: () => Effect.succeed(null),
};
