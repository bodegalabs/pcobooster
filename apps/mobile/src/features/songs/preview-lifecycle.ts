/**
 * What a preview holds only while it is on screen: the screen kept awake, and media playing.
 * "On screen" is `useReadVisibility` (its route focused and the app active), the same rule that
 * unsubscribes hidden routes' reads; a mounted route in another tab or a backgrounded app
 * holds neither.
 */

type KeepAwakeCall = (tag: string) => Promise<void>;

let acquisitions = 0;

/**
 * Keeps the screen awake under a unique acquisition of `tag` until the returned release runs. Activation is
 * asynchronous, so a release that comes first is applied again once activation finishes:
 * a left screen never keeps the device awake.
 */
export const holdKeepAwake = (
  tag: string,
  activate: KeepAwakeCall,
  deactivate: KeepAwakeCall
): (() => void) => {
  acquisitions += 1;
  const acquisitionTag = `${tag}:${acquisitions}`;
  let released = false;
  // Keep-awake is best effort: a failed call leaves the system's own idle timer in charge.
  const release = async () => {
    try {
      await deactivate(acquisitionTag);
    } catch {
      // See above.
    }
  };
  void (async () => {
    try {
      await activate(acquisitionTag);
    } catch {
      return;
    }
    if (released) {
      await release();
    }
  })();
  return () => {
    released = true;
    void release();
  };
};

/** The part of the system player the playback policy drives. */
export interface PausablePlayer {
  pause: () => void;
  staysActiveInBackground: boolean;
  showNowPlayingNotification: boolean;
}

/**
 * The playback policy: audio and video play only while their screen is on screen. Nothing plays
 * in the background or on the lock screen, and a hidden screen pauses; returning never resumes
 * on its own, so the person presses play again.
 */
export const applyPlaybackPolicy = (
  player: PausablePlayer,
  visible: boolean
): void => {
  player.staysActiveInBackground = false;
  player.showNowPlayingNotification = false;
  if (!visible) {
    player.pause();
  }
};
