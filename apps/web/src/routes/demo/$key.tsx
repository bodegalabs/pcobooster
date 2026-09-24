import { createFileRoute } from "@tanstack/react-router";

import { DemoEntry } from "@/components/demo/demo-entry";

const DemoPage = () => {
  const { key } = Route.useParams();
  return <DemoEntry demoKey={key} />;
};

/** A private link: `src/start.ts` also sends matching response headers. */
export const Route = createFileRoute("/demo/$key")({
  head: () => ({
    meta: [
      { title: "Demo · PCOBooster" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: DemoPage,
});
