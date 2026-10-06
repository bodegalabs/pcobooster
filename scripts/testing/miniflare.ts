import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

import { Miniflare } from "miniflare";
import type { MiniflareOptions } from "miniflare";

/** Local D1 auth flows make several real workerd round trips and may share CPU with other packages. */
export const LOCAL_WORKER_TEST_TIMEOUT_MS = 30_000;

/** Each test runtime owns its SQLite state until disposal, including shared workflow storage. */
export const createIsolatedMiniflare = async (
  name: string,
  options: MiniflareOptions
): Promise<Miniflare> => {
  const parent = path.resolve(import.meta.dirname, "../../.alchemy/tests");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, `${name}-`));
  try {
    const runtime = new Miniflare({
      ...options,
      resourcePersistencePath: directory,
      isolatedResourcePersistencePath: path.join(directory, "isolated"),
    });
    const stop = runtime.dispose.bind(runtime);
    runtime.dispose = async () => {
      try {
        await stop();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    };
    return runtime;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};
