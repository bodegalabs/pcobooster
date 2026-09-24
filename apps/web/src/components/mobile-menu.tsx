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
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";

import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { signOutLabel, useAccountPanel } from "@/hooks/use-account-panel";
import { usePlanRoute } from "@/hooks/use-plan-route";
import type { PlanView } from "@/lib/app-routes";
import { getAppSection, getPlanViewLabel, planViews } from "@/lib/app-routes";
import { getInitials } from "@/lib/format/initials";
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

/** One plain menu row; `render` is a router `<Link>` or a bare `<button />`. */
const MenuRow = ({
  render,
  active = false,
  nested = false,
  children,
  ...props
}: {
  render: ReactElement;
  active?: boolean;
  nested?: boolean;
  children: ReactNode;
} & Pick<
  ComponentProps<"button">,
  "aria-current" | "aria-label" | "disabled" | "onClick"
>) =>
  useRender({
    render,
    props: {
      ...props,
      className: cn(
        "focus-visible:ring-ring/50 flex h-12 w-full items-center gap-4 rounded-lg text-left text-base outline-none focus-visible:ring-2 disabled:opacity-50",
        nested && "h-10 pl-9 text-sm",
        active ? "text-foreground font-medium" : "text-muted-foreground"
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
    <MenuRow
      render={link}
      active={active}
      nested={nested}
      aria-current={active ? "page" : undefined}
    >
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
      <ul className="flex flex-col">
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

const themeCycle = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;

const MenuAccount = ({
  onAccountSwitched,
}: {
  onAccountSwitched: () => void;
}) => {
  const { setTheme, theme } = useTheme();
  const {
    data,
    demo,
    summary,
    panelError,
    switchingAccountId,
    isSigningOut,
    selectAccount,
    signOut,
  } = useAccountPanel({ onAccountSwitched });
  const accounts = data?.accounts ?? [];
  const themeOption =
    themeOptions.find((option) => option.value === theme) ?? themeOptions[2];
  const busy = isSigningOut || Boolean(switchingAccountId);

  return (
    <div className="flex flex-col gap-1">
      {accounts.length > 1
        ? accounts.map((account) => {
            const isSelected = account.id === data?.selectedAccountId;
            return (
              <MenuRow
                key={account.id}
                render={
                  <button
                    type="button"
                    aria-label={
                      account.identity?.organizationName ??
                      "Unknown organization"
                    }
                  />
                }
                active={isSelected}
                disabled={busy}
                onClick={() => {
                  void selectAccount(account.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {account.identity?.organizationName ?? "Unknown organization"}
                </span>
                {switchingAccountId === account.id ? <Spinner /> : null}
                {isSelected ? <SidebarNavIcon icon={Tick02Icon} /> : null}
              </MenuRow>
            );
          })
        : null}
      <MenuRow
        render={
          <button
            type="button"
            aria-label={`Theme: ${themeOption.label}. Switch theme`}
          />
        }
        onClick={() => {
          setTheme(themeCycle[themeOption.value]);
        }}
      >
        <SidebarNavIcon icon={themeOption.icon} />
        {themeOption.label}
      </MenuRow>
      <MenuRow
        render={
          <button type="button" aria-label={signOutLabel(demo, isSigningOut)} />
        }
        disabled={busy}
        onClick={() => {
          void signOut();
        }}
      >
        {isSigningOut ? <Spinner /> : <SidebarNavIcon icon={Logout01Icon} />}
        {signOutLabel(demo, isSigningOut)}
      </MenuRow>
      {panelError ? (
        <p className="text-destructive text-sm">{panelError}</p>
      ) : null}
      <div className="border-border/50 mt-4 flex items-center gap-3 border-t pt-5">
        <Avatar className="size-9">
          {isNonEmptyString(summary.image) ? (
            <AvatarImage src={summary.image} alt="" />
          ) : null}
          <AvatarFallback>
            {getInitials(summary.avatarName ?? "Account")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {data?.session.name ?? summary.avatarName ?? "Account"}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {demo ? "Read-only demo" : summary.organizationName}
          </p>
        </div>
      </div>
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
            <div className="flex h-12 shrink-0 items-center gap-2 px-2">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Navigate pcobooster.com and manage your account.
              </SheetDescription>
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Close menu"
                    className="ml-auto"
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
            <div className="pb-safe-4 flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto overscroll-contain px-6 pt-4">
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
