/** Query refetches resolve with an error result by default; refresh must inspect it. */
export const refreshPlanReads = async (
  reads: readonly (() => Promise<{ error: Error | null }> | Promise<void>)[]
): Promise<void> => {
  const results = await Promise.allSettled(
    reads.map(async (read) => await read())
  );
  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
    const error = result.value?.error;
    if (error !== undefined && error !== null) {
      throw error;
    }
  }
};
