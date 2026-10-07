/**
 * Runs `tasks` in order with at most `limit` running at once, settling every one. A failure
 * stays on its own query; the rest still run.
 */
export const runInTurns = async (
  tasks: readonly (() => Promise<void>)[],
  limit: number
): Promise<void> => {
  const queue = [...tasks];
  const worker = async (): Promise<void> => {
    const task = queue.shift();
    if (task === undefined) {
      return;
    }
    try {
      await task();
    } catch {
      // The failed read records its error on its own query, which offers Retry.
    }
    await worker();
  };
  await Promise.all(
    Array.from({ length: Math.max(1, limit) }, async () => {
      await worker();
    })
  );
};
