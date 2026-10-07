import { useEvent } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "../../components/empty-state";
import { Glyph } from "../../components/glyph";
import { PillButton } from "../../components/pill-button";
import { colors } from "../../design/colors";
import { Radius, Spacing } from "../../design/metrics";
import { applyPlaybackPolicy } from "./preview-lifecycle";

const AUDIO_PLAYER_HEIGHT = 96;
const VIDEO_ASPECT = 16 / 9;
const ARTWORK_SIZE = 64;

const styles = StyleSheet.create({
  audio: {
    alignItems: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  audioPlayer: {
    borderCurve: "continuous",
    borderRadius: Radius.card,
    height: AUDIO_PLAYER_HEIGHT,
    overflow: "hidden",
    width: "100%",
  },
  video: { aspectRatio: VIDEO_ASPECT, width: "100%" },
});

/**
 * Audio or video streamed by the system player (AVPlayer) from Planning Center's signed link,
 * with its own controls, AirPlay, and full screen for video. The link carries no credentials of
 * this app and is never saved. Playback starts when the person presses play, and follows
 * `applyPlaybackPolicy`: it pauses whenever its screen is hidden or the app leaves the
 * foreground, and nothing plays in the background or on the lock screen.
 */
export const PreviewMediaPlayer = ({
  url,
  video,
  title,
  visible,
  retry,
}: {
  url: string;
  video: boolean;
  title: string;
  /** Its screen is focused and the app active (`useReadVisibility`). */
  visible: boolean;
  /** Reads a fresh link: Planning Center's links expire. */
  retry: () => void;
}) => {
  const player = useVideoPlayer({ uri: url, metadata: { title } });
  useEffect(() => {
    applyPlaybackPolicy(player, visible);
  }, [player, visible]);
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  if (status === "error") {
    return (
      <EmptyState
        actions={
          <PillButton
            kind="secondary"
            onPress={retry}
            testID="media-retry"
            title="Try again"
          />
        }
        artwork="alert"
        description="The file didn’t play. Its link may have expired, or this device can’t play its format."
        title="Couldn’t play this file"
      />
    );
  }
  const view = (
    <VideoView
      accessibilityLabel={`${title}, ${video ? "video" : "audio"} player`}
      allowsPictureInPicture={false}
      contentFit="contain"
      fullscreenOptions={{ enable: video }}
      nativeControls
      player={player}
      style={video ? styles.video : styles.audioPlayer}
      testID="media-player"
    />
  );
  if (video) {
    return view;
  }
  return (
    <View style={styles.audio}>
      <Glyph color={colors.inkSecondary} size={ARTWORK_SIZE} symbol="audio" />
      {view}
    </View>
  );
};
