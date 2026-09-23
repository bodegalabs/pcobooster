"use client";

import {
  Calendar04Icon,
  Clock01Icon,
  LaptopIcon,
  Layout3ColumnIcon,
  ListMusicIcon,
  Logout01Icon,
  Moon02Icon,
  Shield01Icon,
  Sun01Icon,
  Tick02Icon,
  UserAdd01Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signOutLabel, useAccountPanel } from "@/hooks/use-account-panel";
import type { PlanView } from "@/lib/app-routes";
import {
  buildPlanViewUrl,
  getAppSection,
  getPlanViewLabel,
  parsePlanRoute,
  planViews,
} from "@/lib/app-routes";
import { getInitials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";

const planViewIcons: Record<PlanView, IconSvgElement> = {
  assign: UserAdd01Icon,
  lineup: Layout3ColumnIcon,
  plan: ListMusicIcon,
  times: Clock01Icon,
};

const themeOptions = [
  { value: "light", label: "Light", icon: Sun01Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: LaptopIcon },
] as const;

const tabClassName =
  "text-muted-foreground data-[active=true]:text-foreground flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs leading-none font-medium outline-none select-none focus-visible:bg-muted/60";
const tabIconClassName =
  "flex h-7 w-14 items-center justify-center rounded-full group-data-[active=true]/tab:bg-accent";

const TabContent = ({
  icon,
  label,
  children,
}: {
  icon: IconSvgElement;
  label: string;
  children?: ReactNode;
}) => (
  <>
    <span className={cn(tabIconClassName, "relative")}>
      <SidebarNavIcon icon={icon} className="size-5" />
      {children}
    </span>
    <span className="max-w-full truncate">{label}</span>
  </>
);

const TabLink = ({
  href,
  icon,
  label,
  active,
  replace = false,
}: {
  href: string;
  icon: IconSvgElement;
  label: string;
  active: boolean;
  replace?: boolean;
}) => (
  <Link
    href={href}
    replace={replace}
    scroll={false}
    data-active={active}
    aria-current={active ? "page" : undefined}
    className={cn("group/tab", tabClassName)}
  >
    <TabContent icon={icon} label={label} />
  </Link>
);

const AccountAvatar = ({
  image,
  name,
  className,
}: {
  image: string | null;
  name: string | null;
  className?: string;
}) => (
  <Avatar className={className}>
    {isNonEmptyString(image) ? (
      <AvatarImage src={image} alt={name ?? "Account"} />
    ) : null}
    <AvatarFallback>{getInitials(name ?? "Account")}</AvatarFallback>
  </Avatar>
);

const MobileAccountSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { setTheme, theme } = useTheme();
  const {
    data,
    loading,
    demo,
    summary,
    panelError,
    switchingAccountId,
    isSigningOut,
    selectAccount,
    signOut,
  } = useAccountPanel({
    onAccountSwitched: () => {
      onOpenChange(false);
    },
  });
  const accounts = data?.accounts ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-3">
            <AccountAvatar
              image={summary.image}
              name={summary.avatarName}
              className="size-11"
            />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-left">
                <span className="block truncate">
                  {data?.session.name ?? summary.organizationName}
                </span>
              </DrawerTitle>
              <DrawerDescription className="text-left">
                <span className="block truncate">
                  {demo ? "Read-only demo" : (data?.session.email ?? "")}
                </span>
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 pt-3 pb-2">
          {loading && !data ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner /> Loading organizations…
            </div>
          ) : null}
          {accounts.length > 1 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-muted-foreground px-1 text-xs font-medium">
                Organization
              </h3>
              <ul className="bg-card divide-border/50 ring-foreground/5 divide-y overflow-hidden rounded-2xl ring-1">
                {accounts.map((account) => {
                  const isSelected = account.id === data?.selectedAccountId;
                  return (
                    <li key={account.id}>
                      <button
                        type="button"
                        className="active:bg-muted flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium disabled:opacity-50"
                        disabled={Boolean(switchingAccountId) || isSigningOut}
                        onClick={() => {
                          void selectAccount(account.id);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {account.identity?.organizationName ??
                            "Unknown organization"}
                        </span>
                        {switchingAccountId === account.id ? (
                          <Spinner />
                        ) : (
                          <SidebarNavIcon
                            icon={Tick02Icon}
                            className={cn(!isSelected && "invisible")}
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="bg-card ring-foreground/5 rounded-2xl px-4 py-3 text-sm font-medium ring-1">
              {summary.organizationName}
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-muted-foreground px-1 text-xs font-medium">
              Appearance
            </h3>
            <Tabs
              value={theme ?? "system"}
              onValueChange={(value) => {
                const option = themeOptions.find(
                  (candidate) => candidate.value === value
                );
                if (option) {
                  setTheme(option.value);
                }
              }}
            >
              <TabsList className="h-11! w-full">
                {themeOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    <SidebarNavIcon icon={option.icon} className="size-4" />
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </section>

          {panelError ? (
            <p className="text-destructive px-1 text-sm">{panelError}</p>
          ) : null}

          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="h-12 w-full"
            disabled={isSigningOut || Boolean(switchingAccountId)}
            onClick={() => {
              void signOut();
            }}
          >
            {isSigningOut ? (
              <Spinner />
            ) : (
              <SidebarNavIcon icon={Logout01Icon} />
            )}
            {signOutLabel(demo, isSigningOut)}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

const barClassName =
  "border-border/60 bg-background/85 supports-backdrop-filter:bg-background/70 shrink-0 border-t pb-safe backdrop-blur-xl md:hidden";

const PlanTabBar = ({ view }: { view: PlanView }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav aria-label="Plan views" className={barClassName}>
      <div className="flex h-15 items-stretch px-1">
        {planViews.map((planView) => (
          <TabLink
            key={planView}
            href={buildPlanViewUrl(pathname, searchParams, planView)}
            icon={planViewIcons[planView]}
            label={getPlanViewLabel(planView)}
            active={planView === view}
            replace
          />
        ))}
      </div>
    </nav>
  );
};

const SectionTabBar = ({
  peopleEnabled,
  adminEnabled,
}: {
  peopleEnabled: boolean;
  adminEnabled: boolean;
}) => {
  const pathname = usePathname();
  const section = getAppSection(pathname);
  const [accountOpen, setAccountOpen] = useState(false);
  const { summary } = useAccountPanel();

  return (
    <>
      <nav aria-label="Primary" className={barClassName}>
        <div className="flex h-15 items-stretch px-1">
          <TabLink
            href="/services"
            icon={Calendar04Icon}
            label="Services"
            active={section === "services"}
          />
          {peopleEnabled ? (
            <TabLink
              href="/people"
              icon={UsersIcon}
              label="People"
              active={section === "people"}
            />
          ) : null}
          {adminEnabled ? (
            <TabLink
              href="/admin"
              icon={Shield01Icon}
              label="Admin"
              active={section === "admin"}
            />
          ) : null}
          <button
            type="button"
            data-active={accountOpen}
            className={cn("group/tab", tabClassName)}
            aria-haspopup="dialog"
            onClick={() => {
              setAccountOpen(true);
            }}
          >
            <span className={tabIconClassName}>
              <AccountAvatar
                image={summary.image}
                name={summary.avatarName}
                className="size-6"
              />
            </span>
            <span>Account</span>
          </button>
        </div>
      </nav>
      <MobileAccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  );
};

/** Thumb-reach navigation for phones: plan views inside a plan, sections elsewhere. */
export const MobileTabBar = ({
  peopleEnabled,
  adminEnabled,
}: {
  peopleEnabled: boolean;
  adminEnabled: boolean;
}) => {
  const pathname = usePathname();
  const planRoute = parsePlanRoute(pathname);

  if (planRoute) {
    return <PlanTabBar view={planRoute.view} />;
  }
  return (
    <SectionTabBar peopleEnabled={peopleEnabled} adminEnabled={adminEnabled} />
  );
};
