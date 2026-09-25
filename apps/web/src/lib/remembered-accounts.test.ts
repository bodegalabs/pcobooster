import { describe, expect, it } from "vitest";

import {
  MAX_REMEMBERED_ACCOUNTS,
  parseRememberedAccounts,
  removeRememberedAccount,
  upsertRememberedAccount,
} from "@/lib/remembered-accounts";
import type { RememberedAccount } from "@/lib/remembered-accounts";

const account = (userId: string, lastSignedInAt = 1): RememberedAccount => ({
  userId,
  name: `User ${userId}`,
  email: `${userId}@example.com`,
  image: null,
  organizationName: "Grace Church",
  lastSignedInAt,
});

describe("remembered accounts", () => {
  it("ignores missing or malformed storage", () => {
    expect(parseRememberedAccounts(null)).toStrictEqual([]);
    expect(parseRememberedAccounts("not json")).toStrictEqual([]);
    expect(parseRememberedAccounts('[{"userId":1}]')).toStrictEqual([]);
  });

  it("round-trips a stored list", () => {
    const accounts = [account("a"), account("b")];
    expect(parseRememberedAccounts(JSON.stringify(accounts))).toStrictEqual(
      accounts
    );
  });

  it("moves a returning account to the front without duplicating it", () => {
    const next = upsertRememberedAccount(
      [account("a"), account("b")],
      account("b", 2)
    );
    expect(next.map((entry) => entry.userId)).toStrictEqual(["b", "a"]);
    expect(next[0]?.lastSignedInAt).toBe(2);
  });

  it("keeps only the most recent accounts", () => {
    let accounts: RememberedAccount[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) {
      accounts = upsertRememberedAccount(accounts, account(id));
    }
    expect(accounts).toHaveLength(MAX_REMEMBERED_ACCOUNTS);
    expect(accounts[0]?.userId).toBe("e");
    expect(accounts.some((entry) => entry.userId === "a")).toBeFalsy();
  });

  it("forgets one account", () => {
    expect(
      removeRememberedAccount([account("a"), account("b")], "a").map(
        (entry) => entry.userId
      )
    ).toStrictEqual(["b"]);
  });
});
