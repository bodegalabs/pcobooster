// Fictional organization shown in the marketing site's product replica. Names,
// history, and scores are invented; nothing here comes from Planning Center.

export type PositionIcon =
  | "guitar"
  | "bass"
  | "drum"
  | "keys"
  | "mic"
  | "sound"
  | "lyrics"
  | "camera"
  | "livestream"
  | "coffee"
  | "greeter";

export type SlotStatus = "confirmed" | "pending";

export interface DemoPosition {
  readonly id: string;
  readonly name: string;
  readonly icon: PositionIcon;
  readonly slots: number;
}

export interface DemoTeam {
  readonly id: string;
  readonly name: string;
  readonly icon: PositionIcon;
  readonly positions: readonly DemoPosition[];
}

export interface DemoServed {
  /** Whole weeks before the plan being built. */
  readonly weeksAgo: number;
  readonly positionId: string;
  /** A midweek rehearsal three days before that Sunday, with no service. */
  readonly rehearsal?: boolean;
}

export interface DemoUpcoming {
  /** Whole weeks after the plan being built. */
  readonly weeksAhead: number;
  readonly positionId: string;
  readonly status: SlotStatus;
}

export interface DemoPerson {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly positionIds: readonly string[];
  readonly served: readonly DemoServed[];
  readonly upcoming: readonly DemoUpcoming[];
  readonly blockedOut?: boolean;
  readonly declined?: string;
}

export interface DemoAssignment {
  readonly personId: string;
  readonly status: SlotStatus;
}

/** Where an item runs against the service clock. */
export type PlanItemWhen = "pre" | "during" | "post";

export interface DemoPlanItem {
  readonly id: string;
  readonly title: string;
  readonly kind: "song" | "header" | "item";
  /** Who leads, how it starts, where it goes. */
  readonly notes: string;
  readonly songId?: string;
  /** A song's key, as it is played in this plan. */
  readonly songKey?: string;
  readonly seconds: number;
  readonly when: PlanItemWhen;
}

export interface DemoTime {
  readonly id: string;
  readonly name: string;
  readonly type: "service" | "rehearsal";
  readonly day: string;
  readonly start: string;
  readonly end: string;
  readonly teams: number;
  readonly positions: number;
  readonly people: number;
}

export interface DemoSong {
  readonly id: string;
  readonly title: string;
  readonly writers: string;
  readonly lastScheduled: string;
  /** Whole days between its last play and the sample plan. */
  readonly daysSincePlayed: number;
  readonly arrangement: string;
  /** Keys the arrangement has, the first being its usual one. */
  readonly keys: readonly string[];
}

/** The sample plan. Its date anchors every day in the history bars. */
export const plan = {
  serviceType: "Sunday Services",
  title: "Morning gathering",
  when: "Sun, Oct 11, 2026",
} as const;

/** The plan's calendar day, as a UTC midnight, for the history bars' date labels. */
export const PLAN_DAY_UTC = Date.UTC(2026, 9, 11);

export const teams: readonly DemoTeam[] = [
  {
    id: "band",
    name: "Band",
    icon: "guitar",
    positions: [
      { id: "acoustic", name: "Acoustic Guitar", icon: "guitar", slots: 2 },
      { id: "bass", name: "Bass Guitar", icon: "bass", slots: 1 },
      { id: "drums", name: "Drums", icon: "drum", slots: 1 },
      { id: "electric", name: "Electric Guitar", icon: "guitar", slots: 1 },
      { id: "keys", name: "Keys", icon: "keys", slots: 1 },
    ],
  },
  {
    id: "vocals",
    name: "Vocals",
    icon: "mic",
    positions: [
      { id: "lead", name: "Worship Leader", icon: "mic", slots: 1 },
      { id: "alto", name: "Alto", icon: "mic", slots: 2 },
      { id: "tenor", name: "Tenor", icon: "mic", slots: 1 },
    ],
  },
  {
    id: "production",
    name: "Production",
    icon: "sound",
    positions: [
      { id: "sound", name: "Sound", icon: "sound", slots: 1 },
      { id: "lyrics", name: "Lyrics", icon: "lyrics", slots: 1 },
      { id: "camera", name: "Camera", icon: "camera", slots: 2 },
      { id: "livestream", name: "Livestream", icon: "livestream", slots: 1 },
    ],
  },
  {
    id: "hospitality",
    name: "Hospitality",
    icon: "coffee",
    positions: [
      { id: "coffee", name: "Coffee", icon: "coffee", slots: 2 },
      { id: "greeter", name: "Greeter", icon: "greeter", slots: 2 },
    ],
  },
];

const weeks = (positionId: string, ...weeksAgo: number[]): DemoServed[] =>
  weeksAgo.map((weeksAgoValue) => ({ weeksAgo: weeksAgoValue, positionId }));

const rehearsals = (positionId: string, ...weeksAgo: number[]): DemoServed[] =>
  weeksAgo.map((weeksAgoValue) => ({
    weeksAgo: weeksAgoValue,
    positionId,
    rehearsal: true,
  }));

const ahead = (
  positionId: string,
  status: SlotStatus,
  ...weeksAhead: number[]
): DemoUpcoming[] =>
  weeksAhead.map((weeksAheadValue) => ({
    weeksAhead: weeksAheadValue,
    positionId,
    status,
  }));

interface PersonExtras {
  readonly upcoming?: readonly DemoUpcoming[];
  readonly blockedOut?: boolean;
  readonly declined?: string;
}

const person = (
  id: string,
  name: string,
  positionIds: readonly string[],
  served: readonly DemoServed[],
  { upcoming = [], ...flags }: PersonExtras = {}
): DemoPerson => {
  const [firstName = "", lastName = ""] = name.split(" ");
  return { id, firstName, lastName, positionIds, served, upcoming, ...flags };
};

export const people: readonly DemoPerson[] = [
  person(
    "p01",
    "Taylor Lane",
    ["acoustic", "electric"],
    [...weeks("acoustic", 3, 5, 9), ...rehearsals("acoustic", 3)],
    { upcoming: ahead("electric", "confirmed", 2) }
  ),
  person(
    "p02",
    "Hayden Collins",
    ["acoustic", "tenor"],
    [
      ...weeks("acoustic", 4),
      ...weeks("tenor", 8),
      ...rehearsals("acoustic", 4),
    ]
  ),
  person("p03", "Quinn Clark", ["acoustic"], weeks("acoustic", 2, 6), {
    upcoming: ahead("acoustic", "pending", 1),
  }),
  person(
    "p04",
    "Frankie Turner",
    ["acoustic", "alto"],
    [...weeks("acoustic", 1, 2, 3), ...rehearsals("acoustic", 1, 2)],
    { upcoming: ahead("alto", "confirmed", 1) }
  ),
  person("p05", "Robin Lane", ["acoustic", "keys"], weeks("keys", 3, 7), {
    blockedOut: true,
  }),
  person("p06", "Drew Scott", ["bass"], weeks("bass", 3, 7)),
  person("p07", "Kendall Evans", ["bass", "electric"], weeks("bass", 1, 2)),
  person("p08", "Lane Parker", ["drums"], weeks("drums", 2, 4, 6), {
    upcoming: ahead("drums", "confirmed", 2),
  }),
  person("p09", "Rowan Shaw", ["drums", "sound"], weeks("drums", 6, 11)),
  person("p10", "Kendall Cole", ["electric"], weeks("electric", 4, 8)),
  person("p11", "Avery Woods", ["electric", "acoustic"], weeks("electric", 1), {
    declined: "Traveling for a family wedding that weekend.",
  }),
  person("p12", "Dakota Bennett", ["keys"], weeks("keys", 5)),
  person("p13", "Eden Brooks", ["keys", "alto"], weeks("alto", 1, 3)),
  person("p14", "Jordan Hale", ["lead"], weeks("lead", 2, 4)),
  person("p15", "Morgan Reyes", ["lead", "alto"], weeks("lead", 6, 10)),
  person("p16", "Logan Archer", ["alto"], weeks("alto", 2, 5)),
  person(
    "p17",
    "Rowan West",
    ["alto", "lyrics"],
    [...weeks("alto", 1), ...weeks("lyrics", 2, 3)]
  ),
  person("p18", "Sage Porter", ["alto"], weeks("alto", 7)),
  person("p19", "Casey Monroe", ["alto", "greeter"], [], { blockedOut: true }),
  person("p20", "Emerson Diaz", ["tenor"], weeks("tenor", 3)),
  person("p21", "Riley Foster", ["tenor", "lead"], weeks("tenor", 1, 2, 4)),
  person("p22", "Parker West", ["sound", "livestream"], weeks("sound", 2, 5)),
  person("p23", "Blake Collins", ["sound", "camera"], weeks("camera", 4)),
  person("p24", "Eden Lane", ["lyrics"], weeks("lyrics", 5, 9)),
  person(
    "p25",
    "Frankie Lewis",
    ["camera", "livestream"],
    weeks("camera", 1, 3)
  ),
  person("p26", "Jamie Ortiz", ["camera"], weeks("camera", 6)),
  person(
    "p27",
    "Reese Nguyen",
    ["livestream", "camera"],
    weeks("livestream", 8)
  ),
  person("p28", "Eden Miller", ["coffee"], weeks("coffee", 2, 4)),
  person("p29", "Drew Cole", ["coffee", "greeter"], weeks("coffee", 1)),
  person("p30", "Skyler Grant", ["coffee"], weeks("coffee", 7)),
  person("p31", "Harper Quinn", ["greeter"], weeks("greeter", 3, 6)),
  person("p32", "Cameron Bell", ["greeter", "coffee"], weeks("greeter", 5)),
];

/** Who is already on the plan when a visitor arrives. */
export const initialAssignments = {
  acoustic: [{ personId: "p04", status: "confirmed" }],
  bass: [{ personId: "p07", status: "confirmed" }],
  drums: [{ personId: "p08", status: "pending" }],
  keys: [{ personId: "p12", status: "confirmed" }],
  lead: [{ personId: "p14", status: "confirmed" }],
  alto: [{ personId: "p16", status: "confirmed" }],
  sound: [{ personId: "p22", status: "confirmed" }],
  lyrics: [{ personId: "p24", status: "pending" }],
  camera: [{ personId: "p25", status: "confirmed" }],
  coffee: [
    { personId: "p28", status: "confirmed" },
    { personId: "p29", status: "pending" },
  ],
  greeter: [{ personId: "p31", status: "confirmed" }],
} as const satisfies Readonly<Record<string, readonly DemoAssignment[]>>;

const SECONDS_PER_MINUTE = 60;
const minutes = (count: number) => count * SECONDS_PER_MINUTE;

export const planItems: readonly DemoPlanItem[] = [
  {
    id: "i1",
    title: "Pre-service",
    kind: "header",
    notes: "",
    seconds: 0,
    when: "during",
  },
  {
    id: "i2",
    title: "Countdown",
    kind: "item",
    notes: "Video",
    seconds: minutes(5),
    when: "pre",
  },
  {
    id: "i3",
    title: "Worship",
    kind: "header",
    notes: "",
    seconds: 0,
    when: "during",
  },
  {
    id: "i4",
    title: "Morning Light",
    kind: "song",
    notes: "Full band",
    songId: "s1",
    songKey: "G",
    seconds: minutes(5),
    when: "during",
  },
  {
    id: "i5",
    title: "Steady Ground",
    kind: "song",
    notes: "Acoustic intro",
    songId: "s2",
    songKey: "Eb",
    seconds: minutes(6),
    when: "during",
  },
  {
    id: "i6",
    title: "Open Doors",
    kind: "song",
    notes: "",
    songId: "s3",
    songKey: "E",
    seconds: minutes(5),
    when: "during",
  },
  {
    id: "i7",
    title: "Welcome",
    kind: "item",
    notes: "Host",
    seconds: minutes(4),
    when: "during",
  },
  {
    id: "i8",
    title: "Message",
    kind: "header",
    notes: "",
    seconds: 0,
    when: "during",
  },
  {
    id: "i9",
    title: "Sermon",
    kind: "item",
    notes: "Pastor",
    seconds: minutes(32),
    when: "during",
  },
  {
    id: "i10",
    title: "Here With Us",
    kind: "song",
    notes: "Keys only",
    songId: "s4",
    seconds: minutes(4),
    when: "during",
  },
  {
    id: "i11",
    title: "Benediction",
    kind: "item",
    notes: "",
    seconds: minutes(2),
    when: "post",
  },
];

export const times: readonly DemoTime[] = [
  {
    id: "t1",
    name: "Band rehearsal",
    type: "rehearsal",
    day: "Thu, Oct 8",
    start: "7:00 PM",
    end: "8:30 PM",
    teams: 2,
    positions: 8,
    people: 7,
  },
  {
    id: "t2",
    name: "First service",
    type: "service",
    day: "Sun, Oct 11",
    start: "9:00 AM",
    end: "10:15 AM",
    teams: 4,
    positions: 11,
    people: 9,
  },
  {
    id: "t3",
    name: "Second service",
    type: "service",
    day: "Sun, Oct 11",
    start: "11:00 AM",
    end: "12:15 PM",
    teams: 4,
    positions: 11,
    people: 9,
  },
];

export const songs: readonly DemoSong[] = [
  {
    id: "s1",
    title: "Morning Light",
    writers: "Ava Linden and Sam Okafor",
    lastScheduled: "Sep 27, 2026",
    daysSincePlayed: 14,
    arrangement: "Radio version",
    keys: ["G", "A", "F"],
  },
  {
    id: "s2",
    title: "Steady Ground",
    writers: "Noor Hadley",
    lastScheduled: "Sep 20, 2026",
    daysSincePlayed: 21,
    arrangement: "Acoustic",
    keys: ["D", "Eb", "F"],
  },
  {
    id: "s3",
    title: "Open Doors",
    writers: "Beck Marlow, Ines Calder, and Tobias Reed",
    lastScheduled: "Sep 13, 2026",
    daysSincePlayed: 28,
    arrangement: "Default",
    keys: ["D", "E", "F"],
  },
  {
    id: "s4",
    title: "Here With Us",
    writers: "Maren Voss",
    lastScheduled: "Sep 6, 2026",
    daysSincePlayed: 35,
    arrangement: "Default",
    keys: ["C", "D"],
  },
  {
    id: "s5",
    title: "Lantern Hill",
    writers: "Ines Calder and Jonah Pryce",
    lastScheduled: "Aug 30, 2026",
    daysSincePlayed: 42,
    arrangement: "Default",
    keys: ["A", "Bb", "B"],
  },
  {
    id: "s6",
    title: "Wide Open Sky",
    writers: "Sam Okafor",
    lastScheduled: "Aug 16, 2026",
    daysSincePlayed: 56,
    arrangement: "Default",
    keys: ["C", "D"],
  },
  {
    id: "s7",
    title: "Hold the Line",
    writers: "Tobias Reed and Noor Hadley",
    lastScheduled: "Jul 26, 2026",
    daysSincePlayed: 77,
    arrangement: "Default",
    keys: ["E", "F#"],
  },
  {
    id: "s8",
    title: "Every Morning New",
    writers: "Ava Linden",
    lastScheduled: "Jul 5, 2026",
    daysSincePlayed: 98,
    arrangement: "Default",
    keys: ["G", "A"],
  },
  {
    id: "s9",
    title: "Quiet Harbor",
    writers: "Maren Voss and Jonah Pryce",
    lastScheduled: "Mar 8, 2026",
    daysSincePlayed: 217,
    arrangement: "Default",
    keys: ["Bb", "C"],
  },
  {
    id: "s10",
    title: "Lamp Unto My Feet",
    writers: "Beck Marlow",
    lastScheduled: "Aug 17, 2025",
    daysSincePlayed: 420,
    arrangement: "Default",
    keys: ["E", "D"],
  },
];

export interface DemoChordChart {
  /** The key the chords are written in. */
  readonly key: string;
  readonly bpm: number;
  readonly meter: string;
  /** Planning Center's Lyrics & Chords text: inline `[G]` chords and section headings. */
  readonly chart: string;
}

/** Original sample charts, in Planning Center's chord chart format. */
export const chordCharts = new Map<string, DemoChordChart>([
  [
    "s1",
    {
      key: "G",
      bpm: 72,
      meter: "4/4",
      chart: [
        "INTRO",
        "G / / / | C / / / | Em / D / |",
        "",
        "VERSE 1",
        "[G]Morning light on the [C]hills again",
        "[Em]Mercy new as the [D]day begins",
        "[G]Every shadow is [C]giving way",
        "[Em]You are [D]faithful, [G]faithful",
        "",
        "CHORUS",
        "[C]Lift our [G]eyes, lift our [D]hearts to You",
        "[Em]All we [C]need, You have [D]carried through",
        "[C]Morning [G]light, You are [D/F#]breaking [Em]in",
        "[C]Here we [D]stand and we sing a[G]gain",
        "",
        "BRIDGE",
        "[Em]Over the [C]valley, [G]over the [D]sea",
        "[Em]Your love is [C]calling, [D]calling to me",
      ].join("\n"),
    },
  ],
  [
    "s2",
    {
      key: "D",
      bpm: 68,
      meter: "6/8",
      chart: [
        "VERSE 1",
        "[D]When the storm is [G]loud",
        "[Bm]You are steady [A]ground",
        "[D]When the night is [G]long",
        "[Bm]You are [A]holding [D]on",
        "",
        "CHORUS",
        "[G]Here I [D]stand, here I [A]stay",
        "[Bm]On the [G]rock that won't [A]move away",
      ].join("\n"),
    },
  ],
]);
