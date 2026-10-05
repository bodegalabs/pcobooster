import { nativeIntentPath } from "./native-intent";
import { tabRouter as router } from "./tab-router";

const planPath =
  /^\/services\/(?<serviceTypeId>[^/]+)\/plans\/(?<planId>[^/]+)\/?$/u;
export const openPlanLink = (path: string | undefined): void => {
  if (path === undefined) {
    return;
  }
  const url = new URL(nativeIntentPath(path), "https://pcobooster.com");
  const match = planPath.exec(url.pathname);
  const serviceTypeId = match?.groups?.serviceTypeId;
  const planId = match?.groups?.planId;
  if (serviceTypeId === undefined || planId === undefined) {
    return;
  }
  router.push({
    pathname: "/services/[serviceTypeId]/plans/[planId]",
    params: {
      serviceTypeId,
      planId,
      segment: url.searchParams.get("segment") ?? "Overview",
    },
  });
};
