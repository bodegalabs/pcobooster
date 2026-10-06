import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Fragment } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  accountDisplayName,
  formatUsedAgo,
} from "../../app-shell/device-accounts";
import type { DeviceAccount } from "../../app-shell/device-accounts";
import { sharedReads, useProductClient } from "../../app-shell/queries";
import { useSession } from "../../app-shell/session";
import { BottomActionBar } from "../../components/bottom-action-bar";
import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { PersonAvatar } from "../../components/person-avatar";
import { SectionHeader } from "../../components/section-header";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Metrics, Spacing } from "../../design/metrics";
import { useClock } from "../../lib/environment";
import { useToasts } from "../../lib/toasts";

const AVATAR_LARGE = 40;
const LIST_TOP_MARGIN = 35;
const SECTION_GAP = 27;
/** List rows are a little taller than the 12 pt card rows elsewhere. */
const LIST_ROW_PADDING = 15;
/** Device rows inset their divider past the avatar. */
const ROW_DIVIDER_INSET = Spacing.lg + AVATAR_LARGE + Spacing.md;

const styles = StyleSheet.create({
  addCircle: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: AVATAR_LARGE / 2,
    height: AVATAR_LARGE,
    justifyContent: "center",
    width: AVATAR_LARGE,
  },
  // SwiftUI's inset grouped list: a taller top margin and more room between sections.
  content: {
    gap: SECTION_GAP,
    paddingHorizontal: Spacing.lg,
    paddingTop: LIST_TOP_MARGIN,
  },
  deviceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: Metrics.minimumTapTarget,
    paddingHorizontal: Spacing.lg,
    paddingVertical: LIST_ROW_PADDING,
  },
  deviceText: { flex: 1, gap: Spacing.xxs },
  identity: { alignItems: "center", flexDirection: "row", gap: Spacing.lg },
  identityPadding: { paddingVertical: Spacing.lg + 3 },
  identityText: { flex: 1, gap: Spacing.xxs },
  // List section headers and footers align with the row content.
  later: { paddingHorizontal: Spacing.lg },
  root: { backgroundColor: colors.surfaceCanvas, flex: 1 },
  section: { gap: Spacing.sm },
  sectionHeader: { paddingHorizontal: Spacing.lg },
});

/** Who is signed in: `accounts.list`, or the remembered device account until it answers. */
const IdentityCard = ({ account }: { account: DeviceAccount }) => {
  const accounts = useQuery(sharedReads.accounts(useProductClient())).data;
  const selected = accounts?.accounts.find(
    (candidate) => candidate.id === accounts.selectedAccountId
  );
  const name = accounts?.session.name ?? accountDisplayName(account);
  const email = accounts?.session.email ?? account.email;
  const organization =
    selected?.identity?.organizationName ?? account.organizationName;
  return (
    <SurfaceCard contentStyle={[styles.identity, styles.identityPadding]}>
      <PersonAvatar name={name} size="hero" />
      <View style={styles.identityText}>
        <AppText font="pageTitle" numberOfLines={2}>
          {name}
        </AppText>
        <AppText
          color={colors.inkSecondary}
          ellipsizeMode="middle"
          font="rowDetail"
          numberOfLines={1}
        >
          {email}
        </AppText>
        {organization === null ? null : (
          <AppText
            color={colors.inkSecondary}
            font="rowDetail"
            numberOfLines={2}
          >
            {organization}
          </AppText>
        )}
      </View>
    </SurfaceCard>
  );
};

/** "On this device": tapping another person closes the sheet, then switches. */
const DeviceAccounts = () => {
  const session = useSession();
  const toasts = useToasts();
  const router = useRouter();
  const now = useClock().now();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader title="On this device" />
      </View>
      <SurfaceCard padding="none">
        {session.accounts.map((account, index) => {
          const isActive = account.userId === session.active?.userId;
          const detail = [
            account.organizationName,
            isActive ? null : formatUsedAgo(account.lastUsedAt, now),
          ]
            .filter((part) => part !== null)
            .join(" · ");
          return (
            <Fragment key={account.userId}>
              {index > 0 ? (
                <Hairline
                  color={colors.hairlineSubtle}
                  inset={ROW_DIVIDER_INSET}
                  trailing={Spacing.lg}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => {
                  if (!isActive) {
                    router.back();
                    session.continueAs(account);
                  }
                }}
                style={({ pressed }) => [
                  styles.deviceRow,
                  pressed && !isActive
                    ? { backgroundColor: colors.surfaceHighlight }
                    : null,
                ]}
              >
                <PersonAvatar name={accountDisplayName(account)} size="large" />
                <View style={styles.deviceText}>
                  <AppText font="rowTitle" numberOfLines={1}>
                    {accountDisplayName(account)}
                  </AppText>
                  <AppText
                    color={colors.inkSecondary}
                    font="meta"
                    numberOfLines={1}
                  >
                    {detail}
                  </AppText>
                </View>
                {isActive ? (
                  <Glyph
                    accessibilityLabel="Signed in"
                    color={colors.ink}
                    size={20}
                    symbol="checkmark"
                    weight="semibold"
                  />
                ) : null}
              </Pressable>
            </Fragment>
          );
        })}
        <Hairline
          color={colors.hairlineSubtle}
          inset={ROW_DIVIDER_INSET}
          trailing={Spacing.lg}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            toasts.showError("Adding accounts arrives with native sign-in.");
          }}
          style={({ pressed }) => [
            styles.deviceRow,
            pressed ? { backgroundColor: colors.surfaceHighlight } : null,
          ]}
        >
          <View style={styles.addCircle}>
            <Glyph color={colors.ink} size={20} symbol="add" weight="medium" />
          </View>
          <AppText font="rowTitle" numberOfLines={1}>
            Add another account
          </AppText>
        </Pressable>
      </SurfaceCard>
      <View style={styles.later}>
        <AppText color={colors.inkSecondary} font="meta">
          People you switch away from stay signed in on this device.
        </AppText>
      </View>
    </View>
  );
};

/**
 * The account sheet shell (Swift `AccountSheet`), opened from the avatar on every tab root: who
 * is signed in and the people on this device, with Sign Out as the full-width bottom action.
 * Planning Center organizations, appearance, feedback, and about arrive in a later layer.
 */
export const AccountSheet = () => {
  const session = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { active } = session;
  const confirmSignOut = () => {
    Alert.alert(
      "Sign out of PCOBooster?",
      session.accounts.length > 1
        ? "This device forgets this account. Other remembered accounts stay signed in."
        : "This device forgets this account. You can sign in again with Planning Center anytime.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: session.signOut },
      ]
    );
  };
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "Close",
              accessibilityLabel: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              onPress: () => {
                router.back();
              },
            },
          ],
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.huge * 2 },
        ]}
      >
        {active === null ? null : <IdentityCard account={active} />}
        <DeviceAccounts />
      </ScrollView>
      <BottomActionBar
        actions={[
          {
            title: "Sign Out",
            role: "destructive",
            onPress: confirmSignOut,
            testID: "sign-out-button",
          },
        ]}
      />
    </View>
  );
};
