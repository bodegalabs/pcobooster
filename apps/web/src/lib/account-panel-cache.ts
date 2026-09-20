import { z } from "zod";

export const ACCOUNT_PANEL_CACHE_KEY = "worshipadmin:account-panel";

export interface AccountPanelSummary {
  organizationName: string;
  avatarName: string | null;
  image: string | null;
}

export interface AccountPanelSource {
  session: {
    name: string;
    email: string;
    image: string | null;
  };
  selectedAccountId: string | null;
  accounts: {
    id: string;
    identity: {
      name: string | null;
      organizationName: string | null;
    } | null;
  }[];
}

const DEFAULT_SUMMARY: AccountPanelSummary = {
  organizationName: "worshipadmin.com",
  avatarName: null,
  image: null,
};

export const summarizeAccountPanel = (
  source: AccountPanelSource | null
): AccountPanelSummary => {
  if (source === null) {
    return DEFAULT_SUMMARY;
  }

  const selectedAccount =
    source.selectedAccountId !== null && source.selectedAccountId.length > 0
      ? (source.accounts.find(
          (account) => account.id === source.selectedAccountId
        ) ?? null)
      : (source.accounts[0] ?? null);
  const fallbackAvatarName =
    selectedAccount?.identity?.name ?? source.session.name;
  let avatarName: string | null = null;
  if (fallbackAvatarName.trim().length > 0) {
    avatarName = fallbackAvatarName;
  } else if (source.session.email.trim().length > 0) {
    avatarName = source.session.email;
  }

  return {
    organizationName:
      selectedAccount?.identity?.organizationName ??
      DEFAULT_SUMMARY.organizationName,
    avatarName,
    image: source.session.image,
  };
};

export const parseCachedAccountPanel = (
  raw: string | null
): AccountPanelSummary | null => {
  if (raw === null) {
    return null;
  }

  try {
    const nonEmptyString = z
      .string()
      .refine((value) => value.trim().length > 0);
    const parsed = z
      .object({
        organizationName: nonEmptyString,
        avatarName: nonEmptyString.nullable().optional(),
        image: nonEmptyString.nullable().optional(),
      })
      .safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data.organizationName.trim()) {
      return null;
    }

    return {
      organizationName: parsed.data.organizationName,
      avatarName: parsed.data.avatarName ?? null,
      image: parsed.data.image ?? null,
    };
  } catch {
    return null;
  }
};

export const serializeAccountPanel = (summary: AccountPanelSummary): string =>
  JSON.stringify(summary);
