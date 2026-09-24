import { useRender } from "@base-ui/react/use-render";
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
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import type {
  CSSProperties,
  ComponentProps,
  ReactElement,
  ReactNode,
} from "react";
import { useEffect, useId, useRef, useState } from "react";

import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
        "focus-visible:ring-ring/50 flex h-14 w-full items-center gap-4 rounded-lg text-left text-xl outline-none focus-visible:ring-2 disabled:opacity-50 [&_svg]:size-6",
        nested && "h-12 pl-10 text-lg [&_svg]:size-5",
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
  const themeSelectId = useId();

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
      <div className="text-muted-foreground flex h-14 items-center gap-4 text-xl [&_svg]:size-6">
        <SidebarNavIcon icon={themeOption.icon} />
        <label htmlFor={themeSelectId} className="flex-1">
          Theme
        </label>
        <NativeSelect
          id={themeSelectId}
          value={themeOption.value}
          onChange={(event) => {
            const option = themeOptions.find(
              (candidate) => candidate.value === event.target.value
            );
            if (option) {
              setTheme(option.value);
            }
          }}
        >
          {themeOptions.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
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
        <Avatar className="size-11">
          {isNonEmptyString(summary.image) ? (
            <AvatarImage src={summary.image} alt="" />
          ) : null}
          <AvatarFallback>
            {getInitials(summary.avatarName ?? "Account")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-base font-medium">
            {data?.session.name ?? summary.avatarName ?? "Account"}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {demo ? "Read-only demo" : summary.organizationName}
          </p>
        </div>
      </div>
    </div>
  );
};

/** Three bars that fold into an X; `open` picks the resting shape. */
const MenuToggleIcon = ({ open }: { open: boolean }) => (
  <span aria-hidden className="relative block size-5">
    <span
      className={cn(
        "absolute top-1/2 left-0.5 h-0.5 w-4 rounded-full bg-current transition-transform duration-200 ease-out",
        open
          ? "rotate-45 in-data-ending-style:-translate-y-[6px] in-data-ending-style:rotate-0 in-data-starting-style:-translate-y-[6px] in-data-starting-style:rotate-0"
          : "-translate-y-[6px]"
      )}
    />
    <span
      className={cn(
        "absolute top-1/2 left-0.5 h-0.5 w-4 rounded-full bg-current transition-opacity duration-200",
        open &&
          "opacity-0 in-data-ending-style:opacity-100 in-data-starting-style:opacity-100"
      )}
    />
    <span
      className={cn(
        "absolute top-1/2 left-0.5 h-0.5 w-4 rounded-full bg-current transition-transform duration-200 ease-out",
        open
          ? "-rotate-45 in-data-ending-style:translate-y-[6px] in-data-ending-style:rotate-0 in-data-starting-style:translate-y-[6px] in-data-starting-style:rotate-0"
          : "translate-y-[6px]"
      )}
    />
  </span>
);

type TriggerPositionStyle = CSSProperties & {
  "--menu-trigger-top": string;
  "--menu-trigger-left": string;
};

interface TriggerPosition {
  top: number;
  left: number;
}

/**
 * Phone navigation: a header menu button that opens a full-screen menu. The
 * close button sits exactly over the trigger, so the bars appear to fold into
 * an X in place.
 */
export const MobileMenu = ({ className }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const [triggerPosition, setTriggerPosition] =
    useState<TriggerPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", () => {
        setOpen(false);
      }),
    [router]
  );

  const closeButtonStyle: TriggerPositionStyle | undefined = triggerPosition
    ? {
        "--menu-trigger-top": `${triggerPosition.top}px`,
        "--menu-trigger-left": `${triggerPosition.left}px`,
      }
    : undefined;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Open menu"
        aria-expanded={open}
        className={cn("shrink-0 md:hidden", className)}
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          setTriggerPosition(rect ? { top: rect.top, left: rect.left } : null);
          setOpen(true);
        }}
      >
        <MenuToggleIcon open={false} />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="full" showCloseButton={false}>
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
                className={cn(
                  "fixed z-10",
                  triggerPosition
                    ? "top-(--menu-trigger-top) left-(--menu-trigger-left)"
                    : "top-[env(safe-area-inset-top)] right-2"
                )}
                style={closeButtonStyle}
              />
            }
          >
            <MenuToggleIcon open />
          </SheetClose>
          <div className="pt-safe flex h-full min-h-0 flex-col">
            <div className="h-12 shrink-0" />
            <div className="pb-page-end flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto overscroll-contain px-6 pt-4">
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
