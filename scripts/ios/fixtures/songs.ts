import type { ChordChartLayout } from "../../../packages/contracts/src/chord-charts";
import { at } from "./time";

/**
 * The church's song library. Titles, writers, and lyrics are invented for the fixtures; the
 * four songs on the showcase plan are the marketing replica's.
 */

export interface KeySeed {
  readonly id: string;
  /** Planning Center's key name, often whose key it is. */
  readonly name: string;
  readonly startingKey: string;
  readonly endingKey: string | null;
}

export interface ArrangementSeed {
  readonly id: string;
  readonly name: string;
  readonly bpm: number | null;
  readonly meter: string | null;
  /** Seconds. */
  readonly length: number;
  readonly sequence: readonly string[];
  readonly archivedAt: Date | null;
  readonly keys: readonly KeySeed[];
  /** Lyrics & Chords text; empty when no chart has been written yet. */
  readonly chart: string;
  readonly chartKey: string | null;
  readonly layout: ChordChartLayout;
  readonly updatedAt: string | null;
}

export type SongSeason = "advent" | "thanksgiving" | "easter";

export interface SongSeed {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly themes: string;
  readonly createdAt: Date | null;
  readonly hidden: boolean;
  readonly arrangements: readonly ArrangementSeed[];
  /** Weeks between Sunday plays in the generated rotation; absent for songs out of it. */
  readonly rotationWeeks?: number;
  readonly season?: SongSeason;
  /** Last scheduled before the generated plans begin, for songs the rotation never picks. */
  readonly lastScheduledBefore?: Date | null;
}

const LAYOUT: ChordChartLayout = {
  font: "Helvetica",
  fontSize: 14,
  columns: 2,
  chordColor: 1,
  pageSize: "Letter",
  orientation: "Portrait",
  margin: "0.5in",
};

const UNSET_LAYOUT: ChordChartLayout = {
  font: null,
  fontSize: null,
  columns: null,
  chordColor: null,
  pageSize: null,
  orientation: null,
  margin: null,
};

const STANDARD_SEQUENCE = [
  "Intro",
  "Verse 1",
  "Chorus",
  "Verse 2",
  "Chorus",
  "Bridge",
  "Chorus",
  "Outro",
] as const;

const SHORT_SEQUENCE = ["Verse 1", "Chorus", "Verse 2", "Chorus"] as const;

interface ArrangementInput {
  readonly name?: string;
  readonly bpm: number | null;
  readonly meter?: string | null;
  readonly length: number;
  readonly sequence?: readonly string[];
  /** Day the arrangement was archived. */
  readonly archivedOn?: string;
  readonly keys: readonly (readonly [
    name: string,
    start: string,
    end?: string,
  ])[];
  readonly chart?: string;
  readonly layout?: ChordChartLayout;
  readonly updatedAt?: string | null;
}

interface SongInput {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly themes: string;
  readonly createdAt: string | null;
  readonly hidden?: boolean;
  readonly rotationWeeks?: number;
  readonly season?: SongSeason;
  readonly lastScheduledBefore?: string | null;
  readonly arrangements: readonly ArrangementInput[];
}

/** A Sunday morning before the generated plans, or the absent or null day as it is. */
const scheduledOn = (
  day: string | null | undefined
): Date | null | undefined => {
  if (day === null || day === undefined) {
    return day;
  }
  return at(day, "09:00");
};

const song = (input: SongInput): SongSeed => ({
  id: input.id,
  title: input.title,
  author: input.author,
  themes: input.themes,
  createdAt: input.createdAt === null ? null : at(input.createdAt, "10:30"),
  hidden: input.hidden ?? false,
  rotationWeeks: input.rotationWeeks,
  season: input.season,
  lastScheduledBefore: scheduledOn(input.lastScheduledBefore),
  arrangements: input.arrangements.map((arrangement, index) => {
    const id = `${input.id}${index + 1}`;
    const chart = arrangement.chart ?? "";
    return {
      id,
      name: arrangement.name ?? "Default Arrangement",
      bpm: arrangement.bpm,
      meter: arrangement.meter ?? "4/4",
      length: arrangement.length,
      sequence: arrangement.sequence ?? STANDARD_SEQUENCE,
      archivedAt:
        arrangement.archivedOn === undefined
          ? null
          : at(arrangement.archivedOn, "12:00"),
      keys: arrangement.keys.map(([name, start, end], keyIndex) => ({
        id: `${id}${keyIndex + 1}`,
        name,
        startingKey: start,
        endingKey: end ?? null,
      })),
      chart,
      chartKey: chart === "" ? null : (arrangement.keys[0]?.[1] ?? null),
      layout: arrangement.layout ?? (chart === "" ? UNSET_LAYOUT : LAYOUT),
      updatedAt:
        arrangement.updatedAt === undefined
          ? "2026-09-18T21:04:11Z"
          : arrangement.updatedAt,
    };
  }),
});

const lines = (...text: string[]) => text.join("\n");

export const SHOWCASE_SONG_ID = "5501";

export const songs: readonly SongSeed[] = [
  song({
    id: SHOWCASE_SONG_ID,
    title: "Morning Light",
    author: "Maya Ellison and Theo Park",
    themes: "Praise, Morning, Resurrection",
    createdAt: "2023-02-11",
    rotationWeeks: 5,
    arrangements: [
      {
        bpm: 74,
        length: 300,
        keys: [
          ["Original", "G"],
          ["Jordan's key", "A"],
        ],
        chart: lines(
          "VERSE 1",
          "[G]Morning light is [C]breaking through",
          "[Em]Every shadow [D]bows to You",
          "[G]All the earth wakes [C]up to sing",
          "[Em]Glory to the [D]risen King",
          "",
          "CHORUS",
          "[C]Rise, my [G]soul, and [D]sing",
          "[Em]You are [C]everything",
          "[G]Morning [D]light, You [Em]make all [C]things new",
          "[G]I will [D]rise with [G]You",
          "",
          "VERSE 2",
          "[G]When the night was [C]long and cold",
          "[Em]You were near, You [D]held my soul",
          "[G]Now the sun is [C]on my face",
          "[Em]I am standing [D]in Your grace",
          "",
          "BRIDGE",
          "[Em]Darkness [C]runs, the [G]dawn has [D]come",
          "[Em]Death has [C]lost, the [G]King has [D]won"
        ),
        updatedAt: "2026-09-24T03:12:45Z",
      },
      {
        name: "2019 Arrangement",
        bpm: 70,
        length: 330,
        archivedOn: "2024-01-08",
        keys: [["Original", "F"]],
      },
    ],
  }),
  song({
    id: "5502",
    title: "Steady Ground",
    author: "Grace Whitfield",
    themes: "Faith, Trust, Storms",
    createdAt: "2024-05-19",
    rotationWeeks: 4,
    arrangements: [
      {
        bpm: 68,
        meter: "6/8",
        length: 360,
        keys: [
          ["Original", "D"],
          ["Low", "C"],
        ],
        chart: lines(
          "VERSE 1",
          "[D]When the storms come [G]rolling in",
          "[Bm]And the waves rise [A]up again",
          "[D]I will stand on [G]steady ground",
          "[Bm]You will never [A]let me down",
          "",
          "CHORUS",
          "[G]Steady [D]ground, my [A]feet are [Bm]found",
          "[G]On the [D]rock that [A]holds me [D]now",
          "[G]Every [D]fear is [A]settled [Bm]down",
          "[G]You are my [A]steady [D]ground",
          "",
          "VERSE 2",
          "[D]When the night is [G]closing in",
          "[Bm]And I can't see [A]where to begin",
          "[D]You are faithful, [G]You are sure",
          "[Bm]Love that holds for[A]evermore"
        ),
      },
    ],
  }),
  song({
    id: "5503",
    title: "Open Doors",
    author: "Caleb Rhodes and Maya Ellison",
    themes: "Invitation, Mission, Hospitality",
    createdAt: "2025-03-02",
    rotationWeeks: 5,
    arrangements: [
      {
        bpm: 128,
        length: 300,
        keys: [
          ["Original", "A", "B"],
          ["Low", "G", "A"],
        ],
        chart: lines(
          "VERSE 1",
          "[A]You set a table [E]for the lonely",
          "[F#m]You call the stranger [D]by their name",
          "[A]The door is open, [E]come and see it",
          "[F#m]Nobody leaves the [D]way they came",
          "",
          "CHORUS",
          "[A]Open doors, open [E]arms",
          "[F#m]Come as you [D]are",
          "[A]There is room at the [E]table",
          "[D]Room in Your [E]heart",
          "",
          "BRIDGE",
          "[D]Come in, come [E]in",
          "[F#m]There's a place for [A]you",
          "[D]Come in, come [E]in",
          "[F#m]Grace is coming [E]through",
          "",
          "CHORUS (KEY OF B)",
          "[B]Open doors, open [F#]arms",
          "[G#m]Come as you [E]are",
          "[B]There is room at the [F#]table",
          "[E]Room in Your [F#]heart"
        ),
      },
    ],
  }),
  song({
    id: "5504",
    title: "Here With Us",
    author: "Lena Ortiz",
    themes: "Presence, Communion",
    createdAt: "2022-10-30",
    rotationWeeks: 4,
    arrangements: [
      {
        bpm: 64,
        length: 240,
        sequence: SHORT_SEQUENCE,
        keys: [
          ["Original", "E"],
          ["Riley", "D"],
        ],
        chart: lines(
          "VERSE 1",
          "[E]Quiet now, the [A]room is still",
          "[C#m]Hearts are open, [B]waiting here",
          "[E]You are closer [A]than our breath",
          "[C#m]Here with us, [B]You draw near",
          "",
          "CHORUS",
          "[A]Here with [E]us, [B]here with [C#m]us",
          "[A]Bread and [E]cup, a [B]table [E]set for us",
          "[A]Here with [E]us, [B]here with [C#m]us",
          "[A]Every [B]one of [E]us"
        ),
      },
      {
        name: "Keys Only",
        bpm: 60,
        length: 270,
        sequence: SHORT_SEQUENCE,
        keys: [["Original", "E"]],
      },
    ],
  }),
  song({
    id: "5505",
    title: "Harbor of Mercy",
    author: "Samuel Achebe",
    themes: "Grace, Rest",
    createdAt: "2021-06-06",
    rotationWeeks: 9,
    arrangements: [
      {
        bpm: 72,
        meter: "3/4",
        length: 330,
        keys: [["Original", "C"]],
        chart: lines(
          "VERSE 1",
          "[C]Tired and tossed by the [F]wind and the [C]sea",
          "[Am]Your mercy [F]comes looking for [G]me",
          "",
          "CHORUS",
          "[F]Harbor of [C]mercy, [G]safe in Your [Am]arms",
          "[F]Anchored in [C]love, [G]held through the [C]storm"
        ),
      },
    ],
  }),
  song({
    id: "5506",
    title: "Wide as the Sky",
    author: "Theo Park",
    themes: "Love, Creation",
    createdAt: "2024-01-14",
    rotationWeeks: 6,
    arrangements: [
      {
        bpm: 82,
        length: 285,
        keys: [
          ["Original", "Bb"],
          ["Jordan's key", "C"],
        ],
        chart: lines(
          "VERSE 1",
          "[Bb]Higher than the [Eb]mountains rise",
          "[Gm]Deeper than the [F]ocean wide",
          "",
          "CHORUS",
          "[Eb]Your love is [Bb]wide as the [F]sky",
          "[Gm]Older than [Eb]time, [F]newer than [Bb]light"
        ),
      },
    ],
  }),
  song({
    id: "5507",
    title: "Lanterns",
    author: "Iris Calder",
    themes: "Hope, Light, Waiting",
    createdAt: "2023-09-03",
    rotationWeeks: 6,
    arrangements: [
      {
        bpm: 70,
        length: 315,
        keys: [["Original", "F"]],
        chart: lines(
          "VERSE 1",
          "[F]We hold our lanterns [Bb]in the dark",
          "[Dm]A little light for [C]every heart",
          "",
          "CHORUS",
          "[Bb]Shine on, [F]shine on",
          "[Dm]Till the [C]morning comes"
        ),
      },
    ],
  }),
  song({
    id: "5508",
    title: "Evergreen",
    author: "Noah Whitfield and Grace Whitfield",
    themes: "Faithfulness, Seasons",
    createdAt: "2025-08-24",
    rotationWeeks: 5,
    arrangements: [
      {
        bpm: 76,
        length: 270,
        keys: [
          ["Original", "D"],
          ["Morgan", "E"],
        ],
        chart: lines(
          "VERSE 1",
          "[D]Leaves may fall and [G]winter come",
          "[Bm]Your love is [A]evergreen"
        ),
      },
    ],
  }),
  song({
    id: "5509",
    title: "Kingdom Come Slowly",
    author: "Ruth Okafor",
    themes: "Kingdom, Patience",
    createdAt: "2022-04-17",
    rotationWeeks: 10,
    arrangements: [{ bpm: 66, length: 370, keys: [["Original", "E"]] }],
  }),
  song({
    id: "5510",
    title: "All the Way Home",
    author: "Caleb Rhodes",
    themes: "Hope, Journey",
    createdAt: "2023-11-12",
    rotationWeeks: 7,
    arrangements: [{ bpm: 118, length: 260, keys: [["Original", "G"]] }],
  }),
  song({
    id: "5511",
    title: "River Song",
    author: "Lena Ortiz",
    themes: "Renewal, Baptism",
    createdAt: "2024-07-21",
    rotationWeeks: 12,
    arrangements: [
      {
        bpm: 92,
        meter: "6/8",
        length: 290,
        keys: [["Original", "A"]],
        chart: lines(
          "VERSE 1",
          "[A]Down to the river, [D]down to the water",
          "[F#m]Come and be [E]new"
        ),
      },
    ],
  }),
  song({
    id: "5512",
    title: "Table of Plenty",
    author: "Samuel Achebe and Iris Calder",
    themes: "Communion, Thanksgiving",
    createdAt: "2025-10-05",
    rotationWeeks: 12,
    arrangements: [{ bpm: 80, length: 300, keys: [["Original", "C"]] }],
  }),
  song({
    id: "5513",
    title: "Every Breath",
    author: "Maya Ellison",
    themes: "Worship, Surrender",
    createdAt: "2024-02-25",
    rotationWeeks: 6,
    arrangements: [
      {
        bpm: 72,
        length: 340,
        keys: [
          ["Original", "B"],
          ["Low", "A"],
        ],
      },
    ],
  }),
  song({
    id: "5514",
    title: "Old Stone Hymn",
    author: "Traditional, arranged by Theo Park",
    themes: "Hymn, Faith",
    createdAt: "2020-09-13",
    rotationWeeks: 14,
    arrangements: [
      { bpm: 88, meter: "3/4", length: 240, keys: [["Original", "Eb"]] },
    ],
  }),
  song({
    id: "5515",
    title: "Bright City",
    author: "Ruth Okafor",
    themes: "Heaven, Joy, Easter",
    createdAt: "2023-03-26",
    season: "easter",
    arrangements: [{ bpm: 132, length: 230, keys: [["Original", "A"]] }],
  }),
  song({
    id: "5516",
    title: "Shepherd of My Days",
    author: "Grace Whitfield",
    themes: "Guidance, Psalms",
    createdAt: "2024-10-06",
    rotationWeeks: 8,
    arrangements: [{ bpm: 62, length: 320, keys: [["Original", "D"]] }],
  }),
  song({
    id: "5517",
    title: "Light the Way",
    author: "Noah Whitfield",
    themes: "Guidance, Advent",
    createdAt: "2022-11-20",
    season: "advent",
    arrangements: [{ bpm: 74, length: 280, keys: [["Original", "F"]] }],
  }),
  song({
    id: "5518",
    title: "Thankful Heart",
    author: "Iris Calder",
    themes: "Thanksgiving, Gratitude",
    createdAt: "2021-11-14",
    season: "thanksgiving",
    arrangements: [{ bpm: 96, length: 225, keys: [["Original", "G"]] }],
  }),
  song({
    id: "5519",
    title: "Rest for the Weary",
    author: "Traditional, arranged by Lena Ortiz",
    themes: "Hymn, Rest",
    createdAt: "2020-02-09",
    rotationWeeks: 16,
    arrangements: [
      { bpm: 70, meter: "3/4", length: 250, keys: [["Original", "E"]] },
    ],
  }),
  song({
    id: "5520",
    title: "Unshaken",
    author: "Caleb Rhodes",
    themes: "Strength, Courage",
    createdAt: "2025-01-19",
    rotationWeeks: 7,
    arrangements: [{ bpm: 140, length: 245, keys: [["Original", "B"]] }],
  }),
  song({
    id: "5521",
    title: "Still Small Voice",
    author: "Maya Ellison",
    themes: "Prayer, Listening",
    createdAt: "2025-06-01",
    rotationWeeks: 9,
    arrangements: [{ bpm: 60, length: 350, keys: [["Original", "Db"]] }],
  }),
  song({
    id: "5522",
    title: "Waiting Season",
    author: "Theo Park",
    themes: "Advent, Hope",
    createdAt: "2024-11-24",
    season: "advent",
    arrangements: [{ bpm: 68, length: 310, keys: [["Original", "C"]] }],
  }),
  song({
    id: "5523",
    title: "Songs in the Night",
    author: "Ruth Okafor",
    themes: "Lament, Hope",
    createdAt: "2023-07-09",
    rotationWeeks: 13,
    arrangements: [{ bpm: 76, length: 270, keys: [["Original", "G"]] }],
  }),
  song({
    id: "5524",
    title: "Glory Rising",
    author: "Samuel Achebe",
    themes: "Praise, Easter",
    createdAt: "2024-03-31",
    rotationWeeks: 6,
    arrangements: [{ bpm: 124, length: 255, keys: [["Original", "A"]] }],
  }),
  song({
    id: "5525",
    title: "Gathered Here",
    author: "Lena Ortiz and Caleb Rhodes",
    themes: "Gathering, Call to Worship",
    createdAt: "2025-09-07",
    rotationWeeks: 5,
    arrangements: [{ bpm: 110, length: 210, keys: [["Original", "G"]] }],
  }),
  song({
    id: "5526",
    title: "Benediction Song",
    author: "Grace Whitfield",
    themes: "Blessing, Sending",
    createdAt: "2023-05-21",
    rotationWeeks: 8,
    arrangements: [{ bpm: 72, length: 200, keys: [["Original", "D"]] }],
  }),
  song({
    id: "5527",
    title: "Brighter",
    author: "Northbound Collective",
    themes: "Joy, Youth",
    createdAt: "2025-08-31",
    arrangements: [{ bpm: 128, length: 220, keys: [["Original", "E"]] }],
  }),
  song({
    id: "5528",
    title: "Undivided",
    author: "Northbound Collective",
    themes: "Unity, Youth",
    createdAt: "2025-08-31",
    arrangements: [{ bpm: 120, length: 235, keys: [["Original", "A"]] }],
  }),
  song({
    id: "5529",
    title: "Hallelujah Road",
    author: "Iris Calder",
    themes: "Journey, Praise",
    createdAt: "2022-08-14",
    arrangements: [{ bpm: 100, length: 250, keys: [["Original", "D"]] }],
  }),
  song({
    id: "5530",
    title: "Mountains Move",
    author: "Caleb Rhodes",
    themes: "Faith, Prayer",
    createdAt: "2021-01-24",
    lastScheduledBefore: "2025-02-16",
    arrangements: [{ bpm: 84, length: 280, keys: [["Original", "C"]] }],
  }),
  song({
    id: "5531",
    title: "Into the Quiet",
    author: "Iris Calder",
    themes: "Rest, Prayer",
    createdAt: "2019-10-06",
    lastScheduledBefore: "2024-03-10",
    arrangements: [{ bpm: 58, length: 330, keys: [["Original", "E"]] }],
  }),
  song({
    id: "5532",
    title: "Sound of Many Waters",
    author: "Ruth Okafor",
    themes: "Majesty, Revelation",
    createdAt: "2019-03-17",
    lastScheduledBefore: "2023-11-05",
    arrangements: [{ bpm: 78, length: 300, keys: [["Original", "D"]] }],
  }),
  song({
    id: "5533",
    title: "Morning Prayer Chant",
    author: "Traditional",
    themes: "Prayer, Liturgy",
    createdAt: "2019-05-14",
    lastScheduledBefore: null,
    arrangements: [
      { bpm: null, meter: null, length: 180, keys: [["Original", "D"]] },
    ],
  }),
  song({
    id: "5534",
    title: "A New Morning",
    author: "Theo Park",
    themes: "Renewal",
    createdAt: "2026-09-20",
    lastScheduledBefore: null,
    arrangements: [
      { bpm: 90, length: 240, keys: [["Original", "G"]], updatedAt: null },
    ],
  }),
  song({
    id: "5535",
    title: "Old Christmas Medley",
    author: "Traditional",
    themes: "Christmas",
    createdAt: "2018-12-02",
    hidden: true,
    lastScheduledBefore: "2023-12-24",
    arrangements: [
      { bpm: 96, meter: "3/4", length: 420, keys: [["Original", "G"]] },
    ],
  }),
];

export const songById = (songId: string): SongSeed => {
  const found = songs.find(({ id }) => id === songId);
  if (found === undefined) {
    throw new Error(`Unknown song ${songId}`);
  }
  return found;
};

export const songByTitle = (title: string): SongSeed => {
  const found = songs.find((seed) => seed.title === title);
  if (found === undefined) {
    throw new Error(`Unknown song ${title}`);
  }
  return found;
};

/** The arrangement the rotation plays: the first one that is not archived. */
export const liveArrangement = (seed: SongSeed): ArrangementSeed => {
  const arrangement =
    seed.arrangements.find(({ archivedAt }) => archivedAt === null) ??
    seed.arrangements[0];
  if (arrangement === undefined) {
    throw new Error(`${seed.title} has no arrangement`);
  }
  return arrangement;
};

export const songLayouts = (seed: SongSeed) => [
  { id: `${seed.id}01`, name: "Default Layout" },
  { id: `${seed.id}02`, name: "Acoustic Set" },
];

const CHORD_PATTERN = /\[[^\]]*\]/gu;

/** What Services derives as lyrics: the chart with its chords taken out. */
export const lyricsFromChart = (chart: string): string =>
  chart
    .split("\n")
    .map((line) => line.replaceAll(CHORD_PATTERN, "").trimEnd())
    .join("\n");
