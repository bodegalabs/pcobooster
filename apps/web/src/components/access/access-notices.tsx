import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useAccessReview } from "@/components/access/access-review";
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
  const { demo, isSigningOut, switchingAccountId, switchAccount } =
    useAccountPanel();
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
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
            disabled={isSigningOut || switchingAccountId !== null}
            onClick={() => {
              void switchAccount();
            }}
          >
            Use a different account
          </Button>
        )}
      </Empty>
    </main>
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
  const { openReview } = useAccessReview();
  if (abilities === null) {
    return null;
  }
  const message = planAccessMessage(view, abilities);
  if (message === null) {
    return null;
  }
  return (
    <Alert variant="info" className="mb-3 shrink-0">
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
