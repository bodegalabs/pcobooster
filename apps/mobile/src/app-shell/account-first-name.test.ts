import { describe, expect, it } from "vitest";

import { accountFirstName, mockDeviceAccounts } from "./device-accounts";

describe(accountFirstName, () => {
  it("uses email in welcome and expired-session copy when the name is blank", () => {
    const [account] = mockDeviceAccounts(new Date("2026-10-01T17:00:00Z"));
    if (account === undefined) {
      throw new Error("Expected a fixture account");
    }
    expect(accountFirstName({ ...account, name: "   " })).toBe(account.email);
    expect(accountFirstName(account)).toBe("Jordan");
  });
});
