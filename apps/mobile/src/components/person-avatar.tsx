import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { AppText } from "../design/app-text";
import { colors } from "../design/colors";
import { Metrics } from "../design/metrics";
import { scheduleStatusLabel, toneColors } from "../design/status";
import type { ScheduleStatus } from "../design/status";
import { initials } from "../lib/people";
import { useSurfaceColor } from "./surface-card";

const sizes = {
  /** Dense lists and avatar stacks (web `sm`). */
  small: { diameter: 24, dot: 8, font: 10 },
  /** Rows (web default). */
  regular: { diameter: 32, dot: Metrics.statusDot, font: 13 },
  /** Candidate tiles and sheets (web `lg`). */
  large: { diameter: 40, dot: 12, font: 15 },
  /** Person detail headers. */
  hero: { diameter: 64, dot: 16, font: 24 },
} as const;

export type PersonAvatarSize = keyof typeof sizes;

/** The "also scheduled" ring sits this far outside the avatar (web `ring-offset-2`). */
const RING_OFFSET = 4;
const RING_WIDTH = 2;

const styles = StyleSheet.create({
  face: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.hairlineSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: StyleSheet.absoluteFill,
});

interface PersonAvatarProps {
  readonly name: string;
  readonly photoUrl?: string | null;
  readonly size?: PersonAvatarSize;
  readonly status?: ScheduleStatus;
  /** Scheduled elsewhere on this plan: a blue ring offset from the avatar. */
  readonly alsoScheduled?: boolean;
}

const accessibilityStatus = (
  status: ScheduleStatus | undefined,
  alsoScheduled: boolean
): string | undefined => {
  if (status !== undefined && alsoScheduled) {
    return `${scheduleStatusLabel[status]}, also scheduled on this plan`;
  }
  if (status !== undefined) {
    return scheduleStatusLabel[status];
  }
  return alsoScheduled ? "Also scheduled on this plan" : undefined;
};

/**
 * A person's circular avatar: their photo when it loads, initials on a muted fill otherwise. An
 * optional corner status dot is cut out of the surface behind it. VoiceOver hears only the
 * status (the row already shows the name).
 */
export const PersonAvatar = ({
  name,
  photoUrl,
  size = "regular",
  status,
  alsoScheduled = false,
}: PersonAvatarProps) => {
  const metrics = sizes[size];
  const surface = useSurfaceColor();
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const label = accessibilityStatus(status, alsoScheduled);
  const ring = Metrics.statusDotRing;
  return (
    <View
      accessibilityElementsHidden={label === undefined}
      accessibilityLabel={label}
      accessible={label !== undefined}
      style={{ height: metrics.diameter, width: metrics.diameter }}
    >
      <View
        style={[
          styles.face,
          {
            borderRadius: metrics.diameter / 2,
            height: metrics.diameter,
            width: metrics.diameter,
          },
        ]}
      >
        <AppText
          allowFontScaling={false}
          color={colors.inkSecondary}
          font="footnote"
          numberOfLines={1}
          style={{ fontSize: metrics.font, opacity: photoLoaded ? 0 : 1 }}
          weight="medium"
        >
          {initials(name)}
        </AppText>
        {photoUrl === undefined || photoUrl === null ? null : (
          <Image
            onLoad={() => {
              setPhotoLoaded(true);
            }}
            source={{ uri: photoUrl }}
            style={[styles.photo, { opacity: photoLoaded ? 1 : 0 }]}
          />
        )}
      </View>
      {alsoScheduled ? (
        <View
          style={{
            borderColor: colors.statusInfo,
            borderRadius: (metrics.diameter + RING_OFFSET * 2) / 2,
            borderWidth: RING_WIDTH,
            bottom: -RING_OFFSET,
            left: -RING_OFFSET,
            position: "absolute",
            right: -RING_OFFSET,
            top: -RING_OFFSET,
          }}
        />
      ) : null}
      {status === undefined ? null : (
        <View
          style={{
            backgroundColor: colors[surface],
            borderRadius: (metrics.dot + ring * 2) / 2,
            bottom: -ring,
            padding: ring,
            position: "absolute",
            right: -ring,
          }}
        >
          <View
            style={{
              backgroundColor: toneColors[status].color,
              borderRadius: metrics.dot / 2,
              height: metrics.dot,
              width: metrics.dot,
            }}
          />
        </View>
      )}
    </View>
  );
};
