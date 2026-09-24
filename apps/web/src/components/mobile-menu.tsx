import { useRender } from "@base-ui/react/use-render";
import {
  Calendar04Icon,
  Cancel01Icon,
  Clock01Icon,
  LaptopIcon,
  Layout3ColumnIcon,
  ListMusicIcon,
  Logout01Icon,
  Menu01Icon,
  Moon02Icon,
  Sun01Icon,
  Tick02Icon,
  UserAdd01Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";

import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Item } from "@/components/ui/item";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signOutLabel, useAccountPanel } from "@/hooks/use-account-panel";
import { usePlanRoute } from "@/hooks/use-plan-route";
import type { PlanView } from "@/lib/app-routes";
import { getAppSection, getPlanViewLabel, planViews } from "@/lib/app-routes";
import { peopleFeatureQueryOptions } from "@/lib/people-route";
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

const MenuRow = ({
  link,
  active,
  nested,
  children,
}: {
  link: ReactElement;
  active: boolean;
  nested: boolean;
  children: ReactNode;
}) =>
  useRender({
    render: link,
    props: {
      "aria-current": active ? "page" : undefined,
      className: cn(
        "focus-visible:ring-ring/50 flex h-12 items-center gap-3 rounded-xl px-3 text-lg font-medium outline-none focus-visible:ring-2",
        nested && "h-11 pl-9 text-base",
        active ? "bg-muted text-foreground" : "text-muted-foreground"
      ),
      children,
    },
  });

const MenuLink = ({
  link,
  icon,
  label,
  active,
  nested = false,
}: {
  /** A router `<Link>`; the row renders through it. */
  link: ReactElement;
  icon: IconSvgElement;
  label: string;
  active: boolean;
  nested?: boolean;
}) => (
  <li>
    <MenuRow link={link} active={active} nested={nested}>
      <SidebarNavIcon icon={icon} />
      {label}
    </MenuRow>
  </li>
);

const MenuNav = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const section = getAppSection(pathname);
  const planRoute = usePlanRoute();
  const peopleEnabled =
    useQuery(peopleFeatureQueryOptions).data?.enabled ?? false;

  return (
    <nav aria-label="Primary">
      <ul className="flex flex-col gap-1">
        <MenuLink
          link={<Link to="/services" />}
          icon={Calendar04Icon}
          label="Services"
          active={pathname === "/services"}
        />
        {planRoute === null
          ? null
          : planViews.map((view) => (
              <MenuLink
                key={view}
                nested
                // Keeps the selected slot across views.
                link={
                  <Link
                    to="/services/$serviceTypeId/plans/$planId/$view"
                    params={{ ...planRoute, view }}
                    search
                    replace
                  />
                }
                icon={planViewIcons[view]}
                label={getPlanViewLabel(view)}
                active={view === planRoute.view}
              />
            ))}
        {peopleEnabled ? (
          <MenuLink
            link={<Link to="/people" />}
            icon={UsersIcon}
            label="People"
            active={section === "people"}
          />
        ) : null}
      </ul>
    </nav>
  );
};

const MenuAccount = ({
  onAccountSwitched,
}: {
  onAccountSwitched: () => void;
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
  } = useAccountPanel({ onAccountSwitched });
  const accounts = data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground px-1 text-xs font-medium">
          {data?.session.name ?? "Account"}
          {demo ? " · Read-only demo" : null}
        </h3>
        {loading && !data ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner /> Loading organizations…
          </div>
        ) : null}
        {accounts.length > 1 ? (
          <ul className="bg-card ring-foreground/5 flex flex-col overflow-hidden rounded-2xl p-1 ring-1">
            {accounts.map((account) => {
              const isSelected = account.id === data?.selectedAccountId;
              const orgName =
                account.identity?.organizationName ?? "Unknown organization";
              return (
                <li key={account.id}>
                  <Item
                    size="sm"
                    render={
                      <button
                        type="button"
                        aria-label={orgName}
                        disabled={Boolean(switchingAccountId) || isSigningOut}
                      />
                    }
                    onClick={() => {
                      void selectAccount(account.id);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {orgName}
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
        ) : (
          <p className="bg-card ring-foreground/5 rounded-2xl px-4 py-3 text-sm font-medium ring-1">
            {summary.organizationName}
          </p>
        )}
      </section>

      <Tabs
        value={theme}
        onValueChange={(value) => {
          const option = themeOptions.find(
            (candidate) => candidate.value === value
          );
          if (option) {
            setTheme(option.value);
          }
        }}
      >
        <TabsList className="h-11! w-full" aria-label="Appearance">
          {themeOptions.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              <SidebarNavIcon icon={option.icon} className="size-4" />
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
        {isSigningOut ? <Spinner /> : <SidebarNavIcon icon={Logout01Icon} />}
        {signOutLabel(demo, isSigningOut)}
      </Button>
    </div>
  );
};

/** Phone navigation: a header menu button that opens a full-screen menu. */
export const MobileMenu = ({ className }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", () => {
        setOpen(false);
      }),
    [router]
  );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Open menu"
        aria-expanded={open}
        className={cn("shrink-0 md:hidden", className)}
        onClick={() => {
          setOpen(true);
        }}
      >
        <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="full" showCloseButton={false}>
          <div className="pt-safe flex h-full min-h-0 flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2 px-4">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Navigate pcobooster.com and manage your account.
              </SheetDescription>
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Close menu"
                    className="-mr-2 ml-auto"
                  />
                }
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              </SheetClose>
            </div>
            <div className="pb-safe-4 flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto overscroll-contain px-4 pt-2">
              <MenuNav />
              <MenuAccount
                onAccountSwitched={() => {
                  setOpen(false);
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
