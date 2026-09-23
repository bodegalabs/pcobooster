import { spawn } from "node:child_process";
import { once } from "node:events";

import { z } from "zod";

// Alchemy supplies Workers bindings to Next's HMR server and applies local D1 migrations.
const processes = [
  spawn("bun", ["run", "dev:marketing"], { stdio: "inherit" }),
  spawn("bun", ["run", "alchemy", "dev", "--stage", "local", "--no-input"], {
    stdio: "inherit",
  }),
];
const stop = () => {
  for (const child of processes) {
    child.kill("SIGTERM");
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const exits = processes.map(async (child) => {
  const [code] = z
    .tuple([z.number().nullable(), z.string().nullable()])
    .parse(await once(child, "exit"));
  return code ?? 0;
});
try {
  process.exitCode = await Promise.race(exits);
} finally {
  stop();
  await Promise.allSettled(exits);
}
