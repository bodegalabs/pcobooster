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
  accounts: Array<{
    id: string;
    identity: {
      name: string | null;
      organizationName: string | null;
    } | null;
  }>;
}

const DEFAULT_SUMMARY: AccountPanelSummary = {
  organizationName: "worshipadmin.com",
  avatarName: null,
  image: null,
};

export function summarizeAccountPanel(
  source: AccountPanelSource | null
): AccountPanelSummary {
  if (!source) return DEFAULT_SUMMARY;

  const selectedAccount = source.selectedAccountId
    ? (source.accounts.find(
        (account) => account.id === source.selectedAccountId
      ) ?? null)
    : (source.accounts[0] ?? null);

  return {
    organizationName:
      selectedAccount?.identity?.organizationName ||
      DEFAULT_SUMMARY.organizationName,
    avatarName:
      selectedAccount?.identity?.name ||
      source.session.name ||
      source.session.email ||
      null,
    image: source.session.image,
  };
}

export function parseCachedAccountPanel(
  raw: string | null
): AccountPanelSummary | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const value = parsed as Partial<AccountPanelSummary>;
    if (
      typeof value.organizationName !== "string" ||
      !value.organizationName.trim()
    ) {
      return null;
    }

    return {
      organizationName: value.organizationName,
      avatarName:
        typeof value.avatarName === "string" && value.avatarName.trim()
          ? value.avatarName
          : null,
      image:
        typeof value.image === "string" && value.image.trim()
          ? value.image
          : null,
    };
  } catch {
    return null;
  }
}

export function serializeAccountPanel(summary: AccountPanelSummary): string {
  return JSON.stringify(summary);
}
