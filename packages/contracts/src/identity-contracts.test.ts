import {
  accountsSelectInputSchema,
  accountSwitchSchema,
  planningCenterAccountsSchema,
} from "@worship-admin/contracts/accounts";
import {
  adminAccountsResponseSchema,
  adminUserResponseSchema,
} from "@worship-admin/contracts/admin";
import { featureSchema } from "@worship-admin/contracts/features";
import { sessionStatusSchema } from "@worship-admin/contracts/session";
import { describe, expect, it } from "vitest";

const identity = {
  sub: "person-1",
  name: "A Person",
  email: null,
  organizationId: "organization-1",
  organizationName: "Organization",
};

const accountActivity = {
  userId: "user-1",
  name: "A Person",
  email: "person@example.com",
  image: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-19T00:00:00Z",
  linkedAccounts: 1,
  providers: ["planning-center"],
  activeSessions: 2,
  loginEvents: 3,
  loginEvents7d: 1,
  loginEvents30d: 2,
  signOutEvents: 0,
  activityEvents: 4,
  firstLoginAt: "2026-09-01T00:00:00Z",
  lastLoginAt: "2026-09-19T00:00:00Z",
  lastActivityAt: null,
};

describe("identity contracts", () => {
  it("retains the account panel view while excluding credential fields", () => {
    const panel = {
      session: {
        userId: "user-1",
        name: "A Person",
        email: "person@example.com",
        image: null,
      },
      selectedAccountId: "local-account-1",
      accounts: [
        {
          id: "local-account-1",
          providerId: "planning-center",
          updatedAt: "2026-09-19T00:00:00Z",
          identity,
        },
      ],
    };
    const withCredentials = {
      ...panel,
      session: { ...panel.session, token: "private-session-token" },
      accounts: panel.accounts.map((account) => ({
        ...account,
        accessToken: "private-access-token",
        refreshToken: "private-refresh-token",
      })),
    };

    expect(planningCenterAccountsSchema.parse(withCredentials)).toStrictEqual(
      panel
    );
    expect(
      planningCenterAccountsSchema.parse({
        ...panel,
        selectedAccountId: null,
        accounts: [],
      })
    ).toStrictEqual({ ...panel, selectedAccountId: null, accounts: [] });
    expect(
      planningCenterAccountsSchema.parse({
        ...panel,
        accounts: panel.accounts.map((account) => ({
          ...account,
          identity: null,
        })),
      }).accounts[0]?.identity
    ).toBeNull();
  });

  it("preserves admin activity totals and linked-account metadata without tokens", () => {
    const accounts = {
      email: "admin@example.com",
      accounts: [accountActivity],
    };
    const user = {
      ...accountActivity,
      linkedAccountDetails: [
        {
          id: "local-account-1",
          providerAccountId: "provider-account-1",
          providerId: "planning-center",
          createdAt: accountActivity.createdAt,
          updatedAt: accountActivity.updatedAt,
          scope: "people services",
          accessTokenExpiresAt: "2026-09-20T00:00:00Z",
          refreshTokenExpiresAt: null,
          activityEvents: 4,
          linkedEvents: 1,
          firstActivityAt: null,
          lastActivityAt: "2026-09-19T00:00:00Z",
          identity,
        },
      ],
    };

    expect(adminAccountsResponseSchema.parse(accounts)).toStrictEqual(accounts);
    expect(adminUserResponseSchema.parse({ user })).toStrictEqual({ user });
    expect(adminUserResponseSchema.parse({ user: null })).toStrictEqual({
      user: null,
    });
  });

  it("accepts anonymous and disabled results without requiring authentication", () => {
    expect(sessionStatusSchema.parse({ authenticated: false })).toStrictEqual({
      authenticated: false,
    });
    expect(featureSchema.parse({ enabled: false })).toStrictEqual({
      enabled: false,
    });
  });

  it("requires a selected local account identifier and successful selection output", () => {
    expect(
      accountsSelectInputSchema.safeParse({ accountId: " " }).success
    ).toBeFalsy();
    expect(
      accountsSelectInputSchema.parse({ accountId: "local-account-1" })
    ).toStrictEqual({ accountId: "local-account-1" });
    expect(
      accountSwitchSchema.safeParse({
        success: false,
        selectedAccountId: "local-account-1",
      }).success
    ).toBeFalsy();
  });
});
