import { Fragment, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  accountDisplayName,
  accountFirstName,
  formatLastUsed,
} from "../../app-shell/device-accounts";
import { useSession } from "../../app-shell/session";
import { BrandLockup } from "../../components/brand-lockup";
import { ConfirmationSheet } from "../../components/confirmation-sheet";
import { Entrance } from "../../components/entrance";
import { GlassButton } from "../../components/glass-button";
import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { PersonAvatar } from "../../components/person-avatar";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import {
  colors,
  resolvedTokenColor,
  useColorVariant,
} from "../../design/colors";
import { Metrics, Spacing } from "../../design/metrics";
import { textStyles } from "../../design/typography";
import { useClock } from "../../lib/environment";
import { useToasts } from "../../lib/toasts";
import type { DeviceAccount } from "../../session/device-session";
import { DemoLinkSheet } from "./demo-link-sheet";

const PRIVACY_URL = "https://pcobooster.com/privacy";
const TERMS_URL = "https://pcobooster.com/terms";
const CONTENT_MAX_WIDTH = 440;
const FOOTER_MAX_WIDTH = 360;
/** Rows inset their divider past the avatar (Swift `.padding(.leading, 72)`). */
const ROW_DIVIDER_INSET = 72;
const GLOW_OPACITY = 0.2;
const GLOW_WIDTH = 1.6;
const GLOW_HEIGHT = 0.62;

const styles = StyleSheet.create({
  accountRow: { alignItems: "center", flexDirection: "row" },
  accountSelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  accountText: { flex: 1, gap: Spacing.xxs },
  actions: { alignSelf: "stretch", gap: Spacing.xl },
  centered: { textAlign: "center" },
  content: {
    alignItems: "center",
    alignSelf: "center",
    gap: Spacing.xxxl,
    maxWidth: CONTENT_MAX_WIDTH,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.huge,
    width: "100%",
  },
  footer: {
    alignItems: "center",
    gap: Spacing.md,
    maxWidth: FOOTER_MAX_WIDTH,
  },
  forget: {
    alignItems: "center",
    height: Metrics.minimumTapTarget,
    justifyContent: "center",
    marginRight: Spacing.xs,
    width: Metrics.minimumTapTarget,
  },
  glow: { alignSelf: "center", position: "absolute", top: 0 },
  hero: {
    alignItems: "center",
    alignSelf: "stretch",
    flexGrow: 1,
    gap: Spacing.xl,
    justifyContent: "center",
  },
  heroText: { alignItems: "center", gap: Spacing.md },
  links: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
  remembered: { gap: Spacing.sm },
  rememberedHeading: { paddingHorizontal: Spacing.xs },
  root: { backgroundColor: colors.surfaceCanvas, flex: 1 },
  title: {
    color: colors.ink,
    fontSize: textStyles.largeTitle.fontSize,
    fontWeight: "600",
    letterSpacing: -0.4,
    lineHeight: textStyles.largeTitle.lineHeight,
    textAlign: "center",
  },
});

/** A soft sage glow at the top of the canvas (Swift `SignInBackdrop`). */
const Backdrop = () => {
  const { width, height } = useWindowDimensions();
  const glow = resolvedTokenColor("chart2", useColorVariant(), GLOW_OPACITY);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          experimental_backgroundImage: `radial-gradient(ellipse 50% 70% at 50% 0%, ${glow} 0%, transparent 100%)`,
          height: height * GLOW_HEIGHT,
          width: width * GLOW_WIDTH,
        },
      ]}
    />
  );
};

const RememberedAccountRow = ({
  account,
  now,
  onSelect,
  onForget,
}: {
  account: DeviceAccount;
  now: Date;
  onSelect: () => void;
  onForget: () => void;
}) => {
  const name = accountDisplayName(account);
  const organization = account.organizationName ?? account.email;
  return (
    <View style={styles.accountRow}>
      <Pressable
        accessibilityLabel={`Continue as ${name}, ${organization}`}
        accessibilityRole="button"
        onPress={onSelect}
        style={styles.accountSelect}
      >
        <PersonAvatar name={name} size="large" />
        <View style={styles.accountText}>
          <AppText font="rowTitleEmphasized" numberOfLines={1}>
            {name}
          </AppText>
          <AppText color={colors.inkSecondary} font="meta" numberOfLines={1}>
            {`${organization} · ${formatLastUsed(account.lastUsedAt, now)}`}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={`Remove ${name} from this device`}
        accessibilityRole="button"
        onPress={onForget}
        style={styles.forget}
      >
        <Glyph
          color={colors.inkTertiary}
          size={14}
          symbol="close"
          weight="semibold"
        />
      </Pressable>
    </View>
  );
};

/** "Welcome back" and the people remembered on this device, most recent first. */
const RememberedAccounts = ({
  accounts,
}: {
  accounts: readonly DeviceAccount[];
}) => {
  const session = useSession();
  const [removing, setRemoving] = useState<DeviceAccount | null>(null);
  const now = useClock().now();
  const [only] = accounts;
  const firstName =
    accounts.length === 1 && only !== undefined
      ? accountFirstName(only)
      : undefined;
  return (
    <View style={styles.remembered}>
      <View style={styles.rememberedHeading}>
        <AppText
          accessibilityRole="header"
          color={colors.inkSecondary}
          font="sectionLabel"
        >
          {firstName === undefined
            ? "Welcome back"
            : `Welcome back, ${firstName}`}
        </AppText>
      </View>
      <SurfaceCard padding="none">
        {accounts.map((account, index) => (
          <Fragment key={account.userId}>
            {index > 0 ? (
              <Hairline
                color={colors.hairlineSubtle}
                inset={ROW_DIVIDER_INSET}
              />
            ) : null}
            <RememberedAccountRow
              account={account}
              now={now}
              onForget={() => {
                setRemoving(account);
              }}
              onSelect={() => {
                session.continueAs(account);
              }}
            />
          </Fragment>
        ))}
      </SurfaceCard>
      <ConfirmationSheet
        visible={removing !== null}
        title="Remove this account?"
        message="This signs the account out of this device. You can add it again through Planning Center."
        action="Remove Account"
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing !== null) {
            void session.forget(removing);
          }
          setRemoving(null);
        }}
      />
    </View>
  );
};

const openLink = (url: string, onFailure: () => void) => {
  void (async () => {
    try {
      await Linking.openURL(url);
    } catch {
      onFailure();
    }
  })();
};

/**
 * The first screen (Swift `SignInView`): the brand moment, people remembered on this device, and
 * "Sign in with Planning Center", native authentication, and demo-link entry.
 */
export const SignInScreen = () => {
  const session = useSession();
  const toasts = useToasts();
  const [demoVisible, setDemoVisible] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The content fills the safe area, so the hero takes the top and the actions sit in the thumb
  // zone (Swift: `minHeight: proxy.size.height` inside a GeometryReader).
  const safeHeight = height - insets.top - insets.bottom;
  const hasAccounts = session.accounts.length > 0;
  const showLinkError = () => {
    toasts.showError("Couldn't open the link.");
  };
  return (
    <View style={styles.root}>
      <Backdrop />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={[styles.content, { minHeight: safeHeight }]}
        contentInsetAdjustmentBehavior="always"
      >
        <Entrance index={0} style={styles.hero}>
          <BrandLockup playsTakeoffOnAppear size="large" />
          <View style={styles.heroText}>
            <Text
              accessibilityRole="header"
              dynamicTypeRamp="largeTitle"
              maxFontSizeMultiplier={2}
              style={styles.title}
            >
              Your team,{" "}
              <Text style={{ color: colors.brandSage }}>in full view.</Text>
            </Text>
            <AppText
              color={colors.inkSecondary}
              font="rowTitle"
              style={styles.centered}
            >
              {hasAccounts
                ? "Choose an account to keep planning."
                : "Plan services and schedule your team with your Planning Center account."}
            </AppText>
          </View>
        </Entrance>
        <Entrance index={1} style={styles.actions}>
          {session.phase.kind === "needsSignIn" ? (
            <AppText font="rowDetail" color={colors.statusPendingText}>
              {accountFirstName(session.phase.account)}
              &apos;s session ended. Sign in again to keep planning.
            </AppText>
          ) : null}
          {session.signInMessage === null ? null : (
            <AppText font="rowDetail" color={colors.destructive}>
              {session.signInMessage}
            </AppText>
          )}
          {hasAccounts ? (
            <RememberedAccounts accounts={session.accounts} />
          ) : null}
          <GlassButton
            action={{
              title:
                session.signInActivity.kind === "idle"
                  ? "Sign in with Planning Center"
                  : "Signing in...",
              disabled: session.signInActivity.kind !== "idle",
              isBusy: session.signInActivity.kind !== "idle",
              assetImage: "PlanningCenterServices",
              onPress: () => {
                void session.signIn();
              },
              testID: "sign-in-button",
            }}
            size="extraLarge"
            wide
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDemoVisible(true);
            }}
            testID="demo-link-button"
          >
            <AppText
              color={colors.inkSecondary}
              font="rowDetail"
              style={styles.centered}
              weight="medium"
            >
              Have a demo link?
            </AppText>
          </Pressable>
        </Entrance>
        <Entrance index={2} style={styles.footer}>
          <AppText
            color={colors.inkSecondary}
            font="meta"
            style={styles.centered}
          >
            {hasAccounts
              ? "Accounts you switched away from stay signed in on this device. Remove one to sign it out."
              : "You'll sign in on Planning Center, then come right back here. PCOBooster only uses your Services and People access."}
          </AppText>
          <View style={styles.links}>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                openLink(PRIVACY_URL, showLinkError);
              }}
            >
              <AppText color={colors.inkSecondary} font="meta" weight="medium">
                Privacy
              </AppText>
            </Pressable>
            <AppText
              accessibilityElementsHidden
              color={colors.inkSecondary}
              font="meta"
              importantForAccessibility="no"
              weight="medium"
            >
              ·
            </AppText>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                openLink(TERMS_URL, showLinkError);
              }}
            >
              <AppText color={colors.inkSecondary} font="meta" weight="medium">
                Terms
              </AppText>
            </Pressable>
          </View>
          <AppText
            color={colors.inkTertiary}
            font="caption"
            style={styles.centered}
          >
            Independently built. Not affiliated with Planning Center.
          </AppText>
        </Entrance>
      </ScrollView>
      <DemoLinkSheet
        visible={demoVisible}
        onClose={() => {
          setDemoVisible(false);
        }}
      />
    </View>
  );
};
