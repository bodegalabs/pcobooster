export type PositionIconId =
  | "camera"
  | "camera-video"
  | "drum"
  | "guitar"
  | "piano"
  | "livestream"
  | "mic-vocal"
  | "sound"
  | "music"
  | "music-note";

const normalizeLabel = (value: string): string =>
  value.trim().toLowerCase().replaceAll(/\s+/gu, " ");

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

export const resolvePositionIconId = (
  positionName: string,
  teamName: string
): PositionIconId => {
  const position = normalizeLabel(positionName);
  const team = normalizeLabel(teamName);

  if (
    includesAny(position, [
      "livestream",
      "live stream",
      "streaming",
      "broadcast",
    ])
  ) {
    return "livestream";
  }
  if (includesAny(position, ["photograph", "photo"])) {
    return "camera";
  }
  if (includesAny(position, ["camera", "cam 1", "cam 2"])) {
    return "camera";
  }
  if (
    includesAny(position, [
      "lyric",
      "proclaim",
      "propresenter",
      "presentation",
      "slide",
    ])
  ) {
    return "music-note";
  }
  if (
    includesAny(position, [
      "sound",
      "foh",
      "audio engineer",
      "monitor",
      "a1",
      "a2",
    ])
  ) {
    return "sound";
  }
  if (includesAny(position, ["video", "switcher", "director", "switch"])) {
    return "camera-video";
  }
  if (
    includesAny(position, [
      "guitar",
      "bass",
      "ukulele",
      "banjo",
      "mandolin",
      "electric",
      "acoustic",
    ])
  ) {
    return "guitar";
  }
  if (includesAny(position, ["drum", "percussion", "cajon", "cajón"])) {
    return "drum";
  }
  if (includesAny(position, ["key", "piano", "organ", "pad", "synth"])) {
    return "piano";
  }
  if (
    includesAny(position, [
      "vocal",
      "vocals",
      "singer",
      "alto",
      "soprano",
      "tenor",
      "lead",
      "worship leader",
      "choir",
      "mic",
      "microphone",
    ])
  ) {
    return "mic-vocal";
  }

  if (includesAny(team, ["vocal", "choir", "singer"])) {
    return "mic-vocal";
  }
  if (includesAny(team, ["band", "music", "orchestra"])) {
    return "music";
  }
  if (
    includesAny(team, [
      "audio",
      "visual",
      "a/v",
      "av",
      "media",
      "production",
      "tech",
    ])
  ) {
    return "camera";
  }

  return "music-note";
};
