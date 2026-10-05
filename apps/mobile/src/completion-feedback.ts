/** Optional device feedback cannot change the outcome of a completed provider write. */
export const completionFeedback = async (
  notify: () => Promise<void>
): Promise<void> => {
  try {
    await notify();
  } catch {
    // Devices without a working haptics engine still completed the workflow.
  }
};
