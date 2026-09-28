import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useAccessReview } from "@/components/access/access-review";
import { PageShell } from "@/components/page-shell";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAccountPanel } from "@/hooks/use-account-panel";
import { useServiceTypeAbilities } from "@/hooks/use-planning-center-access";
import { planAccessMessage } from "@/lib/planning-center-access";
import type { DashboardView } from "@/lib/schedule-navigation";

/** Shown instead of the product when the account can't open Services at all. */
export const NoServicesAccess = () => {
  const { demo, isSigningOut, switchAccount } = useAccountPanel();
  return (
    <PageShell layout="center">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            Your account can’t open Planning Center Services
          </EmptyTitle>
          <EmptyDescription>
            pcobooster.com works on top of Services, so there’s nothing to show
            yet. Ask a Planning Center admin to give you access to Services,
            then come back.
          </EmptyDescription>
        </EmptyHeader>
        {demo ? null : (
          <Button
            variant="outline"
            disabled={isSigningOut}
            onClick={() => {
              void switchAccount();
            }}
          >
            Use a different account
          </Button>
        )}
      </Empty>
    </PageShell>
  );
};

/** Says up front which parts of a plan view the person's permissions hold back. */
export const PlanAccessNotice = ({
  serviceTypeId,
  view,
}: {
  serviceTypeId: string | null;
  view: DashboardView;
}) => {
  const abilities = useServiceTypeAbilities(serviceTypeId);
  const { openReview, demo } = useAccessReview();
  // The demo is read-only anyway, and says so in its own badge.
  if (abilities === null || demo) {
    return null;
  }
  const message = planAccessMessage(view, abilities);
  if (message === null) {
    return null;
  }
  return (
    <Alert variant="info" className="shrink-0">
      <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} aria-hidden />
      <AlertTitle>{message.title}</AlertTitle>
      <AlertDescription>{message.description}</AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="xs" onClick={openReview}>
          Your access
        </Button>
      </AlertAction>
    </Alert>
  );
};
