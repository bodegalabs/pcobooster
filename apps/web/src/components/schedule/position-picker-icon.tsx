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
import { KeyboardMusic } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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

export interface PositionIconEntry {
  key: string;
  positionName: string;
  teamName: string;
}

export const PositionIconsHoverCard = ({
  label,
  positions,
  iconClassName,
}: {
  label: string;
  positions: PositionIconEntry[];
  iconClassName?: string;
}) => (
  <HoverCard>
    <HoverCardTrigger
      render={<button type="button" aria-label={label} />}
      className="inline-flex cursor-default items-center justify-end gap-0.5 rounded-md"
    >
      {positions.map((position) => (
        <PositionPickerIcon
          key={position.key}
          positionName={position.positionName}
          teamName={position.teamName}
          className={iconClassName}
        />
      ))}
    </HoverCardTrigger>
    <HoverCardContent side="top">{label}</HoverCardContent>
  </HoverCard>
);
