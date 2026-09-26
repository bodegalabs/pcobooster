import type { PeopleDashboardPerson } from "@pcobooster/contracts/people-schemas";
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Item } from "@/components/ui/item";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";
import { parsePlanRoute } from "@/lib/app-routes";
import { cn } from "@/lib/utils";

export const CommitmentEntryText = ({
  entry,
}: {
  entry: PeopleDashboardPerson["monthDays"][number];
}) => {
  const hasServiceType =
    entry.serviceTypeName !== undefined && entry.serviceTypeName !== "";
  // The API links each commitment to its plan workspace.
  const planRoute =
    entry.planUrl === undefined ? null : parsePlanRoute(entry.planUrl);

  return (
    <>
      {entry.positionName ?? "Scheduled"}
      {hasServiceType ? (
        <>
          {" · "}
          {planRoute ? (
            <Link
              to="/services/$serviceTypeId/plans/$planId/$view"
              params={planRoute}
              className="text-foreground font-medium underline-offset-2 hover:underline"
            >
              {entry.serviceTypeName}
            </Link>
          ) : (
            entry.serviceTypeName
          )}
        </>
      ) : null}
    </>
  );
};

export const PersonAvatar = ({ person }: { person: PeopleDashboardPerson }) => {
  const hasPhoto =
    person.photoThumbnailUrl !== null && person.photoThumbnailUrl !== "";

  return (
    <Avatar size="sm">
      {hasPhoto ? (
        <AvatarImage
          src={person.photoThumbnailUrl ?? ""}
          alt={person.name}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback>{person.initials}</AvatarFallback>
    </Avatar>
  );
};

export const LegendDot = ({
  className,
  label,
}: {
  className: string;
  label: string;
}) => (
  <div className="flex items-center gap-2">
    <span className={cn("size-2 rounded-full", className)} />
    <span className="text-muted-foreground">{label}</span>
  </div>
);

export type MeterTone = "positive" | "attention" | "negative" | "neutral";

const meterToneClassName: Record<MeterTone, string> = {
  positive: "bg-status-confirmed-bright",
  attention: "bg-status-scheduled-bright",
  negative: "bg-status-declined-bright",
  neutral: "bg-primary/70",
};

type MeterStyle = CSSProperties & {
  "--meter-fill": string;
  "--meter-marker": string;
};

const toPercent = (fraction: number) =>
  `${Math.min(1, Math.max(0, fraction)) * 100}%`;

/** A thin bar for a 0 to 1 share, with an optional tick at a reference point. */
export const Meter = ({
  value,
  tone = "neutral",
  marker,
  className,
}: {
  value: number;
  tone?: MeterTone;
  /** A 0 to 1 reference point, such as someone's usual gap. */
  marker?: number | null;
  className?: string;
}) => {
  const style: MeterStyle = {
    "--meter-fill": toPercent(value),
    "--meter-marker": toPercent(marker ?? 0),
  };
  return (
    <span
      aria-hidden
      className={cn("bg-muted relative block h-1.5 rounded-full", className)}
      style={style}
    >
      <span
        className={cn(
          "block h-full w-(--meter-fill) rounded-full",
          meterToneClassName[tone]
        )}
      />
      {marker === null || marker === undefined ? null : (
        <span className="bg-foreground/50 absolute -top-0.5 left-(--meter-marker) h-2.5 w-px" />
      )}
    </span>
  );
};

export const Metric = ({
  label,
  value,
  meter,
  tone,
}: {
  label: string;
  value: string;
  /** A 0 to 1 share drawn under the value. */
  meter?: number;
  tone?: MeterTone;
}) => (
  <div className="border-border/40 rounded-lg border px-3 py-2">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</p>
    {meter === undefined ? null : (
      <Meter value={meter} tone={tone} className="mt-2" />
    )}
  </div>
);

/** A tappable person row that prefetches on intent and opens the person. */
export const PersonRowButton = ({
  person,
  getPersonIntentProps,
  onOpenPerson,
  variant = "default",
  size = "xs",
  className,
  children,
}: {
  person: PeopleDashboardPerson;
  getPersonIntentProps: GetIntentPrefetchProps<PeopleDashboardPerson>;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
  variant?: "default" | "outline" | "muted";
  size?: "default" | "sm" | "xs" | "row";
  className?: string;
  children: ReactNode;
}) => (
  <Item
    variant={variant}
    size={size}
    className={className}
    render={<button type="button" aria-label={`Open ${person.name}`} />}
    {...getPersonIntentProps(person)}
    onClick={() => {
      onOpenPerson(person);
    }}
  >
    {children}
  </Item>
);
