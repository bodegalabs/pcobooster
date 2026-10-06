import { useQuery } from "@tanstack/react-query";
import { GlassView } from "expo-glass-effect";
import { useRouter } from "expo-router";
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

const CLOSE_SIZE = 44;
const HEADER_HEIGHT = 56;
/** Device rows inset their divider past the avatar. */
const ROW_DIVIDER_INSET = Spacing.lg + 40 + Spacing.md;

const styles = StyleSheet.create({
  close: {
    alignItems: "center",
    borderRadius: CLOSE_SIZE / 2,
    height: CLOSE_SIZE,
    justifyContent: "center",
    width: CLOSE_SIZE,
  },
  closeSlot: { position: "absolute", right: Spacing.lg },
  content: { gap: Spacing.xl, paddingHorizontal: Spacing.lg },
  deviceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    minHeight: Metrics.minimumTapTarget,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  deviceText: { flex: 1, gap: Spacing.xxs },
  header: {
    alignItems: "center",
    height: HEADER_HEIGHT,
    justifyContent: "center",
  },
  identity: { alignItems: "center", flexDirection: "row", gap: Spacing.lg },
  identityText: { flex: 1, gap: Spacing.xxs },
  later: { paddingHorizontal: Spacing.xs },
  root: { backgroundColor: colors.surfaceCanvas, flex: 1 },
  section: { gap: Spacing.sm },
  sectionHeader: { paddingHorizontal: Spacing.xs },
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
    <SurfaceCard contentStyle={styles.identity}>
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
      </SurfaceCard>
      <View style={styles.later}>
        <AppText color={colors.inkTertiary} font="meta">
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
      <View style={styles.header}>
        <AppText accessibilityRole="header" font="headline">
          Account
        </AppText>
        <View style={styles.closeSlot}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={() => {
              router.back();
            }}
          >
            <GlassView isInteractive style={styles.close}>
              <Glyph
                color={colors.ink}
                size={18}
                symbol="close"
                weight="medium"
              />
            </GlassView>
          </Pressable>
        </View>
      </View>
      <ScrollView
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
