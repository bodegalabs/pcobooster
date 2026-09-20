import {
  appendSelectedPlanningCenterAccountCookie,
  applyPrivateNoStore,
  serializeSelectedPlanningCenterAccountCookie,
} from "@worship-admin/api/transport/orpc/response-headers";
import { describe, expect, it } from "vitest";

describe("identity oRPC response headers", () => {
  it("serializes the selected-account cookie with the required production attributes", () => {
    expect(
      serializeSelectedPlanningCenterAccountCookie("account / one", true)
    ).toBe(
      "pco-selected-account-id=account%20%2F%20one; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/; Secure"
    );
  });

  it("adds private no-store and appends without replacing existing cookies", () => {
    const headers = new Headers({ "Set-Cookie": "existing=value; Path=/" });

    applyPrivateNoStore(headers);
    appendSelectedPlanningCenterAccountCookie(headers, "account-1");

    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("Set-Cookie")).toContain("existing=value; Path=/");
    expect(headers.get("Set-Cookie")).toContain(
      "pco-selected-account-id=account-1; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/"
    );
  });
});
