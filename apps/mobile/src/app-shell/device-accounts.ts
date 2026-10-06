/** A person signed in on this device (Swift `DeviceAccount`). */
export interface DeviceAccount {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly organizationName: string | null;
  readonly lastUsedAt: Date;
  readonly token: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const JORDAN_LAST_USED_HOURS = 2;
const RILEY_LAST_USED_DAYS = 9;

/**
 * The mock session's remembered people (Swift `MockServices`): Jordan Hale, used 2 hours ago,
 * and Riley Brooks, 9 days ago.
 */
export const mockDeviceAccounts = (now: Date): DeviceAccount[] => [
  {
    userId: "usr_9f3c2a7d1e",
    name: "Jordan Hale",
    email: "jordan.hale@cedargrove.example",
    organizationName: "Cedar Grove Church",
    lastUsedAt: new Date(now.getTime() - JORDAN_LAST_USED_HOURS * HOUR_MS),
    token: "mock-session-jordan",
  },
  {
    userId: "usr_4b81d0c2aa",
    name: "Riley Brooks",
    email: "riley@northside.example",
    organizationName: "Northside Fellowship",
    lastUsedAt: new Date(now.getTime() - RILEY_LAST_USED_DAYS * DAY_MS),
    token: "mock-session-riley",
  },
];

/** The name to show, or the email when the name is blank. */
export const accountDisplayName = (account: DeviceAccount): string => {
  const name = account.name.trim();
  return name === "" ? account.email : name;
};

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86_400;
const WEEK_S = 604_800;
const MONTH_S = 2_592_000;
const YEAR_S = 31_536_000;

/** Unit names, and the word for one unit back where English has one ("yesterday"). */
const units = [
  { unit: "year", seconds: YEAR_S, previous: "last year" },
  { unit: "month", seconds: MONTH_S, previous: "last month" },
  { unit: "week", seconds: WEEK_S, previous: "last week" },
  { unit: "day", seconds: DAY_S, previous: "yesterday" },
  { unit: "hour", seconds: HOUR_S, previous: null },
  { unit: "minute", seconds: MINUTE_S, previous: null },
] as const;

/**
 * "2 hours ago", "yesterday", "last week": how recently this device used the account, like
 * `RelativeDateTimeFormatter` with named styles (Hermes has no `Intl.RelativeTimeFormat`).
 * Under an hour reads "just now".
 */
export const formatLastUsed = (lastUsedAt: Date, now: Date): string => {
  const elapsed = Math.max(0, (now.getTime() - lastUsedAt.getTime()) / 1000);
  if (elapsed < HOUR_S) {
    return "just now";
  }
  const match = units.find(({ seconds }) => elapsed >= seconds) ?? units[4];
  const count = Math.floor(elapsed / match.seconds);
  if (count === 1 && match.previous !== null) {
    return match.previous;
  }
  return `${count} ${match.unit}${count === 1 ? "" : "s"} ago`;
};

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

/** "Used 9d ago" style, compact: "Used today", "Used 3d ago", "Used 1w ago", "Used 2mo ago". */
export const formatUsedAgo = (lastUsedAt: Date, now: Date): string => {
  const days = Math.floor(
    Math.max(0, now.getTime() - lastUsedAt.getTime()) / DAY_MS
  );
  if (days === 0) {
    return "Used today";
  }
  if (days < DAYS_PER_WEEK) {
    return `Used ${days}d ago`;
  }
  if (days < DAYS_PER_MONTH) {
    return `Used ${Math.floor(days / DAYS_PER_WEEK)}w ago`;
  }
  if (days < DAYS_PER_YEAR) {
    return `Used ${Math.floor(days / DAYS_PER_MONTH)}mo ago`;
  }
  return `Used ${Math.floor(days / DAYS_PER_YEAR)}y ago`;
};
