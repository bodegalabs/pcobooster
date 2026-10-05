import { Schema } from "effect";
import type { Href } from "expo-router";

import { nativeIntentPath } from "../native-intent";
import type { TabGroup } from "../tab-routing";
import { withinTab } from "../tab-routing";

const protectedPath = /^\/(?:services|people|songs|search|account)(?:\/|$)/u;
const planPath =
  /^\/services\/(?<serviceTypeId>[^/]+)\/plans\/(?<planId>[^/]+)(?:\/(?<action>assign))?\/?$/u;
const personPath = /^\/people\/(?<personId>[^/]+)\/?$/u;
const songPath = /^\/songs\/(?<songId>[^/]+)(?:\/(?<action>chart))?\/?$/u;
const rootRoutes = new Map<string, Href>([
  ["/services", "/(tabs)/(services)/services"],
  ["/people", "/(tabs)/(people)/people"],
  ["/songs", "/(tabs)/(songs)/songs"],
  ["/search", "/(tabs)/(search)/search"],
  ["/account", "/account"],
]);
let pending: string | undefined;
let callerGroup: TabGroup | undefined;
export const isProtectedNativePath = (path: string): boolean =>
  protectedPath.test(path);
export const rememberNativeRoute = (
  path: string,
  params: Record<string, string | string[] | undefined>,
  group?: TabGroup
): void => {
  if (!isProtectedNativePath(path)) {
    return;
  }
  const url = new URL(path, "https://pcobooster.com");
  for (const key of [
    "segment",
    "month",
    "teamId",
    "positionId",
    "positionName",
    "source",
    "arrangementId",
  ]) {
    const value = params[key];
    if (Schema.is(Schema.String)(value)) {
      url.searchParams.set(key, value);
    }
  }
  pending = `${url.pathname}${url.search}`;
  callerGroup = group;
};
export const protectedNativeHref = (path: string): Href => {
  const url = new URL(nativeIntentPath(path), "https://pcobooster.com");
  const plan = planPath.exec(url.pathname)?.groups;
  if (plan?.serviceTypeId !== undefined && plan.planId !== undefined) {
    return {
      pathname:
        plan.action === "assign"
          ? "/services/[serviceTypeId]/plans/[planId]/assign"
          : "/services/[serviceTypeId]/plans/[planId]",
      params: {
        ...Object.fromEntries(url.searchParams),
        serviceTypeId: plan.serviceTypeId,
        planId: plan.planId,
        segment: url.searchParams.get("segment") ?? "Overview",
        teamId: url.searchParams.get("teamId") ?? "",
        positionId: url.searchParams.get("positionId") ?? "",
      },
    };
  }
  const person = personPath.exec(url.pathname)?.groups?.personId;
  if (person !== undefined) {
    return {
      pathname: "/people/[personId]",
      params: {
        personId: person,
        month: url.searchParams.get("month") ?? undefined,
      },
    };
  }
  const song = songPath.exec(url.pathname)?.groups;
  if (song?.songId !== undefined) {
    return {
      pathname:
        song.action === "chart" ? "/songs/[songId]/chart" : "/songs/[songId]",
      params: { ...Object.fromEntries(url.searchParams), songId: song.songId },
    };
  }
  return rootRoutes.get(url.pathname) ?? "/(tabs)/(services)/services";
};
const pendingGroup = (path: string) => {
  if (path.startsWith("/people")) {
    return "(people)";
  }
  if (path.startsWith("/songs")) {
    return "(songs)";
  }
  return "(services)";
};
export const pendingNativeRoute = (): Href =>
  pending === undefined
    ? "/(tabs)/(services)/services"
    : withinTab(
        protectedNativeHref(pending),
        callerGroup ?? pendingGroup(pending)
      );
export const clearNativeRoute = (): void => {
  pending = undefined;
  callerGroup = undefined;
};
export const consumeNativeRoute = (): Href => {
  const route = pendingNativeRoute();
  clearNativeRoute();
  return route;
};
