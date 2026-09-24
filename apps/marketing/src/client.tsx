import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import { startMarketingAnalytics } from "./lib/analytics";

// Start's default client entry, preceded by analytics (Next.js's `instrumentation-client.ts`).
startMarketingAnalytics();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  );
});
