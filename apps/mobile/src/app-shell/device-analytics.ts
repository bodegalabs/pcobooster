import { Schema } from "effect";

import { makeAnalytics } from "./analytics";

const key = Schema.decodeUnknownSync(Schema.String)(
  process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ""
);
export const deviceAnalytics = makeAnalytics({
  enabled: !__DEV__ && key !== "",
  key,
  host: "https://us.i.posthog.com",
  send: globalThis.fetch,
});
