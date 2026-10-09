import { Option, Schema } from "effect";

export const ACCOUNT_PANEL_CACHE_KEY = "pcobooster:account-panel";

export interface AccountPanelSummary {
  /** Null when Planning Center hasn't said which organization this is. */
  organizationName: string | null;
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

export const summarizeAccountPanel = (
  source: AccountPanelSource
): AccountPanelSummary => {
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
    organizationName: selectedAccount?.identity?.organizationName ?? null,
    avatarName,
    image: source.session.image,
  };
};

const nonBlankString = Schema.String.check(
  Schema.makeFilter((value: string) => value.trim().length > 0, {
    expected: "text that is not blank",
  })
);

const cachedAccountPanel = Schema.fromJsonString(
  Schema.Struct({
    organizationName: nonBlankString,
    avatarName: Schema.optional(Schema.NullOr(nonBlankString)),
    image: Schema.optional(Schema.NullOr(nonBlankString)),
  })
);
const decodeCachedAccountPanel = Schema.decodeUnknownOption(cachedAccountPanel);

export const parseCachedAccountPanel = (
  raw: string | null
): AccountPanelSummary | null => {
  if (raw === null) {
    return null;
  }

  const parsed = decodeCachedAccountPanel(raw);
  if (Option.isNone(parsed)) {
    return null;
  }

  return {
    organizationName: parsed.value.organizationName,
    avatarName: parsed.value.avatarName ?? null,
    image: parsed.value.image ?? null,
  };
};

export const serializeAccountPanel = (summary: AccountPanelSummary): string =>
  JSON.stringify(summary);
