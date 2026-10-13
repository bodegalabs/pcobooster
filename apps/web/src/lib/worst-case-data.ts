/**
 * Development only: rewrites the API's JSON answers with realistic worst-case text (long
 * hyphenated names, one-letter names, RTL, CJK, emoji, long team and song titles) so layouts can
 * be checked against data that wasn't chosen to look good. The swap happens at the fetch boundary,
 * before schema decoding, so every screen gets it through the same path as real data. Each
 * original value maps to the same replacement everywhere, and some originals are kept, so lists
 * read as a realistic mix. Toggled by `WorstCaseDataToggle`; never active in production builds.
 */
import { getInitials } from "@pcobooster/planning-center-models/initials";
import {
  isNonEmptyString,
  isNumber,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";
import { Option, Schema } from "effect";

import { clearAccountScopedCaches } from "@/lib/account-scoped-caches";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

export type DataMode = "demo" | "worst";

const DATA_MODE_KEY = "pcobooster:dev-data-mode";
const DATA_MODE_PARAM = "data";

const isDataMode = (value: string | null): value is DataMode =>
  value === "demo" || value === "worst";

export const readDataMode = (): DataMode => {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return "demo";
  }
  return readBrowserStorage(DATA_MODE_KEY) === "worst" ? "worst" : "demo";
};

/**
 * Runs at startup: `?data=worst` or `?data=demo` picks the mode, dropping answers saved under
 * the other one so its text never shows.
 */
export const applyDataModeFromUrl = (): void => {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }
  const requested = new URL(window.location.href).searchParams.get(
    DATA_MODE_PARAM
  );
  if (!isDataMode(requested) || requested === readDataMode()) {
    return;
  }
  clearAccountScopedCaches();
  writeBrowserStorage(DATA_MODE_KEY, requested);
};

/** Saved answers would keep the other mode's text, so switching drops them and reloads. */
export const switchDataMode = (mode: DataMode): void => {
  writeBrowserStorage(DATA_MODE_KEY, mode);
  clearAccountScopedCaches();
  const url = new URL(window.location.href);
  url.searchParams.set(DATA_MODE_PARAM, mode);
  window.location.replace(url);
};

interface WorstPerson {
  readonly firstName: string;
  readonly lastName: string;
}

const PEOPLE: readonly WorstPerson[] = [
  { firstName: "Aleksandra", lastName: "Wiśniewska-Kowalczyk" },
  { firstName: "Jo", lastName: "Li" },
  { firstName: "Christopher Alexander", lastName: "Montgomery III" },
  { firstName: "Đặng Thị Ngọc", lastName: "Hân" },
  { firstName: "J", lastName: "" },
  { firstName: "Konstantin", lastName: "Oberhauser-Wettstein" },
  { firstName: "نور الهدى", lastName: "عبد الرحمن" },
  { firstName: "秀英", lastName: "王" },
  { firstName: "Seán", lastName: "O'Brien-Ó Súilleabháin" },
  { firstName: "María José", lastName: "de la Cruz y Fernández" },
  { firstName: "🦊", lastName: "Fox" },
  { firstName: "Bartholomew", lastName: "Fitzgerald-Northwind" },
];

const LABELS: readonly string[] = [
  "Production & Technical Arts \u2014 Broadcast Director",
  "AV",
  "Kids Ministry Check-In Volunteers (Sunday 9:00 & 11:00)",
  "Lobpreisleitungsverantwortliche",
  "Lead Vocals / Worship Leader (Contemporary Service)",
  "Ő",
];

const SERVICE_TYPES: readonly string[] = [
  "Sunday Morning Contemporary Worship Gathering \u2014 North Campus",
  "Youth",
  "Christmas Eve Candlelight Services (5 PM, 7 PM, 11 PM)",
];

const TITLES: readonly string[] = [
  "Great Is Thy Faithfulness (Medley with Come Thou Fount of Every Blessing)",
  "Oceans",
  "How Great Thou Art \u2014 Hymn Arrangement in B\u266D with Extended Bridge & Tag",
  "Ő",
  "Ein feste Burg ist unser Gott",
  "Welcome, Announcements & Greeting Time (Hand Mics + Lower Thirds On Screen)",
];

const LONG_TEXT: readonly string[] = [
  "Out of town for my sister's wedding in Kraków, back the following Tuesday. Happy to swap with anyone for the 11:00 service.",
  "Sick",
];

const AUTHORS: readonly string[] = [
  "Matt Redman, Jonas Myrin, Chris Tomlin, Ed Cash, Jason Ingram, Brian Johnson, Jenn Johnson",
  "Traditional",
];

const STRING_TABLES = {
  teamName: LABELS,
  selectedTeamName: LABELS,
  positionName: LABELS,
  selectedPositionName: LABELS,
  teamPositionName: LABELS,
  serviceTypeName: SERVICE_TYPES,
  title: TITLES,
  planTitle: TITLES,
  seriesTitle: TITLES,
  arrangementName: [
    "Default Arrangement (Acoustic, Capo 3) \u2014 Christmas Eve Version",
    "1",
  ],
  author: AUTHORS,
  declineReason: LONG_TEXT,
  reason: LONG_TEXT,
  organizationName: [
    "First Presbyterian Church of Greater Northwind Valley Heights",
  ],
  email: ["bartholomew.fitzgerald@northwind-industries-holdings.example.com"],
  filename: [
    "Great Is Thy Faithfulness \u2014 Chord Chart FINAL (revised) v12 [Capo 3].pdf",
  ],
} satisfies Record<string, readonly string[]>;

// Built on use, not at module scope, so production builds can drop this module entirely.
const tableFor = (key: string): readonly string[] | undefined =>
  Object.entries(STRING_TABLES).find(([name]) => name === key)?.[1];

const HASH_MODULUS = 2_147_483_647;

/** A stable spread of strings over table slots; not for anything but picking fixtures. */
const hash = (value: string): number =>
  new TextEncoder()
    .encode(value)
    .reduce((result, byte) => (result * 31 + byte) % HASH_MODULUS, 7);

/** One slot past the table keeps the original, so real values stay in the mix. */
const pick = <Value>(table: readonly Value[], original: string): Value | null =>
  table[hash(original) % (table.length + 1)] ?? null;

const fullNameOf = ({ firstName, lastName }: WorstPerson): string =>
  `${firstName} ${lastName}`.trim();

const isJsonObject = (value: JsonValue): value is JsonObject =>
  !(
    value === null ||
    Array.isArray(value) ||
    isString(value) ||
    isNumber(value) ||
    value === true ||
    value === false
  );

const BROKEN_PHOTO_URL = "https://example.com/avatars/missing.png";
const PHOTO_KEYS = ["photoUrl", "photoThumbnailUrl"] as const;
const NAME_KEYS = ["fullName", "name", "senderName"] as const;

const PERSON_HINT_KEYS = [
  "firstName",
  "initials",
  "photoThumbnailUrl",
  "fullName",
] as const;

const personFor = (record: JsonObject): WorstPerson | null => {
  const identity = record.id ?? record.personId ?? record.name;
  return isString(identity) ? pick(PEOPLE, identity) : null;
};

const rewritePerson = (record: JsonObject, result: JsonObject): void => {
  const person = personFor(record);
  if (person === null) {
    return;
  }
  const fullName = fullNameOf(person);
  if (isString(record.firstName)) {
    result.firstName = person.firstName;
  }
  if (isString(record.lastName)) {
    result.lastName = person.lastName;
  }
  for (const key of NAME_KEYS) {
    if (isString(record[key])) {
      result[key] = fullName;
    }
  }
  if (isString(record.initials)) {
    result.initials = getInitials(fullName);
  }
  // Real photos show the real person, so each alias has no photo or one that 404s.
  const photo = hash(fullName) % 3 === 0 ? BROKEN_PHOTO_URL : null;
  for (const key of PHOTO_KEYS) {
    if (key in record) {
      result[key] = photo;
    }
  }
};

const rewrite = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(rewrite);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const result: JsonObject = {};
  for (const [key, field] of Object.entries(value)) {
    const table = tableFor(key);
    const replacement =
      table !== undefined && isNonEmptyString(field)
        ? pick(table, field)
        : null;
    result[key] = replacement ?? rewrite(field);
  }
  if (PERSON_HINT_KEYS.some((key) => key in value)) {
    rewritePerson(value, result);
  } else if (isNonEmptyString(value.name)) {
    result.name = pick(LABELS, value.name) ?? value.name;
  }
  return result;
};

/** Wraps fetch so successful `/api/v1` JSON answers carry the worst-case text. */
export const worstCaseFetch =
  (
    send: typeof globalThis.fetch
  ): ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  async (input, init) => {
    const response = await send(input, init);
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.origin
    );
    const isJson =
      response.headers.get("content-type")?.includes("json") ?? false;
    if (!(response.ok && isJson && url.pathname.startsWith("/api/v1/"))) {
      return response;
    }
    const body = Schema.decodeUnknownOption(Schema.MutableJson)(
      await response.json()
    );
    if (Option.isNone(body)) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return Response.json(rewrite(body.value), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
