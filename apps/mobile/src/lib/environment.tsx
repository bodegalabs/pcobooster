import { createContext, useContext } from "react";

/** Used until `catalog.organization` answers, as the web's `PLANNING_CENTER_TIME_ZONE` fallback. */
export const FALLBACK_TIME_ZONE = "America/Los_Angeles";

/**
 * The congregation's IANA zone. Every congregation date is labeled in it, never the device zone
 * (Swift `\.orgTimeZone`).
 */
const OrgTimeZoneContext = createContext(FALLBACK_TIME_ZONE);

export const OrgTimeZoneProvider = OrgTimeZoneContext.Provider;

export const useOrgTimeZone = (): string => useContext(OrgTimeZoneContext);

/** "Now" for anything labeled relative to today. The fixture harness pins it. */
export interface AppClock {
  readonly now: () => Date;
}

const systemClock: AppClock = { now: () => new Date() };

const ClockContext = createContext<AppClock>(systemClock);

export const ClockProvider = ClockContext.Provider;

/** The app clock (Swift `\.appClock`): never read `new Date()` for relative labels. */
export const useClock = (): AppClock => useContext(ClockContext);
