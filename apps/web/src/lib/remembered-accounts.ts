import { z } from "zod";

import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

/**
 * Accounts that signed in on this device, shown as quick picks on the sign-in
 * page. Only display details are kept; signing in always goes through
 * Planning Center, so nothing here grants access.
 */
export const REMEMBERED_ACCOUNTS_KEY = "pcobooster:remembered-accounts";

export const MAX_REMEMBERED_ACCOUNTS = 4;

const rememberedAccountSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  organizationName: z.string().nullable(),
  lastSignedInAt: z.number(),
});

export type RememberedAccount = z.infer<typeof rememberedAccountSchema>;

const rememberedAccountsSchema = z.array(rememberedAccountSchema);

export const parseRememberedAccounts = (
  raw: string | null
): RememberedAccount[] => {
  if (raw === null) {
    return [];
  }
  try {
    const parsed = rememberedAccountsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

/** Moves `account` to the front, replacing its older entry, and caps the list. */
export const upsertRememberedAccount = (
  accounts: readonly RememberedAccount[],
  account: RememberedAccount
): RememberedAccount[] =>
  [
    account,
    ...accounts.filter((existing) => existing.userId !== account.userId),
  ].slice(0, MAX_REMEMBERED_ACCOUNTS);

export const removeRememberedAccount = (
  accounts: readonly RememberedAccount[],
  userId: string
): RememberedAccount[] =>
  accounts.filter((account) => account.userId !== userId);

export const rememberAccount = (account: RememberedAccount): void => {
  const current = parseRememberedAccounts(
    readBrowserStorage(REMEMBERED_ACCOUNTS_KEY)
  );
  writeBrowserStorage(
    REMEMBERED_ACCOUNTS_KEY,
    JSON.stringify(upsertRememberedAccount(current, account))
  );
};

export const forgetRememberedAccount = (userId: string): void => {
  const current = parseRememberedAccounts(
    readBrowserStorage(REMEMBERED_ACCOUNTS_KEY)
  );
  const next = removeRememberedAccount(current, userId);
  writeBrowserStorage(
    REMEMBERED_ACCOUNTS_KEY,
    next.length === 0 ? null : JSON.stringify(next)
  );
};
