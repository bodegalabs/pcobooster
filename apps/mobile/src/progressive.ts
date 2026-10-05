export const assertActive = (signal: AbortSignal): void => {
  if (signal.aborted) {
    const error = new Error("Request cancelled");
    error.name = "AbortError";
    throw error;
  }
};
/** Each completed provider page is exposed before requesting its continuation. */
export const readProgressively = async <Cursor, Page>({
  initial,
  signal,
  read,
  publish,
  continuation,
}: {
  initial: Cursor;
  signal: AbortSignal;
  read: (cursor: Cursor) => Promise<Page>;
  publish: (page: Page) => void;
  continuation: (cursor: Cursor, page: Page) => Cursor | null;
}): Promise<void> => {
  const step = async (cursor: Cursor): Promise<void> => {
    assertActive(signal);
    const page = await read(cursor);
    assertActive(signal);
    publish(page);
    const remaining = continuation(cursor, page);
    if (remaining !== null) {
      await step(remaining);
    }
  };
  await step(initial);
};
/** Bound concurrent batches, and check cancellation before every new wave. */
export const readBatches = async <Input>({
  inputs,
  read,
  signal,
  concurrency = 2,
}: {
  inputs: readonly Input[];
  read: (input: Input) => Promise<void>;
  signal: AbortSignal;
  concurrency?: number;
}): Promise<void> => {
  const wave = async (offset: number): Promise<void> => {
    assertActive(signal);
    if (offset >= inputs.length) {
      return;
    }
    await Promise.all(inputs.slice(offset, offset + concurrency).map(read));
    await wave(offset + concurrency);
  };
  await wave(0);
};
