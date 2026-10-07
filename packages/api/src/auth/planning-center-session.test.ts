import {
  PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE,
  PLANNING_CENTER_SELECTED_ACCOUNT_HEADER,
  getSelectedPlanningCenterAccountId,
} from "@pcobooster/api/auth/planning-center-session";
import { describe, expect, it } from "vitest";

const request = (headers: Record<string, string>): Request =>
  new Request("https://pcobooster.com/api/v1/accounts", { headers });

describe(getSelectedPlanningCenterAccountId, () => {
  it("reads the browser's selection cookie", () => {
    expect(
      getSelectedPlanningCenterAccountId(
        request({ cookie: `${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=acct-1` })
      )
    ).toBe("acct-1");
  });

  it("reads a cookieless client's header before the cookie", () => {
    expect(
      getSelectedPlanningCenterAccountId(
        request({
          [PLANNING_CENTER_SELECTED_ACCOUNT_HEADER]: " acct-2 ",
          cookie: `${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=acct-1`,
        })
      )
    ).toBe("acct-2");
  });

  it("falls back to the cookie when the header is blank", () => {
    expect(
      getSelectedPlanningCenterAccountId(
        request({
          [PLANNING_CENTER_SELECTED_ACCOUNT_HEADER]: " ",
          cookie: `${PLANNING_CENTER_SELECTED_ACCOUNT_COOKIE}=acct-1`,
        })
      )
    ).toBe("acct-1");
    expect(getSelectedPlanningCenterAccountId(request({}))).toBeNull();
  });
});
