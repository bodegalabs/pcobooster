const planSegmentPath =
  /^(?<plan>\/services\/[^/]+\/plans\/[^/]+)\/(?<section>overview|lineup|plan|times)\/?$/u;
const segmentLabels = new Map([
  ["overview", "Overview"],
  ["lineup", "Lineup"],
  ["plan", "Plan"],
  ["times", "Times"],
]);
const parseIntentUrl = (path: string): URL | null => {
  try {
    return new URL(path, "https://pcobooster.com");
  } catch {
    return null;
  }
};
/** Normalize both universal links and original native route paths without dropping query context. */
export const nativeIntentPath = (path: string): string => {
  const url = parseIntentUrl(path);
  if (url === null) {
    return "/";
  }
  const native =
    url.protocol === "pcobooster:" || url.protocol === "pcobooster-dev:";
  let pathname = url.pathname === "" ? "/" : url.pathname;
  if (native && url.hostname !== "") {
    pathname = `/${url.hostname}${url.pathname}`;
  }
  if (pathname.startsWith("/app/demo/")) {
    return `${pathname.slice(4)}${url.search}`;
  }
  const match = planSegmentPath.exec(pathname);
  if (match?.groups?.plan !== undefined && match.groups.section !== undefined) {
    url.searchParams.set(
      "segment",
      segmentLabels.get(match.groups.section) ?? "Overview"
    );
    return `${match.groups.plan}?${url.searchParams}`;
  }
  return `${pathname}${url.search}`;
};
