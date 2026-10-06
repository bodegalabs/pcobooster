export const FEEDBACK_CONFIRMATION_MS = 4000;

export const clearFeedbackConfirmation = (
  sentAt: number,
  clear: () => void
): (() => void) => {
  const timer = setTimeout(
    clear,
    Math.max(0, sentAt + FEEDBACK_CONFIRMATION_MS - Date.now())
  );
  return () => {
    clearTimeout(timer);
  };
};
