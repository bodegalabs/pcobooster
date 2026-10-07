/** React Native's AbortSignal exposes `aborted`, but lacks `throwIfAborted` and `reason`. */
export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted === true) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
};
