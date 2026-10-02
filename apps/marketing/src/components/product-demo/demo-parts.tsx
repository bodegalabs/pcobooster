// Per-icon imports: the package barrel references Grid*x* files whose on-disk
// names are Grid*X*, which breaks bundlers on case-sensitive filesystems.
import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import Coffee01Icon from "@hugeicons/core-free-icons/Coffee01Icon";
import DrumIcon from "@hugeicons/core-free-icons/DrumIcon";
import GuitarIcon from "@hugeicons/core-free-icons/GuitarIcon";
import HandPrayerIcon from "@hugeicons/core-free-icons/HandPrayerIcon";
import LiveStreaming01Icon from "@hugeicons/core-free-icons/LiveStreaming01Icon";
import MicVocalIcon from "@hugeicons/core-free-icons/MicVocalIcon";
import MusicNote01Icon from "@hugeicons/core-free-icons/MusicNote01Icon";
import Speaker01Icon from "@hugeicons/core-free-icons/Speaker01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { KeyboardMusic } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import { DemoButton } from "../ui/demo-control";
import { initials } from "./demo-model";
import type { DemoPerson, PositionIcon } from "./fixtures";

import styles from "./product-demo.module.css";

const POSITION_ICONS: Record<Exclude<PositionIcon, "keys">, IconSvgElement> = {
  guitar: GuitarIcon,
  bass: GuitarIcon,
  drum: DrumIcon,
  mic: MicVocalIcon,
  sound: Speaker01Icon,
  lyrics: MusicNote01Icon,
  camera: Camera01Icon,
  livestream: LiveStreaming01Icon,
  coffee: Coffee01Icon,
  greeter: HandPrayerIcon,
};

export const DemoIcon = ({
  icon,
  className = styles.icon,
}: {
  icon: IconSvgElement;
  className?: string;
}) => (
  <HugeiconsIcon
    icon={icon}
    strokeWidth={2}
    className={className}
    aria-hidden
  />
);

export const PositionGlyph = ({ icon }: { icon: PositionIcon }) =>
  icon === "keys" ? (
    <KeyboardMusic className={styles["position-icon"]} aria-hidden />
  ) : (
    <DemoIcon icon={POSITION_ICONS[icon]} className={styles["position-icon"]} />
  );

export type Tone = "confirmed" | "pending" | "declined";

export const StatusDot = ({ tone, label }: { tone: Tone; label?: string }) => (
  <span
    className={styles.dot}
    data-tone={tone}
    role={label === undefined ? undefined : "img"}
    aria-label={label}
    aria-hidden={label === undefined ? true : undefined}
  />
);

export const Avatar = ({
  person,
  alsoScheduled = false,
  muted = false,
}: {
  person: DemoPerson;
  /** Scheduled for another position on the same plan. */
  alsoScheduled?: boolean;
  muted?: boolean;
}) => (
  <span
    className={styles.avatar}
    data-also-scheduled={alsoScheduled ? "" : undefined}
    data-muted={muted ? "" : undefined}
    aria-hidden
  >
    {initials(person)}
  </span>
);

/** An avatar with a corner dot for this assignment's status. */
export const AvatarStatus = ({
  person,
  status,
  alsoScheduled = false,
  muted = false,
}: {
  person: DemoPerson;
  status?: Tone;
  alsoScheduled?: boolean;
  muted?: boolean;
}) => (
  <span className={styles["avatar-status"]}>
    <Avatar person={person} alsoScheduled={alsoScheduled} muted={muted} />
    {status === undefined ? null : <StatusDot tone={status} />}
  </span>
);

const scoreTone = (score: number): Tone => {
  if (score >= 80) {
    return "confirmed";
  }
  if (score >= 50) {
    return "pending";
  }
  return "declined";
};

export const FitMeter = ({
  score,
  reasons,
}: {
  score: number;
  reasons: readonly string[];
}) => {
  const barStyle: CSSProperties & { "--score": string } = {
    "--score": `${Math.max(3, score)}%`,
  };
  return (
    <DemoButton
      variant="hover-trigger"
      aria-label={`${score} fit. ${reasons.join(". ")}`}
    >
      <span className={styles.score} data-tone={scoreTone(score)}>
        <span className={styles["score-value"]}>
          {score}
          <small>fit</small>
        </span>
        <span className={styles["score-track"]}>
          <span className={styles["score-bar"]} style={barStyle} />
        </span>
        <span className={styles["hover-card"]} aria-hidden>
          <strong>Why {score} fit</strong>
          {reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </span>
      </span>
    </DemoButton>
  );
};

/** Closes a floating panel on outside press or Escape. */
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) => {
  const dismiss = useEffectEvent((target: EventTarget | null) => {
    const isInside = target instanceof Node && ref.current?.contains(target);
    if (open && isInside !== true) {
      onClose();
    }
  });

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      dismiss(event.target);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss(null);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);
};

export const Panel = ({
  children,
  label,
  align = "start",
}: {
  children: ReactNode;
  label: string;
  align?: "start" | "end";
}) => (
  <dialog open className={styles.panel} data-align={align} aria-label={label}>
    {children}
  </dialog>
);
