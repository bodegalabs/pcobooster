import { describe, expect, it } from "vitest";

import type { StoredSession } from "./protocol";
import { removeRememberedAccount } from "./remove-account";

const session: StoredSession = {
  activeUserId: "a",
  demoToken: null,
  accounts: [
    {
      token: "token-a",
      user: { id: "a", name: "A", email: "a@example.com", image: null },
      selectedAccountId: "org-a",
    },
    {
      token: "token-b",
      user: { id: "b", name: "B", email: "b@example.com", image: null },
      selectedAccountId: "org-b",
    },
  ],
};

describe("Native logout and remembered login removal", () => {
  it("persists logout before failed provider revocation and keeps another remembered login", async () => {
    let saved = session;
    await expect(
      removeRememberedAccount({
        session,
        userId: "a",
        persist: async (next) => {
          saved = next;
          await Promise.resolve();
        },
        revoke: async () => {
          expect(saved.activeUserId).toBeNull();
          await Promise.resolve();
          throw new Error("Network offline");
        },
      })
    ).rejects.toThrow("Network offline");
    expect(saved.accounts.map(({ user }) => user.id)).toStrictEqual(["b"]);
  });

  it("removes a remembered inactive login and revokes its token without switching the active organization", async () => {
    let saved = session;
    let revoked: string | undefined;
    await removeRememberedAccount({
      session,
      userId: "b",
      persist: async (next) => {
        saved = next;
        await Promise.resolve();
      },
      revoke: async (token) => {
        revoked = token;
        await Promise.resolve();
      },
    });
    expect(saved.activeUserId).toBe("a");
    expect(revoked).toBe("token-b");
    expect(saved.accounts[0]?.selectedAccountId).toBe("org-a");
  });
});
