import { vercelAdapter } from "@flags-sdk/vercel";
import { flag } from "flags/next";

const localDevelopmentDefault =
  process.env.NODE_ENV !== "production" &&
  !(process.env.VERCEL !== undefined && process.env.VERCEL !== "");

const definition = {
  key: "people-page",
  description: "Enable the People dashboard page.",
  options: [
    { value: false, label: "Off" },
    { value: true, label: "On" },
  ],
};

const evaluatePeoplePage =
  process.env.FLAGS !== undefined && process.env.FLAGS !== ""
    ? flag<boolean>({
        ...definition,
        defaultValue: localDevelopmentDefault,
        adapter: vercelAdapter(),
      })
    : flag<boolean>({
        ...definition,
        decide: () => localDevelopmentDefault,
      });

// The explicit Web Request keeps evaluation independent of Next's request context
// and preserves signed Vercel Toolbar overrides on the Hono service.
// oxlint-disable-next-line typescript/promise-function-async -- the Flags SDK owns the promise-returning evaluator.
export const peoplePageFlag = (request: Request): Promise<boolean> =>
  evaluatePeoplePage(request);
