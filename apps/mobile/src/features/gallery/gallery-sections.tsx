import { Fragment } from "react";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Glyph } from "../../components/glyph";
import { Hairline } from "../../components/hairline";
import { InfoBanner } from "../../components/info-banner";
import { KeyBadge } from "../../components/key-badge";
import { PersonAvatar } from "../../components/person-avatar";
import { PillButton } from "../../components/pill-button";
import { ProgressCapsule } from "../../components/progress-capsule";
import { SectionHeader } from "../../components/section-header";
import { SkeletonRow } from "../../components/skeleton";
import { StatusBadge } from "../../components/status-badge";
import { StatusDot } from "../../components/status-dot";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { allColorTokenNames, colors } from "../../design/colors";
import type { ColorTokenName } from "../../design/colors";
import { Radius, Spacing } from "../../design/metrics";
import { scheduleStatusLabel, scheduleStatuses } from "../../design/status";
import type { StatusTone } from "../../design/status";
import { AppSymbol } from "../../design/symbols";
import type { AppSymbolName } from "../../design/symbols";
import { capsLabelStyle } from "../../design/typography";
import type { FontName } from "../../design/typography";
import { galleryStyles } from "./gallery-styles";

const PERCENT = 100;
const FIT_CONFIRMED = 80;
const FIT_PENDING = 50;

const swatchGroups: readonly {
  title: string;
  matches: (name: ColorTokenName) => boolean;
}[] = [
  { title: "Surfaces", matches: (name) => name.startsWith("surface") },
  {
    title: "Ink and lines",
    matches: (name) =>
      name.startsWith("ink") ||
      name.startsWith("hairline") ||
      name === "onInkFill",
  },
  {
    title: "Status and feedback",
    matches: (name) =>
      name.startsWith("status") ||
      name.startsWith("info") ||
      name === "destructive",
  },
  {
    title: "Brand and charts",
    matches: (name) => name.startsWith("brand") || name.startsWith("chart"),
  },
];

export const ColorsSection = () => (
  <View style={galleryStyles.section}>
    {swatchGroups.map((group) => {
      const tokens = allColorTokenNames.filter(group.matches);
      return (
        <View key={group.title} style={galleryStyles.group}>
          <SectionHeader count={tokens.length} title={group.title} />
          <View style={galleryStyles.flow}>
            {tokens.map((token) => (
              <View key={token} style={galleryStyles.swatchCell}>
                <View
                  style={[
                    galleryStyles.swatch,
                    { backgroundColor: colors[token] },
                  ]}
                />
                <AppText
                  adjustsFontSizeToFit
                  font="caption2"
                  numberOfLines={1}
                  style={galleryStyles.label}
                >
                  {token}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      );
    })}
  </View>
);

const TypeSample = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => (
  <View style={{ gap: 2 }}>
    {children}
    <AppText font="caption2" style={galleryStyles.caption}>
      .{name}
    </AppText>
  </View>
);

const typeSamples: readonly {
  font: FontName;
  text: string;
  secondary?: boolean;
}[] = [
  { font: "heroTitle", text: "Sunday Services" },
  { font: "pageTitle", text: "Morning gathering" },
  { font: "cardTitle", text: "Readiness" },
  { font: "rowTitle", text: "Taylor Lane" },
  { font: "rowDetail", text: "Acoustic Guitar, 1 of 2", secondary: true },
  { font: "meta", text: "Sun, Sep 20 at 9:00 AM", secondary: true },
  { font: "badgeLabel", text: "You're on" },
];

export const TypeSection = () => (
  <SurfaceCard contentStyle={galleryStyles.column}>
    {typeSamples.map((sample) => (
      <TypeSample key={sample.font} name={sample.font}>
        <AppText
          color={sample.secondary === true ? colors.inkSecondary : colors.ink}
          font={sample.font}
        >
          {sample.text}
        </AppText>
      </TypeSample>
    ))}
    <TypeSample name="sectionLabel">
      <SectionHeader count={9} title="Band" />
    </TypeSample>
    <TypeSample name="capsLabel">
      <AppText
        color={colors.statusDeclinedText}
        font="capsLabel"
        style={capsLabelStyle}
      >
        Declined
      </AppText>
    </TypeSample>
  </SurfaceCard>
);

const spacingSamples = [
  ["xxs", Spacing.xxs],
  ["xs", Spacing.xs],
  ["sm", Spacing.sm],
  ["md", Spacing.md],
  ["lg", Spacing.lg],
  ["xl", Spacing.xl],
  ["xxl", Spacing.xxl],
  ["xxxl", Spacing.xxxl],
] as const;

const radiusSamples = [
  ["small", Radius.small],
  ["medium", Radius.medium],
  ["control", Radius.control],
  ["tile", Radius.tile],
  ["inner", Radius.inner],
  ["card", Radius.card],
  ["cardWide", Radius.cardWide],
] as const;

const METRIC_SCALE = 4;

export const MetricsSection = () => (
  <View style={galleryStyles.section}>
    <SurfaceCard contentStyle={galleryStyles.group}>
      {spacingSamples.map(([name, value]) => (
        <View key={name} style={galleryStyles.metricRow}>
          <AppText
            font="caption2"
            style={[galleryStyles.label, galleryStyles.metricName]}
          >
            {name}
          </AppText>
          <View
            style={[galleryStyles.metricBar, { width: value * METRIC_SCALE }]}
          />
          <AppText color={colors.inkTertiary} font="footnote" tabular>
            {value}
          </AppText>
        </View>
      ))}
      <Hairline />
      <AppText color={colors.inkSecondary} font="meta">
        Hairline, one device pixel
      </AppText>
    </SurfaceCard>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={galleryStyles.spaced}>
        {radiusSamples.map(([name, value]) => (
          <View key={name} style={galleryStyles.radiusItem}>
            <View style={[galleryStyles.radius, { borderRadius: value }]} />
            <AppText font="caption2" style={galleryStyles.label}>
              {`${name} ${value}`}
            </AppText>
          </View>
        ))}
      </View>
    </ScrollView>
  </View>
);

const symbolNames = Object.keys(AppSymbol).filter(
  (name): name is AppSymbolName => name in AppSymbol
);

export const SymbolsSection = () => (
  <View style={galleryStyles.column}>
    <SurfaceCard contentStyle={galleryStyles.column}>
      <SectionHeader title="Custom symbols beside SF Symbols" />
      <View style={galleryStyles.spaced}>
        {(
          [
            ["Drums", "positionDrum"],
            ["Guitar", "positionGuitar"],
            ["Keys", "positionPiano"],
          ] as const
        ).map(([label, symbol]) => (
          <View key={label} style={galleryStyles.metricRow}>
            <Glyph color={colors.ink} size={20} symbol={symbol} />
            <AppText font="rowTitle">{label}</AppText>
          </View>
        ))}
      </View>
    </SurfaceCard>
    <SurfaceCard padding="compact">
      <View style={galleryStyles.symbolGrid}>
        {symbolNames.map((symbol) => (
          <View key={symbol} style={galleryStyles.symbolCell}>
            <Glyph
              color={symbol === "rocket" ? colors.brandRocket : colors.ink}
              size={24}
              symbol={symbol}
            />
            <AppText
              adjustsFontSizeToFit
              font="caption2"
              numberOfLines={1}
              style={[galleryStyles.label, { fontSize: 9 }]}
            >
              {symbol}
            </AppText>
          </View>
        ))}
      </View>
    </SurfaceCard>
  </View>
);

export const StatusSection = () => (
  <SurfaceCard contentStyle={galleryStyles.section}>
    <View style={[galleryStyles.spaced, { gap: Spacing.xl }]}>
      {scheduleStatuses.map((status) => (
        <View key={status} style={galleryStyles.metricRow}>
          <StatusDot status={status} />
          <AppText font="rowDetail">{scheduleStatusLabel[status]}</AppText>
        </View>
      ))}
    </View>
    <View style={galleryStyles.flow}>
      {scheduleStatuses.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
      <StatusBadge title="You're on" tone="confirmed" />
      <StatusBadge symbol="accessLimited" title="Limited" tone="pending" />
      <StatusBadge title="Presenting" tone="pending" variant="dot" />
      <StatusBadge symbol="mail" title="Not notified" tone="neutral" />
      <StatusBadge title="Also scheduled" tone="info" />
      <StatusBadge status="declined" variant="plain" />
    </View>
    <View style={galleryStyles.spaced}>
      <PersonAvatar name="Frankie Turner" size="small" />
      <PersonAvatar name="Logan Archer" status="confirmed" />
      <PersonAvatar name="Hayden Collins" size="large" status="pending" />
      <PersonAvatar
        alsoScheduled
        name="Drew Scott"
        size="large"
        status="declined"
      />
      <PersonAvatar alsoScheduled name="Quinn" size="hero" />
    </View>
  </SurfaceCard>
);

const candidates = [
  { name: "Taylor Lane", fit: 100, alsoScheduled: false },
  { name: "Hayden Collins", fit: 94, alsoScheduled: false },
  { name: "Drew Scott", fit: 80, alsoScheduled: true },
  { name: "Avery Woods", fit: 62, alsoScheduled: true },
  { name: "Rowan Scott", fit: 6, alsoScheduled: false },
] as const;

const fitTone = (fit: number): StatusTone => {
  if (fit >= FIT_CONFIRMED) {
    return "confirmed";
  }
  return fit >= FIT_PENDING ? "pending" : "declined";
};

const planItems = [
  { title: "Build My Life", songKey: "G", length: "4:30", symbol: "song" },
  { title: "Firm Foundation", songKey: "Bb", length: "5:12", symbol: "song" },
  { title: "Announcements", songKey: null, length: "0:45", symbol: "item" },
] as const;

const SampleCard = ({ children }: { children: ReactNode }) => (
  <SurfaceCard padding="none">{children}</SurfaceCard>
);

export const RowsSection = ({ onRetry }: { onRetry: () => void }) => (
  <View style={galleryStyles.section}>
    <View style={galleryStyles.group}>
      <SectionHeader count={candidates.length} title="Alto, AM" />
      <SampleCard>
        {candidates.map((candidate, index) => {
          const tone = fitTone(candidate.fit);
          return (
            <Fragment key={candidate.name}>
              {index > 0 ? (
                <Hairline inset={Spacing.lg + 32 + Spacing.md} />
              ) : null}
              <View style={[galleryStyles.row, { minHeight: 60 }]}>
                <PersonAvatar
                  alsoScheduled={candidate.alsoScheduled}
                  name={candidate.name}
                />
                <AppText
                  font="rowTitle"
                  numberOfLines={1}
                  style={galleryStyles.rowSpread}
                >
                  {candidate.name}
                </AppText>
                <View style={{ alignItems: "flex-end", gap: 5, width: 64 }}>
                  <AppText font="subheadline" tabular weight="semibold">
                    {`${candidate.fit}%`}
                  </AppText>
                  <ProgressCapsule
                    tone={tone}
                    value={candidate.fit / PERCENT}
                  />
                </View>
                <PillButton
                  kind="outline"
                  onPress={onRetry}
                  size="small"
                  symbol="addToSchedule"
                  title="Add"
                />
              </View>
            </Fragment>
          );
        })}
      </SampleCard>
    </View>
    <View style={galleryStyles.group}>
      <SectionHeader count={planItems.length} title="Plan" />
      <SampleCard>
        {planItems.map((item, index) => (
          <Fragment key={item.title}>
            {index > 0 ? <Hairline inset={52} /> : null}
            <View style={[galleryStyles.row, { minHeight: 52 }]}>
              <Glyph
                color={colors.inkSecondary}
                size={20}
                symbol={item.symbol}
                width={24}
              />
              <AppText font="rowTitle" style={galleryStyles.rowSpread}>
                {item.title}
              </AppText>
              {item.songKey === null ? null : (
                <KeyBadge songKey={item.songKey} />
              )}
              <AppText color={colors.inkSecondary} font="rowDetail" tabular>
                {item.length}
              </AppText>
            </View>
          </Fragment>
        ))}
      </SampleCard>
    </View>
    <View style={galleryStyles.group}>
      <SectionHeader count={2} title="Lineup" />
      <SampleCard>
        <View style={galleryStyles.row}>
          <Glyph
            color={colors.inkSecondary}
            size={20}
            symbol="positionDrum"
            width={24}
          />
          <View style={galleryStyles.rowSpread}>
            <AppText font="rowTitle">Drums</AppText>
            <AppText color={colors.inkSecondary} font="rowDetail">
              Logan Archer
            </AppText>
          </View>
          <StatusDot status="confirmed" />
        </View>
        <Hairline inset={52} />
        <View style={galleryStyles.row}>
          <Glyph
            color={colors.inkSecondary}
            size={20}
            symbol="positionPiano"
            width={24}
          />
          <View style={galleryStyles.rowSpread}>
            <AppText font="rowTitle">Keys</AppText>
            <AppText color={colors.inkSecondary} font="rowDetail">
              Quinn Clark
            </AppText>
          </View>
          <StatusDot status="pending" />
        </View>
      </SampleCard>
    </View>
    <InfoBanner message="Avery is also scheduled for Vocals on this plan." />
    <InfoBanner
      action={
        <PillButton
          kind="outline"
          onPress={onRetry}
          size="small"
          title="Retry"
        />
      }
      message="Some availability failed to load."
      tone="destructive"
    />
  </View>
);

export const LoadingSection = () => (
  <View style={galleryStyles.section}>
    <SurfaceCard>
      <SkeletonRow />
      <SkeletonRow detailWidth={72} titleWidth={112} />
      <SkeletonRow detailWidth={96} titleWidth={164} />
    </SurfaceCard>
    <View style={galleryStyles.column}>
      <AppText color={colors.inkSecondary} font="meta">
        Indeterminate, after 200 ms
      </AppText>
      <ProgressCapsule thickness={3} value={null} />
      <AppText color={colors.inkSecondary} font="meta">
        Availability for 32 of 120 people
      </AppText>
      <ProgressCapsule completed={32} label="Availability" total={120} />
    </View>
  </View>
);
