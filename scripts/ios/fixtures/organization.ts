import { at } from "./time";

/**
 * A fictional church for the iOS app's previews, UI tests, and App Store screenshots. People
 * and their positions come from the marketing site's product replica
 * (`apps/marketing/src/components/product-demo/fixtures.ts`); nothing here is real.
 */
export const organization = {
  id: "406221",
  name: "Cedar Grove Church",
} as const;

export const SUNDAY = "1101";
export const YOUTH = "1102";
export const EVENTS = "1103";

export interface ServiceTypeSeed {
  readonly id: string;
  readonly name: string;
  readonly sequence: number;
}

export const serviceTypes: readonly ServiceTypeSeed[] = [
  { id: SUNDAY, name: "Sunday Gathering", sequence: 0 },
  { id: YOUTH, name: "Youth Night", sequence: 1 },
  { id: EVENTS, name: "Special Events", sequence: 2 },
];

export const serviceTypeName = (serviceTypeId: string): string =>
  serviceTypes.find(({ id }) => id === serviceTypeId)?.name ?? "";

export interface PositionSeed {
  readonly id: string;
  readonly name: string;
  readonly slots: number;
}

export interface TeamSeed {
  readonly id: string;
  readonly name: string;
  readonly serviceTypeId: string;
  /** The team plays at the plan's rehearsal or soundcheck. */
  readonly rehearses: boolean;
  readonly positions: readonly PositionSeed[];
}

/** Sunday positions, named for the replica's keys so its history carries over. */
export const P = {
  acoustic: "3301",
  bass: "3302",
  drums: "3303",
  electric: "3304",
  keys: "3305",
  lead: "3306",
  alto: "3307",
  tenor: "3308",
  sound: "3309",
  lyrics: "3310",
  camera: "3311",
  livestream: "3312",
  coffee: "3313",
  greeter: "3314",
  youthAcoustic: "3321",
  youthKeys: "3322",
  youthDrums: "3323",
  youthVocals: "3324",
  youthSound: "3325",
  youthLyrics: "3326",
  eventAcoustic: "3331",
  eventBass: "3332",
  eventDrums: "3333",
  eventKeys: "3334",
  eventLead: "3335",
  eventVocals: "3336",
  eventSound: "3337",
  eventLyrics: "3338",
  eventLivestream: "3339",
} as const;

export const T = {
  band: "2201",
  vocals: "2202",
  production: "2203",
  hospitality: "2204",
  youthBand: "2211",
  youthTech: "2212",
  eventBand: "2221",
  eventVocals: "2222",
  eventProduction: "2223",
} as const;

export const teams: readonly TeamSeed[] = [
  {
    id: T.band,
    name: "Band",
    serviceTypeId: SUNDAY,
    rehearses: true,
    positions: [
      { id: P.acoustic, name: "Acoustic Guitar", slots: 2 },
      { id: P.bass, name: "Bass Guitar", slots: 1 },
      { id: P.drums, name: "Drums", slots: 1 },
      { id: P.electric, name: "Electric Guitar", slots: 1 },
      { id: P.keys, name: "Keys", slots: 1 },
    ],
  },
  {
    id: T.vocals,
    name: "Vocals",
    serviceTypeId: SUNDAY,
    rehearses: true,
    positions: [
      { id: P.lead, name: "Worship Leader", slots: 1 },
      { id: P.alto, name: "Alto", slots: 2 },
      { id: P.tenor, name: "Tenor", slots: 1 },
    ],
  },
  {
    id: T.production,
    name: "Production",
    serviceTypeId: SUNDAY,
    rehearses: false,
    positions: [
      { id: P.sound, name: "Sound", slots: 1 },
      { id: P.lyrics, name: "Lyrics", slots: 1 },
      { id: P.camera, name: "Camera", slots: 2 },
      { id: P.livestream, name: "Livestream", slots: 1 },
    ],
  },
  {
    id: T.hospitality,
    name: "Hospitality",
    serviceTypeId: SUNDAY,
    rehearses: false,
    positions: [
      { id: P.coffee, name: "Coffee", slots: 2 },
      { id: P.greeter, name: "Greeter", slots: 2 },
    ],
  },
  {
    id: T.youthBand,
    name: "Youth Band",
    serviceTypeId: YOUTH,
    rehearses: true,
    positions: [
      { id: P.youthAcoustic, name: "Acoustic Guitar", slots: 1 },
      { id: P.youthKeys, name: "Keys", slots: 1 },
      { id: P.youthDrums, name: "Drums", slots: 1 },
      { id: P.youthVocals, name: "Vocals", slots: 2 },
    ],
  },
  {
    id: T.youthTech,
    name: "Youth Tech",
    serviceTypeId: YOUTH,
    rehearses: false,
    positions: [
      { id: P.youthSound, name: "Sound", slots: 1 },
      { id: P.youthLyrics, name: "Lyrics", slots: 1 },
    ],
  },
  {
    id: T.eventBand,
    name: "Band",
    serviceTypeId: EVENTS,
    rehearses: true,
    positions: [
      { id: P.eventAcoustic, name: "Acoustic Guitar", slots: 1 },
      { id: P.eventBass, name: "Bass Guitar", slots: 1 },
      { id: P.eventDrums, name: "Drums", slots: 1 },
      { id: P.eventKeys, name: "Keys", slots: 1 },
    ],
  },
  {
    id: T.eventVocals,
    name: "Vocals",
    serviceTypeId: EVENTS,
    rehearses: true,
    positions: [
      { id: P.eventLead, name: "Worship Leader", slots: 1 },
      { id: P.eventVocals, name: "Vocals", slots: 2 },
    ],
  },
  {
    id: T.eventProduction,
    name: "Production",
    serviceTypeId: EVENTS,
    rehearses: false,
    positions: [
      { id: P.eventSound, name: "Sound", slots: 1 },
      { id: P.eventLyrics, name: "Lyrics", slots: 1 },
      { id: P.eventLivestream, name: "Livestream", slots: 1 },
    ],
  },
];

export interface PositionRef {
  readonly position: PositionSeed;
  readonly team: TeamSeed;
}

export const positionRefs: readonly PositionRef[] = teams.flatMap((team) =>
  team.positions.map((position) => ({ position, team }))
);

export const positionRef = (positionId: string): PositionRef => {
  const ref = positionRefs.find(({ position }) => position.id === positionId);
  if (ref === undefined) {
    throw new Error(`Unknown position ${positionId}`);
  }
  return ref;
};

export const teamsFor = (serviceTypeId: string): readonly TeamSeed[] =>
  teams.filter((team) => team.serviceTypeId === serviceTypeId);

export interface SchedulingPreferenceSeed {
  readonly schedulePreference: string | null;
  readonly preferredWeeks: readonly number[];
  readonly maxPlansPerDay: number | null;
  readonly maxPlansPerMonth: number | null;
}

export interface BlockoutSeed {
  readonly id: string;
  readonly reason: string;
  readonly description: string;
  readonly first: string;
  readonly last: string;
}

export interface PersonSeed {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Positions the person is on in Planning Center, across service types. */
  readonly positions: readonly string[];
  /** Sundays served before the anchor (whole weeks back), from the marketing replica. */
  readonly served?: readonly { weeksAgo: number; position: string }[];
  /** Serves no plans: on rosters, but away for the season. */
  readonly away?: boolean;
  /** On plans only when explicitly scheduled; the rotation never picks them. */
  readonly onlyWhenAsked?: boolean;
  /** Stopped being scheduled after this day. */
  readonly servedUntil?: string;
  readonly preferences?: SchedulingPreferenceSeed;
  readonly blockouts?: readonly BlockoutSeed[];
}

const weeks = (position: string, ...weeksAgo: number[]) =>
  weeksAgo.map((value) => ({ weeksAgo: value, position }));

const person = (
  id: string,
  name: string,
  positions: readonly string[],
  extra: Omit<PersonSeed, "id" | "firstName" | "lastName" | "positions"> = {}
): PersonSeed => {
  const [firstName = "", lastName = ""] = name.split(" ");
  return { id, firstName, lastName, positions, ...extra };
};

const prefers = (
  schedulePreference: string | null,
  extra: Partial<Omit<SchedulingPreferenceSeed, "schedulePreference">> = {}
): SchedulingPreferenceSeed => ({
  schedulePreference,
  preferredWeeks: extra.preferredWeeks ?? [],
  maxPlansPerDay: extra.maxPlansPerDay ?? null,
  maxPlansPerMonth: extra.maxPlansPerMonth ?? null,
});

/** The signed-in scheduler: worship pastor, leads Band and Vocals on Sundays. */
export const VIEWER_ID = "4100114";

export const people: readonly PersonSeed[] = [
  person("4100101", "Taylor Lane", [P.acoustic, P.electric, P.youthAcoustic], {
    served: weeks(P.acoustic, 5, 9),
    preferences: prefers("Once a month"),
  }),
  person("4100102", "Hayden Collins", [P.acoustic, P.tenor, P.eventAcoustic], {
    served: [...weeks(P.acoustic, 4), ...weeks(P.tenor, 8)],
    preferences: prefers("Choose Weeks", { preferredWeeks: [1, 3] }),
    blockouts: [
      {
        id: "61000201",
        reason: "Vacation",
        description: "Camping at Lake Tahoe",
        first: "2026-10-30",
        last: "2026-11-02",
      },
    ],
  }),
  person("4100103", "Quinn Clark", [P.acoustic, P.eventAcoustic], {
    served: weeks(P.acoustic, 2, 6),
    preferences: prefers("Every other week"),
    blockouts: [
      {
        id: "61000301",
        reason: "Retreat",
        description: "Men's retreat",
        first: "2026-10-23",
        last: "2026-10-25",
      },
    ],
  }),
  person("4100104", "Frankie Turner", [P.acoustic, P.alto], {
    served: [...weeks(P.acoustic, 1, 2, 3), ...weeks(P.alto, 4)],
    preferences: prefers("Twice a month", { maxPlansPerMonth: 3 }),
    blockouts: [
      {
        id: "61000401",
        reason: "Family visit",
        description: "Grandparents in town",
        first: "2026-11-13",
        last: "2026-11-16",
      },
      {
        id: "61000402",
        reason: "Thanksgiving",
        description: "",
        first: "2026-11-25",
        last: "2026-11-29",
      },
    ],
  }),
  person("4100105", "Robin Lane", [P.acoustic, P.keys], {
    served: weeks(P.keys, 3, 7),
    blockouts: [
      {
        id: "61000501",
        reason: "Out of town",
        description: "Visiting my sister in Portland",
        first: "2026-10-02",
        last: "2026-10-05",
      },
    ],
  }),
  person("4100106", "Drew Scott", [P.bass, P.eventBass], {
    served: weeks(P.bass, 3, 7),
  }),
  person("4100107", "Kendall Evans", [P.bass, P.electric, P.eventBass], {
    served: weeks(P.bass, 1, 2),
  }),
  person("4100108", "Lane Parker", [P.drums, P.eventDrums], {
    served: weeks(P.drums, 2, 4, 6),
  }),
  person(
    "4100109",
    "Rowan Shaw",
    [P.drums, P.sound, P.youthDrums, P.eventDrums],
    {
      served: weeks(P.drums, 7, 11),
    }
  ),
  person("4100110", "Kendall Cole", [P.electric], {
    served: weeks(P.electric, 4, 8),
    blockouts: [
      {
        id: "61001001",
        reason: "Work trip",
        description: "Conference in Denver",
        first: "2026-10-16",
        last: "2026-10-19",
      },
    ],
  }),
  person("4100111", "Avery Woods", [P.electric, P.acoustic], {
    served: weeks(P.electric, 1),
    onlyWhenAsked: true,
  }),
  person("4100112", "Dakota Bennett", [P.keys, P.eventKeys], {
    served: weeks(P.keys, 5),
  }),
  person("4100113", "Eden Brooks", [P.keys, P.alto, P.youthKeys, P.eventKeys], {
    served: weeks(P.alto, 1, 3),
  }),
  person("4100114", "Jordan Hale", [P.lead, P.eventLead], {
    served: weeks(P.lead, 2, 4),
  }),
  person("4100115", "Morgan Reyes", [P.lead, P.alto, P.eventLead], {
    served: weeks(P.lead, 6, 10),
  }),
  person("4100116", "Logan Archer", [P.alto, P.eventVocals], {
    served: weeks(P.alto, 2, 5),
    preferences: prefers("As often as needed", { maxPlansPerMonth: 2 }),
  }),
  person(
    "4100117",
    "Rowan West",
    [P.alto, P.lyrics, P.eventVocals, P.eventLyrics],
    {
      served: [...weeks(P.alto, 1), ...weeks(P.lyrics, 2, 3)],
    }
  ),
  person("4100118", "Sage Porter", [P.alto, P.eventVocals], {
    servedUntil: "2026-07-19",
    preferences: prefers("Unavailable"),
  }),
  person("4100119", "Casey Monroe", [P.alto, P.greeter], {
    away: true,
    blockouts: [
      {
        id: "61001901",
        reason: "Medical leave",
        description: "Recovering from surgery",
        first: "2026-09-01",
        last: "2026-12-31",
      },
    ],
  }),
  person("4100120", "Emerson Diaz", [P.tenor, P.eventVocals], {
    served: weeks(P.tenor, 3),
  }),
  person("4100121", "Riley Foster", [P.tenor, P.lead, P.youthVocals], {
    served: weeks(P.tenor, 1, 2, 4),
  }),
  person("4100122", "Parker West", [P.sound, P.livestream, P.eventSound], {
    served: weeks(P.sound, 2, 5),
  }),
  person(
    "4100123",
    "Blake Collins",
    [P.sound, P.camera, P.youthSound, P.eventSound],
    { served: weeks(P.camera, 4) }
  ),
  person("4100124", "Eden Lane", [P.lyrics, P.eventLyrics], {
    served: weeks(P.lyrics, 5, 9),
  }),
  person(
    "4100125",
    "Frankie Lewis",
    [P.camera, P.livestream, P.eventLivestream],
    {
      served: weeks(P.camera, 1, 3),
    }
  ),
  person("4100126", "Jamie Ortiz", [P.camera, P.youthLyrics], {
    served: weeks(P.camera, 6),
  }),
  person(
    "4100127",
    "Reese Nguyen",
    [P.livestream, P.camera, P.eventLivestream],
    {
      served: weeks(P.livestream, 8),
    }
  ),
  person("4100128", "Eden Miller", [P.coffee], {
    served: weeks(P.coffee, 2, 4),
  }),
  person("4100129", "Drew Cole", [P.coffee, P.greeter], {
    served: weeks(P.coffee, 1),
  }),
  person("4100130", "Skyler Grant", [P.coffee], {
    served: weeks(P.coffee, 7),
    servedUntil: "2026-08-16",
  }),
  person("4100131", "Harper Quinn", [P.greeter], {
    served: weeks(P.greeter, 3, 6),
  }),
  person("4100132", "Cameron Bell", [P.greeter, P.coffee], {
    served: weeks(P.greeter, 5),
  }),
  person("4100133", "Mia Torres", [P.youthAcoustic, P.youthVocals]),
  person("4100134", "Nora Kim", [P.youthKeys]),
  person("4100135", "Eli Navarro", [P.youthDrums]),
  person("4100136", "Ava Reed", [P.youthVocals]),
  person("4100137", "Sam Patel", [P.youthVocals, P.youthLyrics]),
  person("4100138", "Theo Grant", [P.youthSound]),
  person("4100145", "Jonah Price", [P.youthAcoustic, P.youthVocals]),
  person("4100146", "Lily Hart", [P.youthKeys, P.youthVocals]),
  person("4100147", "Caleb Ward", [P.youthDrums, P.youthSound]),
  person("4100148", "Zoe Sims", [P.youthLyrics, P.youthVocals]),
  person("4100149", "Micah Stone", [P.acoustic, P.electric]),
  person("4100150", "Talia Moss", [P.alto, P.eventVocals]),
  person("4100151", "Isaac Fern", [P.bass, P.drums]),
  person("4100152", "Nina Castillo", [P.keys, P.alto]),
  person("4100153", "Gabe Holt", [P.electric, P.sound]),
  person("4100154", "June Albright", [P.alto, P.greeter]),
  person("4100155", "Marcus Hill", [P.tenor, P.lead]),
  person("4100156", "Leah Sandoval", [P.lyrics, P.livestream]),
  person("4100157", "Ben Carter", [P.camera, P.sound]),
  person("4100158", "Clara Voss", [P.coffee, P.greeter]),
  person("4100159", "Silas Ford", [P.coffee, P.camera]),
  person("4100160", "Elise Moreau", [P.greeter, P.coffee]),
  person("4100161", "Andre Watts", [P.drums, P.bass]),
  // In the directory, but on no team: "Someone else" search results.
  person("4100139", "Jesse Moreno", []),
  person("4100140", "Priya Shah", []),
  person("4100141", "Lucas Fernandez", []),
  person("4100142", "Hannah Whitaker", []),
  person("4100143", "Owen Gallagher", []),
  person("4100144", "Grace Liu", []),
];

export const personById = (personId: string): PersonSeed => {
  const found = people.find(({ id }) => id === personId);
  if (found === undefined) {
    throw new Error(`Unknown person ${personId}`);
  }
  return found;
};

export const fullName = (seed: PersonSeed): string =>
  `${seed.firstName} ${seed.lastName}`;

export const rosterFor = (positionId: string): readonly PersonSeed[] =>
  people.filter((seed) => seed.positions.includes(positionId));

export interface BlockoutWindow {
  readonly seed: BlockoutSeed;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** All-day blockouts, as Services stores them: local midnight to the last minute. */
export const blockoutWindows = (seed: PersonSeed): BlockoutWindow[] =>
  (seed.blockouts ?? []).map((blockout) => ({
    seed: blockout,
    startsAt: at(blockout.first, "00:00"),
    endsAt: at(blockout.last, "23:59"),
  }));

export const isBlockedOn = (seed: PersonSeed, dayKey: string): boolean =>
  (seed.blockouts ?? []).some(
    (blockout) => blockout.first <= dayKey && dayKey <= blockout.last
  );

/** A second Planning Center login for the account switcher. */
export const otherAccount = {
  personId: "5208841",
  organizationId: "512009",
  organizationName: "Northside Fellowship",
  email: "jordan@northsidefellowship.example",
} as const;

export const viewerEmail = "jordan.hale@cedargrove.example";
export const senderName = "Jordan Hale";
export const preacherName = "Pastor Elena Ruiz";
