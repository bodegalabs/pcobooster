import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTitle,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import { getInitials } from "@/lib/format/initials";
import { queryKeys } from "@/lib/query-keys";
import { collectUnnotifiedPeople } from "@/lib/schedule/scheduling-notifications";
import type { UnnotifiedPerson } from "@/lib/schedule/scheduling-notifications";
import { cn } from "@/lib/utils";

const describeCount = (count: number) =>
  count === 1 ? "1 person not notified" : `${count} people not notified`;

const describePositions = (person: UnnotifiedPerson) =>
  person.assignments
    .map(({ slot }) => `${slot.positionName} · ${slot.teamName}`)
    .join(", ");

const UnnotifiedPersonRow = ({ person }: { person: UnnotifiedPerson }) => (
  <li className="flex min-h-11 items-center gap-2.5 px-2 py-1.5">
    <Avatar size="sm">
      <AvatarImage src={person.photoThumbnailUrl ?? undefined} alt="" />
      <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
    </Avatar>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{person.name}</p>
      <p className="text-muted-foreground truncate text-xs">
        {describePositions(person)}
      </p>
    </div>
  </li>
);

/**
 * Refetches the plan's roster when the scheduler comes back from Planning Center, where the
 * native send happens. The public API has no send action, so the roster is the only proof.
 */
const useRecheckOnReturn = (armed: boolean, recheck: () => void) => {
  const onReturn = useEffectEvent(() => {
    if (armed && document.visibilityState === "visible") {
      recheck();
    }
  });

  useEffect(() => {
    const handleReturn = () => {
      onReturn();
    };
    document.addEventListener("visibilitychange", handleReturn);
    window.addEventListener("focus", handleReturn);
    return () => {
      document.removeEventListener("visibilitychange", handleReturn);
      window.removeEventListener("focus", handleReturn);
    };
  }, []);
};

/**
 * Plan header control listing everyone whose scheduling email is still prepared, with a handoff
 * to Planning Center. Hidden when everyone was notified.
 */
export const UnsentNotificationsControl = ({
  groups,
  serviceTypeId,
  planId,
  seriesId,
  planningCenterUrl,
}: {
  groups: readonly TeamPositionGroup[] | undefined;
  serviceTypeId: string;
  planId: string;
  seriesId: string | null;
  planningCenterUrl: string | null | undefined;
}) => {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.teamPositions(serviceTypeId, planId, seriesId);
  const isChecking = useIsFetching({ queryKey }) > 0;
  const [open, setOpen] = useState(false);
  const [awaitingSend, setAwaitingSend] = useState(false);
  const people = useMemo(() => collectUnnotifiedPeople(groups ?? []), [groups]);
  const count = people.length;

  const recheck = async () => {
    await queryClient.invalidateQueries({ queryKey, exact: true });
    const latest = queryClient.getQueryData<TeamPositionGroup[]>(queryKey);
    if (latest !== undefined && collectUnnotifiedPeople(latest).length === 0) {
      setAwaitingSend(false);
      toast.success("Everyone on this plan has been notified");
    }
  };
  useRecheckOnReturn(awaitingSend, () => {
    void recheck();
  });

  if (count === 0) {
    return null;
  }

  const label = describeCount(count);

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={label}
          />
        }
      >
        <Mail className="text-status-info" aria-hidden />
        <span className="tabular-nums">{count}</span>
        <span className="max-md:hidden">not notified</span>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        align="end"
        className="w-[380px] max-w-[calc(100vw-2rem)]"
      >
        <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
          <ResponsivePopoverTitle>{label}</ResponsivePopoverTitle>
          <p className="text-muted-foreground text-sm">
            Planning Center hasn&apos;t sent their scheduling email, so they
            can&apos;t see this plan or accept yet.
          </p>
        </div>
        <ul className="max-h-72 overflow-y-auto px-2">
          {people.map((person) => (
            <UnnotifiedPersonRow key={person.key} person={person} />
          ))}
        </ul>
        <div className="border-border/60 mt-2 flex flex-col gap-3 border-t px-4 py-3">
          <p className="text-muted-foreground text-xs">
            Emails can only be sent from Planning Center. On the plan, open{" "}
            <span className="text-foreground font-medium">Teams</span>, select
            the envelope at the top right, and choose{" "}
            <span className="text-foreground font-medium">
              Only people with Prepared Notifications
            </span>
            .
          </p>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isChecking}
              onClick={() => {
                void recheck();
              }}
            >
              <RefreshCw
                className={cn(isChecking && "animate-spin")}
                aria-hidden
                data-icon="inline-start"
              />
              {isChecking ? "Checking" : "Check again"}
            </Button>
            {isNonEmptyString(planningCenterUrl) ? (
              <a
                href={planningCenterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: "sm" })}
                onClick={() => {
                  setAwaitingSend(true);
                }}
              >
                Send in Planning Center
                <ExternalLink aria-hidden data-icon="inline-end" />
              </a>
            ) : null}
          </div>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
};
