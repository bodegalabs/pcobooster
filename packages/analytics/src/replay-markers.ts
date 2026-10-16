/** DOM attribute for person-identifying text PostHog should mask in session replay. */
export const REPLAY_MASK_ATTRIBUTE = "data-replay-mask";

/** DOM attribute for photos and other pixels that should not appear in replay. */
export const REPLAY_BLOCK_ATTRIBUTE = "data-replay-block";

/** Matches {@link REPLAY_MASK_ATTRIBUTE} on an element and its descendants' text nodes. */
export const replayMaskTextSelector = `[${REPLAY_MASK_ATTRIBUTE}]`;

/**
 * Matches {@link REPLAY_BLOCK_ATTRIBUTE} and embedded media that can carry person-identifying
 * pixels. Icons (`svg`) and non-avatar images stay visible so replays remain readable.
 */
export const replayBlockSelector = `[${REPLAY_BLOCK_ATTRIBUTE}], canvas, video, audio, iframe, object, embed`;
