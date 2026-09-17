"use client";

import {
  Camera01Icon,
  CameraVideoIcon,
  DrumIcon,
  GuitarIcon,
  LiveStreaming01Icon,
  MicVocalIcon,
  MusicIcon,
  MusicNote01Icon,
  Speaker01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Piano } from "lucide-react";

import { resolvePositionIconId } from "@/lib/format/position-icon";
import type { PositionIconId } from "@/lib/format/position-icon";
import { cn } from "@/lib/utils";

const POSITION_ICONS = {
  camera: Camera01Icon,
  "camera-video": CameraVideoIcon,
  drum: DrumIcon,
  guitar: GuitarIcon,
  livestream: LiveStreaming01Icon,
  "mic-vocal": MicVocalIcon,
  sound: Speaker01Icon,
  music: MusicIcon,
  "music-note": MusicNote01Icon,
} satisfies Record<Exclude<PositionIconId, "piano">, typeof Camera01Icon>;

const positionPickerIconClassName = (className?: string) =>
  cn("text-muted-foreground size-4 shrink-0 opacity-80", className);

export const PositionPickerIcon = ({
  positionName,
  teamName,
  className,
}: {
  positionName: string;
  teamName: string;
  className?: string;
}) => {
  const iconId = resolvePositionIconId(positionName, teamName);

  if (iconId === "piano") {
    return (
      <Piano
        className={positionPickerIconClassName(className)}
        strokeWidth={2}
        aria-hidden
      />
    );
  }

  return (
    <HugeiconsIcon
      icon={POSITION_ICONS[iconId]}
      strokeWidth={2}
      className={positionPickerIconClassName(className)}
      aria-hidden
    />
  );
};
