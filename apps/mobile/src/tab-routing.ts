import { Schema } from "effect";
import type { Href } from "expo-router";

const groupNames = ["(services)", "(people)", "(songs)", "(search)"] as const;
const groupSchema = Schema.Literals(groupNames);
export type TabGroup = typeof groupSchema.Type;
let activeGroup: TabGroup = "(services)";
const planPath =
  /^\/services\/(?<serviceTypeId>[^/]+)\/plans\/(?<planId>[^/]+)(?:\/(?<action>assign))?\/?$/u;
const personPath = /^\/people\/(?<personId>[^/]+)\/?$/u;
const songPath = /^\/songs\/(?<songId>[^/]+)(?:\/(?<action>chart))?\/?$/u;
const placeholders = /\[(?<name>[^\]]+)\]/gu;

export const tabGroupFromSegments = (
  segments: readonly string[]
): TabGroup | undefined => {
  const group = segments.find((segment) => Schema.is(groupSchema)(segment));
  return Schema.is(groupSchema)(group) ? group : undefined;
};
export const rememberActiveTab = (segments: readonly string[]): void => {
  const group = tabGroupFromSegments(segments);
  if (group !== undefined) {
    activeGroup = group;
  }
};

const hrefUrl = (href: Href): URL => {
  if (Schema.is(Schema.String)(href)) {
    return new URL(href, "https://pcobooster.com");
  }
  const params = href.params ?? {};
  const path = href.pathname.replace(placeholders, (_, name: string) =>
    String(params[name] ?? "")
  );
  const url = new URL(path, "https://pcobooster.com");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
};

/** Explicit grouped destinations preserve the caller's tab stack while URLs stay canonical. */
export const withinTab = (href: Href, group: TabGroup = activeGroup): Href => {
  const url = hrefUrl(href);
  const query = Object.fromEntries(url.searchParams);
  const plan = planPath.exec(url.pathname)?.groups;
  if (plan?.serviceTypeId !== undefined && plan.planId !== undefined) {
    return {
      pathname:
        plan.action === "assign"
          ? `/(tabs)/${group}/services/[serviceTypeId]/plans/[planId]/assign`
          : `/(tabs)/${group}/services/[serviceTypeId]/plans/[planId]`,
      params: {
        ...query,
        serviceTypeId: plan.serviceTypeId,
        planId: plan.planId,
      },
    };
  }
  const person = personPath.exec(url.pathname)?.groups?.personId;
  if (person !== undefined) {
    return {
      pathname: `/(tabs)/${group}/people/[personId]`,
      params: { ...query, personId: person },
    };
  }
  const song = songPath.exec(url.pathname)?.groups;
  if (song?.songId !== undefined) {
    return {
      pathname:
        song.action === "chart"
          ? `/(tabs)/${group}/songs/[songId]/chart`
          : `/(tabs)/${group}/songs/[songId]`,
      params: { ...query, songId: song.songId },
    };
  }
  return href;
};
