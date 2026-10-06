import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { BrandLockup } from "../../components/brand-lockup";
import { EmptyState } from "../../components/empty-state";
import { FloatingGlassBar } from "../../components/floating-glass-bar";
import { GlassButton } from "../../components/glass-button";
import { PillButton } from "../../components/pill-button";
import { RocketMark } from "../../components/rocket-mark";
import { SectionHeader } from "../../components/section-header";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { replayPose, takeoffPose } from "../../design/rocket-pose";
import { useToasts } from "../../lib/toasts";
import {
  ColorsSection,
  LoadingSection,
  MetricsSection,
  RowsSection,
  StatusSection,
  SymbolsSection,
  TypeSection,
} from "./gallery-sections";
import { galleryStyles } from "./gallery-styles";

const CONTENT_MAX_WIDTH = 760;
const BOTTOM_ROOM = 96;
const TAKEOFF_FRAME_MS = 40;
const REPLAY_FRAME_MS = 34;
const FILMSTRIP_FRAMES = 9;
const FILMSTRIP_SIZE = 30;
const HERO_ROCKET = 112;

const styles = StyleSheet.create({
  content: {
    alignSelf: "center",
    gap: Spacing.xxxl,
    maxWidth: CONTENT_MAX_WIDTH,
    paddingBottom: BOTTOM_ROOM,
    paddingHorizontal: Spacing.lg,
    width: "100%",
  },
  filmstrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  glassRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  header: { gap: Spacing.sm, paddingTop: Spacing.sm },
  rocket: { alignItems: "center", gap: Spacing.xl },
  scroll: { backgroundColor: colors.surfaceCanvas },
});

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <View style={galleryStyles.column}>
    <AppText accessibilityRole="header" font="pageTitle">
      {title}
    </AppText>
    {children}
  </View>
);

const Filmstrip = ({
  title,
  frameMs,
  pose,
}: {
  title: string;
  frameMs: number;
  pose: typeof takeoffPose;
}) => (
  <View style={[galleryStyles.group, { alignSelf: "stretch" }]}>
    <SectionHeader title={title} />
    <View style={styles.filmstrip}>
      {Array.from(
        { length: FILMSTRIP_FRAMES },
        (_, frame) => frame * frameMs
      ).map((elapsed) => (
        <RocketMark key={elapsed} pose={pose(elapsed)} size={FILMSTRIP_SIZE} />
      ))}
    </View>
  </View>
);

const SAMPLE_ERROR = "Couldn't save the key";
const SAMPLE_DETAIL = "Planning Center is busy. Try again in a moment.";

/**
 * Every token and component on one scrolling page, for design review and screenshots (Swift
 * `DesignSystemGallery`). Development builds only: `-PCOBGallery YES`.
 */
export const DesignSystemGallery = () => {
  const toasts = useToasts();
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [takeoff, setTakeoff] = useState(0);
  const [isLaunching, setIsLaunching] = useState(false);
  const showError = () => {
    toasts.showError(SAMPLE_ERROR, { detail: SAMPLE_DETAIL });
  };
  const addSample = () => {
    setIsAdding(false);
    toasts.showError("Couldn't add the song", { detail: SAMPLE_DETAIL });
  };
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Design System",
          headerLargeTitleEnabled: true,
          headerTransparent: true,
          headerLargeTitleShadowVisible: false,
          headerLargeTitleStyle: { color: colors.ink },
          headerTintColor: colors.ink,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
      >
        <View style={styles.header}>
          <BrandLockup playsTakeoffOnAppear size="large" />
          <AppText color={colors.inkSecondary} font="rowDetail">
            Tokens and components for the native app. Solid sage surfaces for
            content, Liquid Glass for controls.
          </AppText>
        </View>
        <Section title="Color">
          <ColorsSection />
        </Section>
        <Section title="Type">
          <TypeSection />
        </Section>
        <Section title="Spacing and shape">
          <MetricsSection />
        </Section>
        <Section title="Symbols">
          <SymbolsSection />
        </Section>
        <Section title="Status">
          <StatusSection />
        </Section>
        <Section title="Rows and cards">
          <RowsSection onRetry={showError} />
        </Section>
        <Section title="Buttons and actions">
          <SurfaceCard contentStyle={galleryStyles.column}>
            <SectionHeader title="Content layer, pills" />
            <View style={galleryStyles.flow}>
              <PillButton onPress={showError} title="Confirm" />
              <PillButton kind="secondary" onPress={showError} title="Skip" />
              <PillButton
                kind="outline"
                onPress={showError}
                size="small"
                symbol="addToSchedule"
                title="Add"
              />
              <PillButton
                kind="destructive"
                onPress={showError}
                title="Remove"
              />
              <PillButton disabled onPress={showError} title="Disabled" />
            </View>
          </SurfaceCard>
          <SectionHeader title="Control layer, glass" />
          <View style={styles.glassRow}>
            <GlassButton
              action={{
                title: "Open sheet",
                onPress: () => {
                  router.push("/gallery-sheet");
                },
              }}
            />
            <GlassButton
              action={{
                title: "Show error",
                role: "secondary",
                onPress: showError,
              }}
            />
            <GlassButton
              action={{
                title: "Remove",
                role: "destructive",
                onPress: showError,
              }}
            />
          </View>
        </Section>
        <Section title="Loading">
          <LoadingSection />
        </Section>
        <Section title="Empty states">
          <SurfaceCard>
            <EmptyState
              artwork="readiness"
              description="Everyone has a spot this Sunday."
              title="No open positions"
            />
          </SurfaceCard>
          <SurfaceCard>
            <EmptyState
              artwork="rocket-mark"
              description="Every position is filled and confirmed."
              title="You're all set"
            />
          </SurfaceCard>
        </Section>
        <Section title="Brand">
          <SurfaceCard contentStyle={styles.rocket}>
            <RocketMark
              isLaunching={isLaunching}
              playsTakeoffOnAppear
              replaysOnTap
              size={HERO_ROCKET}
              takeoffTrigger={takeoff}
            />
            <AppText color={colors.inkSecondary} font="meta">
              Tap the rocket to replay.
            </AppText>
            <View style={galleryStyles.metricRow}>
              <PillButton
                kind="secondary"
                onPress={() => {
                  setTakeoff((count) => count + 1);
                }}
                title="Takeoff"
              />
              <PillButton
                onPress={() => {
                  setIsLaunching((launching) => !launching);
                }}
                title={isLaunching ? "Reset" : "Launch away"}
              />
            </View>
            <Filmstrip
              frameMs={TAKEOFF_FRAME_MS}
              pose={takeoffPose}
              title="Takeoff, every 40 ms"
            />
            <Filmstrip
              frameMs={REPLAY_FRAME_MS}
              pose={replayPose}
              title="Replay, every 34 ms"
            />
          </SurfaceCard>
        </Section>
      </ScrollView>
      <FloatingGlassBar
        actions={[
          ...(isAdding
            ? [
                {
                  id: "header",
                  title: "Header",
                  systemImage: "textformat",
                  onPress: addSample,
                } as const,
                {
                  id: "song",
                  title: "Song",
                  systemImage: "music.note",
                  onPress: addSample,
                } as const,
              ]
            : []),
          {
            id: "toggle",
            title: isAdding ? "Close" : "Add",
            systemImage: isAdding ? "xmark" : "plus",
            showsTitle: false,
            isProminent: !isAdding,
            onPress: () => {
              setIsAdding((adding) => !adding);
            },
          },
        ]}
        alignment="trailing"
      />
    </>
  );
};
