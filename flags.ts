import { vercelAdapter } from "@flags-sdk/vercel";
import { flag } from "flags/next";

const localDevelopmentDefault =
  process.env.NODE_ENV !== "production" &&
  !(process.env.VERCEL !== undefined && process.env.VERCEL !== "");

const peoplePageOptions = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
];

export const peoplePageFlag =
  process.env.FLAGS !== undefined && process.env.FLAGS !== ""
    ? flag<boolean>({
        key: "people-page",
        description: "Enable the People dashboard page.",
        options: peoplePageOptions,
        defaultValue: localDevelopmentDefault,
        adapter: vercelAdapter(),
      })
    : flag<boolean>({
        key: "people-page",
        description: "Enable the People dashboard page.",
        options: peoplePageOptions,
        decide: () => localDevelopmentDefault,
      });
