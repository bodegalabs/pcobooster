import {
  Camera01Icon,
  CameraVideoIcon,
  DrumIcon,
  GuitarIcon,
  LiveStreaming01Icon,
  MicVocalIcon,
  Music01Icon,
  MusicNote01Icon,
  Speaker01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { resolvePositionIconId } from "@pcobooster/planning-center-models/position-icon";
import type { PositionIconId } from "@pcobooster/planning-center-models/position-icon";
import { KeyboardMusic } from "lucide-react";

import { cn } from "@/lib/utils";

const POSITION_ICONS = {
  camera: Camera01Icon,
  "camera-video": CameraVideoIcon,
  drum: DrumIcon,
  guitar: GuitarIcon,
  livestream: LiveStreaming01Icon,
  "mic-vocal": MicVocalIcon,
  sound: Speaker01Icon,
  music: Music01Icon,
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
      <KeyboardMusic
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

export const TeamPickerIcon = ({
  teamName,
  className,
}: {
  teamName: string;
  className?: string;
}) => (
  <PositionPickerIcon
    positionName={teamName}
    teamName={teamName}
    className={className}
  />
);
