import { Host, Label, Picker } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { Fragment } from "react";
import { Linking, Switch, View } from "react-native";

import { SHEET_DISMISS_MS } from "../../app-shell/app-providers";
import { deviceAnalytics } from "../../app-shell/device-analytics";
import type { AppAppearance } from "../../app-shell/preference-values";
import { appearances } from "../../app-shell/preference-values";
import { usePreferences } from "../../app-shell/preferences";
import { sharedReads, useProductClient } from "../../app-shell/queries";
import { useSession } from "../../app-shell/session";
import { useVisibleQuery as useQuery } from "../../app-shell/visible-queries";
import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { initials } from "../../lib/people";
import { useToasts } from "../../lib/toasts";
import { accessReview } from "./access-review";
import { AccountRow, AccountSection } from "./account-rows";
import { useFeedbackDraft } from "./feedback-draft";

const textStyle = { flex: 1 };
const titles = { system: "System", light: "Light", dark: "Dark" } as const;
const publicLinks = [
  { title: "Privacy Policy", path: "/privacy" },
  { title: "Terms of Service", path: "/terms" },
  { title: "pcobooster.com", path: "/" },
];

const appearanceSymbols = {
  system: "circle.lefthalf.filled",
  light: "sun.max",
  dark: "moon",
} as const;
export const AppearanceSection = () => {
  const preferences = usePreferences();
  return (
    <AccountSection title="Appearance">
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <Host style={{ height: 32 }}>
          <Picker<AppAppearance>
            selection={preferences.appearance}
            onSelectionChange={(appearance) => {
              preferences.setAppearance(appearance);
            }}
            modifiers={[pickerStyle("segmented")]}
          >
            {appearances.map((appearance) => (
              <Label
                key={appearance}
                title={titles[appearance]}
                systemImage={appearanceSymbols[appearance]}
                modifiers={[tag(appearance)]}
              />
            ))}
          </Picker>
        </Host>
      </View>
    </AccountSection>
  );
};

const OrganizationGlyph = ({ name }: { name: string }) => (
  <View
    style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    }}
  >
    <AppText font="meta" weight="semibold" color={colors.inkSecondary}>
      {initials(name)}
    </AppText>
  </View>
);

export const PlanningCenterSection = () => {
  const context = useProductClient();
  const session = useSession();
  const router = useRouter();
  const accounts = useQuery(sharedReads.accounts(context)).data;
  const access = useQuery(sharedReads.access(context));
  const features = useQuery(sharedReads.features(context)).data;
  const review = accessReview(access.data, access.isError, features);
  const organizations =
    accounts?.accounts.filter(
      (account) => account.identity?.organizationName !== null
    ) ?? [];
  const selected = accounts?.selectedAccountId ?? organizations[0]?.id;
  const select = (id: string) => {
    if (id === selected) {
      return;
    }
    router.back();
    setTimeout(() => {
      void session.switchOrganization(id);
    }, SHEET_DISMISS_MS);
  };
  return (
    <AccountSection
      title="Planning Center"
      footer={
        organizations.length > 1
          ? `You're linked to ${organizations.length} Planning Center organizations. Switching reloads everything for the one you pick.`
          : null
      }
    >
      {organizations.length > 1 ? (
        organizations.map((account, index) => (
          <Fragment key={account.id}>
            {index > 0 ? <Hairline /> : null}
            <AccountRow
              onPress={() => {
                select(account.id);
              }}
              selected={account.id === selected}
            >
              <OrganizationGlyph
                name={account.identity?.organizationName ?? account.id}
              />
              <AppText font="rowTitle" style={textStyle}>
                {account.identity?.organizationName ?? account.id}
              </AppText>
              {account.id === selected ? (
                <Glyph symbol="checkmark" size={20} color={colors.ink} />
              ) : null}
            </AccountRow>
          </Fragment>
        ))
      ) : (
        <AccountRow>
          <Glyph symbol="organization" size={20} color={colors.ink} />
          <AppText font="rowTitle">Organization</AppText>
          <AppText
            color={colors.inkSecondary}
            font="rowDetail"
            style={textStyle}
          >
            {organizations[0]?.identity?.organizationName ??
              session.active?.organizationName ??
              "Planning Center"}
          </AppText>
        </AccountRow>
      )}
      <Hairline />
      <AccountRow
        onPress={() => {
          router.push("/account-access");
        }}
        testID="your-access-row"
      >
        <Glyph symbol="access" size={20} color={colors.ink} />
        <AppText font="rowTitle" style={textStyle}>
          Your access
        </AppText>
        {review.isRestricted ? (
          <AppText color={colors.statusPendingText} font="meta">
            Limited
          </AppText>
        ) : null}
        <Glyph symbol="chevronRight" size={12} color={colors.inkTertiary} />
      </AccountRow>
    </AccountSection>
  );
};

export const FeedbackSection = () => {
  const router = useRouter();
  const { sentAt } = useFeedbackDraft();
  return (
    <AccountSection>
      <AccountRow
        onPress={() => {
          router.push("/account-feedback");
        }}
        testID="send-feedback-row"
      >
        <AppText font="rowTitle" style={textStyle}>
          Send feedback
        </AppText>
        {sentAt === null ? null : (
          <AppText font="meta" color={colors.statusConfirmedText}>
            Sent
          </AppText>
        )}
        <Glyph symbol="chevronRight" size={12} color={colors.inkTertiary} />
      </AccountRow>
    </AccountSection>
  );
};

export const AboutSection = () => {
  const preferences = usePreferences();
  const toasts = useToasts();
  const open = async (path: string) => {
    try {
      await Linking.openURL(`https://pcobooster.com${path}`);
    } catch {
      toasts.showError("Couldn't open the page.");
    }
  };
  return (
    <AccountSection
      title="About"
      footer="pcobooster.com is an independent third-party tool. It is not affiliated with, sponsored by, or endorsed by Planning Center. Planning Center and Planning Center Services are trademarks of Ministry Centered Technologies, Inc."
    >
      <AccountRow>
        <AppText font="rowTitle" style={textStyle}>
          Version
        </AppText>
        <AppText font="rowDetail" color={colors.inkSecondary}>
          {Application.nativeApplicationVersion ?? "0.1.0"} (
          {Application.nativeBuildVersion ?? "1"})
        </AppText>
      </AccountRow>
      {publicLinks.map((link) => (
        <Fragment key={link.path}>
          <Hairline />
          <AccountRow
            accessibilityRole="link"
            onPress={() => {
              void open(link.path);
            }}
          >
            <AppText font="rowTitle" style={textStyle}>
              {link.title}
            </AppText>
            <Glyph symbol="openExternal" size={14} color={colors.inkTertiary} />
          </AccountRow>
        </Fragment>
      ))}
      {deviceAnalytics.available ? (
        <>
          <Hairline />
          <View
            style={{ padding: 16, flexDirection: "row", alignItems: "center" }}
          >
            <AppText font="rowTitle" style={textStyle}>
              Share usage analytics and error reports
            </AppText>
            <Switch
              accessibilityLabel="Share usage analytics and error reports"
              value={preferences.analyticsOptedOut === false}
              disabled={preferences.analyticsOptedOut === null}
              onValueChange={(enabled) => {
                preferences.setAnalyticsOptedOut(!enabled);
              }}
            />
          </View>
        </>
      ) : null}
    </AccountSection>
  );
};
