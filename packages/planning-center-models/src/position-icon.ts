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

const buildSearchContexts = (positionName: string, teamName: string) => {
  const position = normalizeLabel(positionName);
  const team = normalizeLabel(teamName);
  const combined = normalizeLabel(`${positionName} ${teamName}`);
  const roleContexts = [
    ...new Set([position, combined].filter((text) => text.length > 0)),
  ];
  const teamContexts = team.length > 0 ? [team] : [];

  return {
    roleContexts,
    teamContexts,
    allContexts: [...new Set([...roleContexts, ...teamContexts])],
  };
};

const matchesAny = (
  contexts: readonly string[],
  patterns: readonly RegExp[]
): boolean =>
  patterns.some((pattern) => contexts.some((text) => pattern.test(text)));

export const resolvePositionIconId = (
  positionName: string,
  teamName: string
): PositionIconId => {
  const { roleContexts, teamContexts, allContexts } = buildSearchContexts(
    positionName,
    teamName
  );

  if (
    matchesAny(roleContexts, [
      /\blivestreams?\b/u,
      /\bstreaming\b/u,
      /\bbroadcast(?:ing)?\b/u,
    ])
  ) {
    return "livestream";
  }
  if (matchesAny(roleContexts, [/\bphotographs?\b/u, /\bphotos?\b/u])) {
    return "camera";
  }
  if (
    matchesAny(roleContexts, [/\bcameras?\b/u, /\bcam\s*[12]\b/u, /\bcam\b/u])
  ) {
    return "camera";
  }
  if (
    matchesAny(roleContexts, [
      /\blyrics?\b/u,
      /\bproclaim\b/u,
      /\bpropresenter\b/u,
      /\bpresentations?\b/u,
      /\bslides?\b/u,
    ])
  ) {
    return "music-note";
  }
  if (
    matchesAny(roleContexts, [
      /\bsounds?\b/u,
      /\bfoh\b/u,
      /\baudio\s+engineers?\b/u,
      /\bmonitors?\b/u,
      /\ba[12]\b/u,
    ])
  ) {
    return "sound";
  }
  if (
    matchesAny(roleContexts, [
      /\bvideos?\b/u,
      /\bswitchers?\b/u,
      /\bdirectors?\b/u,
    ])
  ) {
    return "camera-video";
  }
  if (
    matchesAny(allContexts, [
      /\bguitars?\b/u,
      /\bbass\b/u,
      /\bukuleles?\b/u,
      /\bbanjos?\b/u,
      /\bmandolins?\b/u,
      /\b(?:electric|acoustic)\b/u,
    ])
  ) {
    return "guitar";
  }
  if (
    matchesAny(allContexts, [
      /\bdrums?\b/u,
      /\bpercussions?\b/u,
      /\bcaj[oó]ns?\b/u,
    ])
  ) {
    return "drum";
  }
  if (
    matchesAny(allContexts, [
      /\bkeys?\b/u,
      /\bkeyboards?\b/u,
      /\bpianos?\b/u,
      /\borgans?\b/u,
      /\bpads?\b/u,
      /\bsynths?\b/u,
    ])
  ) {
    return "piano";
  }
  if (
    matchesAny(allContexts, [
      /\bvocals?\b/u,
      /\bsingers?\b/u,
      /\b(?:alto|soprano|tenor|baritone)\b/u,
      /\bworship\s+leaders?\b/u,
      /\bchoirs?\b/u,
      /\bmicrophones?\b/u,
      /\bmics?\b/u,
      /\bleads?\b/u,
    ])
  ) {
    return "mic-vocal";
  }

  if (
    matchesAny(teamContexts, [/\bvocals?\b/u, /\bchoirs?\b/u, /\bsingers?\b/u])
  ) {
    return "mic-vocal";
  }
  if (
    matchesAny(teamContexts, [/\bbands?\b/u, /\bmusic\b/u, /\borchestras?\b/u])
  ) {
    return "music";
  }
  if (
    matchesAny(teamContexts, [
      /\ba\/v\b/u,
      /\bav\b/u,
      /\baudio\b.*\bvisual\b/u,
      /\bvisuals?\b/u,
      /\bmedia\b/u,
      /\bproduction\b/u,
      /\btech\b/u,
    ])
  ) {
    return "camera";
  }

  return "music-note";
};
