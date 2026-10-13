import { defineConfig } from "vitest/config";

import rootConfig from "../../vitest.config";

/** The opt-in load run (`test:load`), kept out of the default suite. */
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: ["apps/server/src/**/*.load.ts"],
    maxWorkers: 1,
  },
});
