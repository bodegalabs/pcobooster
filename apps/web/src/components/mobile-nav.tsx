"use client";

import {
  Calendar04Icon,
  Clock01Icon,
  LaptopIcon,
  Layout3ColumnIcon,
  ListMusicIcon,
  Logout01Icon,
  Moon02Icon,
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
import { Item } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { TabBar, TabBarItem } from "@/components/ui/tab-bar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signOutLabel, useAccountPanel } from "@/hooks/use-account-panel";
import type { AppSection, PlanView } from "@/lib/app-routes";
import {
  buildPlanViewUrl,
  getAppSection,
  getPlanViewLabel,
  parsePlanRoute,
  planViews,
} from "@/lib/app-routes";
import { getInitials } from "@/lib/format/initials";
import { updatePlanWorkspaceUrl } from "@/lib/schedule-navigation";
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

const TabLink = ({
  href,
  icon,
  label,
  active,
  replace = false,
  handleNavigate,
}: {
  href: string;
  icon: IconSvgElement;
  label: string;
  active: boolean;
  replace?: boolean;
  handleNavigate?: (event: { preventDefault: () => void }) => void;
}) => (
  <TabBarItem
    active={active}
    aria-current={active ? "page" : undefined}
    render={
      <Link
        href={href}
        replace={replace}
        scroll={false}
        onNavigate={handleNavigate}
      />
    }
  >
    <SidebarNavIcon icon={icon} />
    <span className="max-w-full truncate">{label}</span>
  </TabBarItem>
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
              <ul className="bg-card ring-foreground/5 flex flex-col overflow-hidden rounded-2xl p-1 ring-1">
                {accounts.map((account) => {
                  const isSelected = account.id === data?.selectedAccountId;
                  return (
                    <li key={account.id}>
                      <Item
                        size="sm"
                        render={
                          <button
                            type="button"
                            aria-label={
                              account.identity?.organizationName ??
                              "Unknown organization"
                            }
                            disabled={
                              Boolean(switchingAccountId) || isSigningOut
                            }
                          />
                        }
                        onClick={() => {
                          void selectAccount(account.id);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
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
                      </Item>
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

const PlanTabBar = ({ view }: { view: PlanView }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <TabBar
      aria-label="Plan views"
      tabCount={planViews.length}
      activeIndex={planViews.indexOf(view)}
    >
      {planViews.map((planView) => {
        const href = buildPlanViewUrl(pathname, searchParams, planView);
        return (
          <TabLink
            key={planView}
            href={href}
            icon={planViewIcons[planView]}
            label={getPlanViewLabel(planView)}
            active={planView === view}
            replace
            handleNavigate={(event) => {
              if (updatePlanWorkspaceUrl(pathname, href, "replace")) {
                event.preventDefault();
              }
            }}
          />
        );
      })}
    </TabBar>
  );
};

interface SectionTab {
  section: AppSection;
  href: string;
  icon: IconSvgElement;
  label: string;
}

const SectionTabBar = ({ peopleEnabled }: { peopleEnabled: boolean }) => {
  const pathname = usePathname();
  const section = getAppSection(pathname);
  const [accountOpen, setAccountOpen] = useState(false);
  const { summary } = useAccountPanel();
  const tabs: SectionTab[] = [
    {
      section: "services",
      href: "/services",
      icon: Calendar04Icon,
      label: "Services",
    },
  ];
  if (peopleEnabled) {
    tabs.push({
      section: "people",
      href: "/people",
      icon: UsersIcon,
      label: "People",
    });
  }
  const activeIndex = tabs.findIndex((tab) => tab.section === section);

  return (
    <>
      <TabBar
        aria-label="Primary"
        tabCount={tabs.length + 1}
        activeIndex={activeIndex}
      >
        {tabs.map((tab) => (
          <TabLink
            key={tab.section}
            href={tab.href}
            icon={tab.icon}
            label={tab.label}
            active={tab.section === section}
          />
        ))}
        <TabBarItem
          active={accountOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setAccountOpen(true);
          }}
        >
          <AccountAvatar
            image={summary.image}
            name={summary.avatarName}
            className="size-6"
          />
          <span>Account</span>
        </TabBarItem>
      </TabBar>
      <MobileAccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  );
};

/** Thumb-reach navigation for phones: plan views inside a plan, sections elsewhere. */
export const MobileTabBar = ({ peopleEnabled }: { peopleEnabled: boolean }) => {
  const pathname = usePathname();
  const planRoute = parsePlanRoute(pathname);

  if (planRoute) {
    return <PlanTabBar view={planRoute.view} />;
  }
  return <SectionTabBar peopleEnabled={peopleEnabled} />;
};
