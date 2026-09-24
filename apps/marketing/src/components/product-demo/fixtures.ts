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
  readonly positions: readonly DemoPosition[];
}

export interface DemoServed {
  /** Whole weeks before the plan being built. */
  readonly weeksAgo: number;
  readonly positionId: string;
  readonly rehearsal?: boolean;
}

export interface DemoPerson {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly positionIds: readonly string[];
  readonly served: readonly DemoServed[];
  readonly blockedOut?: boolean;
  readonly declined?: string;
}

export interface DemoAssignment {
  readonly personId: string;
  readonly status: SlotStatus;
}

export interface DemoPlanItem {
  readonly id: string;
  readonly title: string;
  readonly kind: "song" | "header" | "item";
  readonly detail?: string;
  readonly songKey?: string;
  readonly minutes: number;
}

export const plan = {
  serviceType: "Sunday Services",
  title: "Morning gathering",
  when: "This Sunday",
} as const;

export const teams: readonly DemoTeam[] = [
  {
    id: "band",
    name: "Band",
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
    positions: [
      { id: "lead", name: "Worship Leader", icon: "mic", slots: 1 },
      { id: "alto", name: "Alto", icon: "mic", slots: 2 },
      { id: "tenor", name: "Tenor", icon: "mic", slots: 1 },
    ],
  },
  {
    id: "production",
    name: "Production",
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
    positions: [
      { id: "coffee", name: "Coffee", icon: "coffee", slots: 2 },
      { id: "greeter", name: "Greeter", icon: "greeter", slots: 2 },
    ],
  },
];

const person = (
  id: string,
  name: string,
  positionIds: readonly string[],
  served: readonly DemoServed[],
  flags: Pick<DemoPerson, "blockedOut" | "declined"> = {}
): DemoPerson => {
  const [firstName = "", lastName = ""] = name.split(" ");
  return { id, firstName, lastName, positionIds, served, ...flags };
};

const weeks = (positionId: string, ...weeksAgo: number[]): DemoServed[] =>
  weeksAgo.map((weeksAgoValue) => ({ weeksAgo: weeksAgoValue, positionId }));

export const people: readonly DemoPerson[] = [
  person(
    "p01",
    "Taylor Lane",
    ["acoustic", "electric"],
    weeks("acoustic", 5, 9)
  ),
  person(
    "p02",
    "Hayden Collins",
    ["acoustic", "tenor"],
    [...weeks("acoustic", 4), ...weeks("tenor", 8)]
  ),
  person("p03", "Quinn Clark", ["acoustic"], weeks("acoustic", 2, 6)),
  person(
    "p04",
    "Frankie Turner",
    ["acoustic", "alto"],
    weeks("acoustic", 1, 2, 3)
  ),
  person("p05", "Robin Lane", ["acoustic", "keys"], weeks("keys", 3, 7), {
    blockedOut: true,
  }),
  person("p06", "Drew Scott", ["bass"], weeks("bass", 3, 7)),
  person("p07", "Kendall Evans", ["bass", "electric"], weeks("bass", 1, 2)),
  person("p08", "Lane Parker", ["drums"], weeks("drums", 2, 4, 6)),
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

export const planItems: readonly DemoPlanItem[] = [
  { id: "i1", title: "Pre-service", kind: "header", minutes: 0 },
  { id: "i2", title: "Countdown", kind: "item", detail: "Video", minutes: 5 },
  { id: "i3", title: "Worship", kind: "header", minutes: 0 },
  {
    id: "i4",
    title: "Morning Light",
    kind: "song",
    detail: "Full band",
    songKey: "G",
    minutes: 5,
  },
  {
    id: "i5",
    title: "Steady Ground",
    kind: "song",
    detail: "Acoustic intro",
    songKey: "D",
    minutes: 6,
  },
  {
    id: "i6",
    title: "Open Doors",
    kind: "song",
    detail: "Key change after bridge",
    songKey: "A",
    minutes: 5,
  },
  { id: "i7", title: "Welcome", kind: "item", detail: "Host", minutes: 4 },
  { id: "i8", title: "Message", kind: "header", minutes: 0 },
  { id: "i9", title: "Sermon", kind: "item", detail: "Pastor", minutes: 32 },
  {
    id: "i10",
    title: "Here With Us",
    kind: "song",
    detail: "Keys only",
    songKey: "E",
    minutes: 4,
  },
  { id: "i11", title: "Benediction", kind: "item", minutes: 2 },
];
