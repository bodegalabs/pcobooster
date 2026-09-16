export const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = Array.from(
    { length: items.length },
    (): { value: R } | undefined => undefined
  );
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    const current = nextIndex;
    nextIndex += 1;
    if (current >= items.length) {
      return;
    }
    const value = await mapper(items[current], current);
    results[current] = { value };
    await worker();
  };

  const workers = Array.from({ length: safeConcurrency }, async () => {
    await worker();
  });
  await Promise.all(workers);
  return results.map((slot) => {
    if (slot === undefined) {
      throw new Error("Concurrent mapping did not complete every item");
    }
    return slot.value;
  });
};
