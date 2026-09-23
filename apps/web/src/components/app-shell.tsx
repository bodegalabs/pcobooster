"use client";

import {
  ArrowDown01Icon,
  Calendar04Icon,
  Clock01Icon,
  KeyboardIcon,
  LaptopIcon,
  Layout3ColumnIcon,
  ListMusicIcon,
  Logout01Icon,
  Moon02Icon,
  Settings02Icon,
  Shield01Icon,
  Sun01Icon,
  Tick02Icon,
  UserAdd01Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import type { PlanningCenterAccountsResponse } from "@pcobooster/contracts/accounts";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, startTransition, useCallback, useState } from "react";

import { HotkeyChord } from "@/components/hotkey-chord";
import { SidebarBrandMark } from "@/components/sidebar-brand-mark";
import { SidebarChromeTrigger } from "@/components/sidebar-chrome-trigger";
import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import type { SidebarTabGroupItem } from "@/components/sidebar-tab-group";
import { SidebarTabGroup } from "@/components/sidebar-tab-group";
import { SidebarToggleHotkey } from "@/components/sidebar-toggle-hotkey";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverLabel } from "@/components/ui/hover-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useBrowserStorage } from "@/hooks/use-browser-storage";
import {
  ACCOUNT_PANEL_CACHE_KEY,
  parseCachedAccountPanel,
  serializeAccountPanel,
  summarizeAccountPanel,
} from "@/lib/account-panel-cache";
import { clearAccountScopedCaches } from "@/lib/account-scoped-caches";
import { APP_SHORTCUTS, SHORTCUTS_PALETTE_HOTKEY } from "@/lib/app-hotkeys";
import { authClient } from "@/lib/auth-client";
import { writeBrowserStorage } from "@/lib/browser-storage";
import {
  PEOPLE_PAGE_NAV_CACHE_KEY,
  parsePeoplePageNavState,
  serializePeoplePageNavState,
} from "@/lib/people-page-nav-cache";
import { queryKeys } from "@/lib/query-keys";
import type { DashboardView } from "@/lib/schedule-navigation";
import {
  parsePlanWorkspacePath,
  updatePlanWorkspaceUrl,
} from "@/lib/schedule-navigation";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc-client";

const SIDEBAR_OPEN_STORAGE_KEY = "pcobooster:sidebar-open";
const APP_CHROME_ROW = "flex h-12 shrink-0 items-center gap-2";
const APP_CHROME_HEADER_CLASS = cn(APP_CHROME_ROW, "px-2");

const initialsFromName = (name: string | null | undefined): string => {
  if (!isNonEmptyString(name)) {
    return "WA";
  }
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) {
    return "WA";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const fetchAccounts = async ({ signal }: QueryFunctionContext) => {
  const response = await orpc.accounts.list({}, { signal });
  writeBrowserStorage(
    ACCOUNT_PANEL_CACHE_KEY,
    serializeAccountPanel(summarizeAccountPanel(response))
  );
  return response;
};

const fetchPeopleNavFeature = async ({ signal }: QueryFunctionContext) => {
  const response = await orpc.features.people({}, { signal });
  writeBrowserStorage(
    PEOPLE_PAGE_NAV_CACHE_KEY,
    serializePeoplePageNavState(response)
  );
  return response;
};

const fetchAdminNavFeature = async ({ signal }: QueryFunctionContext) =>
  await orpc.features.admin({}, { signal });

const themeOptions = [
  { value: "light", label: "Light", icon: Sun01Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: LaptopIcon },
] as const;

type TopBarView = DashboardView;
type ServicesSidebarKey = "services" | TopBarView;

const getTopBarViewLabel = (view: TopBarView): string => {
  if (view === "lineup") {
    return "Lineup";
  }
  if (view === "plan") {
    return "Plan";
  }
  if (view === "times") {
    return "Times";
  }
  return "Assign";
};

const planViewOptions: TopBarView[] = ["assign", "lineup", "plan", "times"];

const buildScheduleViewUrl = (
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
  view: TopBarView
): string => {
  const planPath = parsePlanWorkspacePath(pathname);
  if (!planPath) {
    return "/services";
  }

  const params = new URLSearchParams(searchParams.toString());
  const query = params.toString();
  const path = `/services/${planPath.serviceTypeId}/plans/${planPath.planId}/${view}`;
  return query ? `${path}?${query}` : path;
};

const getTopLevelPageLabel = (pathname: string) => {
  if (pathname.startsWith("/admin")) {
    return "Admin";
  }
  if (pathname.startsWith("/people")) {
    return "People";
  }
  return "Services";
};

const AppInsetChromeHeader = ({ children }: { children: ReactNode }) => {
  const { open, isMobile } = useSidebar();
  const alignWithPageContent = open && !isMobile;

  return (
    <header
      className={cn(
        APP_CHROME_ROW,
        "border-border/50 border-b",
        alignWithPageContent ? "px-3 sm:px-4" : "px-2"
      )}
    >
      {children}
    </header>
  );
};

const AppTopBar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const planPath = parsePlanWorkspacePath(pathname);
  const hasPlan = Boolean(planPath);
  const planView = planPath?.view ?? "assign";
  const planViewLabel = getTopBarViewLabel(planView);
  const isPersonDetail = /^\/people\/[^/]+/u.test(pathname);
  const isAdminUserDetail = /^\/admin\/users\/[^/]+/u.test(pathname);
  const pageLabel = getTopLevelPageLabel(pathname);

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
      <Breadcrumb className="shrink-0">
        <BreadcrumbList>
          {isPersonDetail || isAdminUserDetail ? (
            <>
              <BreadcrumbItem>
                {isPersonDetail ? (
                  <BreadcrumbLink render={<Link href="/people" />}>
                    People
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink render={<Link href="/admin" />}>
                    Admin
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {isPersonDetail ? "Person" : "User"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <>
              <BreadcrumbItem>
                {hasPlan ? (
                  <BreadcrumbLink render={<Link href="/services" />}>
                    Services
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {hasPlan ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`Change view from ${planViewLabel}`}
                            className="text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                          />
                        }
                      >
                        <span>{planViewLabel}</span>
                        <ChevronDown
                          className="text-muted-foreground size-3.5"
                          aria-hidden
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-36">
                        {planViewOptions.map((view) => (
                          <DropdownMenuItem
                            key={view}
                            onSelect={() => {
                              const nextUrl = buildScheduleViewUrl(
                                pathname,
                                new URLSearchParams(window.location.search),
                                view
                              );
                              if (
                                updatePlanWorkspaceUrl(
                                  pathname,
                                  nextUrl,
                                  "replace"
                                )
                              ) {
                                return;
                              }
                              startTransition(() => {
                                router.replace(nextUrl);
                              });
                            }}
                          >
                            <span>{getTopBarViewLabel(view)}</span>
                            {planView === view ? (
                              <Check className="ml-auto size-4" aria-hidden />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                </>
              ) : null}
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};

const AppTopBarFallback = ({ pathname }: { pathname: string }) => {
  const isPersonDetail = /^\/people\/[^/]+/u.test(pathname);
  const isAdminUserDetail = /^\/admin\/users\/[^/]+/u.test(pathname);
  const pageLabel = getTopLevelPageLabel(pathname);

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
      <Breadcrumb className="shrink-0">
        <BreadcrumbList>
          {isPersonDetail || isAdminUserDetail ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {isPersonDetail ? "People" : "Admin"}
                </BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {isPersonDetail ? "Person" : "User"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};

const AccountSwitcher = ({
  data,
  loading,
  switchingAccountId,
  isSigningOut,
  onSelectAccount,
}: {
  data: PlanningCenterAccountsResponse | null;
  loading: boolean;
  switchingAccountId: string | null;
  isSigningOut: boolean;
  onSelectAccount: (accountId: string) => Promise<void>;
}) =>
  (loading && !data) || (data !== null && data.accounts.length > 1) ? (
    <>
      <DropdownMenuSeparator inset />
      {loading && !data ? (
        <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
      ) : (
        data?.accounts.map((account) => {
          const isSelected = account.id === data.selectedAccountId;
          const orgName =
            account.identity?.organizationName ?? "Unknown organization";
          return (
            <DropdownMenuItem
              key={account.id}
              disabled={Boolean(switchingAccountId) || isSigningOut}
              onSelect={(event) => {
                event.preventDefault();
                void onSelectAccount(account.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{orgName}</span>
              {switchingAccountId === account.id ? (
                <Spinner />
              ) : (
                <SidebarNavIcon
                  icon={Tick02Icon}
                  className={cn(isSelected ? "opacity-80" : "invisible")}
                />
              )}
            </DropdownMenuItem>
          );
        })
      )}
    </>
  ) : null;

const signOutSession = async () => {
  const result = await authClient.signOut();
  if (result.error) {
    throw new Error(result.error.message ?? "Unable to sign out");
  }
};

const exitDemoSession = async () => {
  await orpc.demo.exit({});
};

const signOutLabel = (demo: boolean, pending: boolean): string => {
  if (demo) {
    return pending ? "Leaving demo…" : "Exit demo";
  }
  return pending ? "Signing out…" : "Sign out";
};

const SidebarAccountPanel = ({
  onOpenShortcuts,
}: {
  onOpenShortcuts: () => void;
}) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: fetchAccounts,
  });
  const data = accountsQuery.data ?? null;
  const loading = accountsQuery.isPending;
  const [cachedPanel] = useBrowserStorage(ACCOUNT_PANEL_CACHE_KEY);
  const cachedSummary = parseCachedAccountPanel(cachedPanel);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [actionError, setActionError] = useState("");
  const panelError = actionError || (accountsQuery.error?.message ?? "");
  const demo = data?.demo === true;
  const liveSummary = summarizeAccountPanel(data);
  const triggerSummary = data ? liveSummary : (cachedSummary ?? liveSummary);

  const handleSelectAccount = async (accountId: string) => {
    if (switchingAccountId !== null || isSigningOut) {
      return;
    }
    setActionError("");
    setSwitchingAccountId(accountId);
    try {
      await orpc.accounts.select({ accountId });
      clearAccountScopedCaches();
      await accountsQuery.refetch();
      await queryClient.invalidateQueries();
      router.refresh();
      setAccountMenuOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to switch organization";
      setActionError(message);
    }
    setSwitchingAccountId(null);
  };

  const handleSignOut = async () => {
    if (isSigningOut || switchingAccountId !== null) {
      return;
    }
    setActionError("");
    setIsSigningOut(true);
    try {
      await (demo ? exitDemoSession() : signOutSession());
      queryClient.clear();
      clearAccountScopedCaches();
      if (demo) {
        // The home page is the marketing site, outside this app's router.
        window.location.assign("/");
        return;
      }
      startTransition(() => {
        router.replace("/auth");
        router.refresh();
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to sign out"
      );
    }
    setIsSigningOut(false);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          open={accountMenuOpen}
          onOpenChange={(open) => {
            setAccountMenuOpen(open);
          }}
        >
          <DropdownMenuTrigger render={<SidebarMenuButton />}>
            <Avatar size="sm">
              {isNonEmptyString(triggerSummary.image) ? (
                <AvatarImage
                  src={triggerSummary.image}
                  alt={triggerSummary.avatarName ?? "User"}
                />
              ) : null}
              <AvatarFallback>
                {initialsFromName(triggerSummary.avatarName)}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-left text-sm font-medium">
              {triggerSummary.organizationName}
            </span>
            <SidebarNavIcon
              icon={ArrowDown01Icon}
              className={cn(
                "text-muted-foreground ml-auto size-3.5 transition-transform group-data-[collapsible=icon]:hidden",
                accountMenuOpen ? "rotate-180" : null
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="z-[80] w-[var(--radix-dropdown-menu-trigger-width)] max-w-none min-w-[14rem]"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="cursor-default">
                <span className="text-foreground block truncate text-sm font-semibold">
                  {data?.session.name ?? "Account"}
                </span>
                <span className="text-muted-foreground mt-1 block truncate text-xs">
                  {demo ? "Read-only demo" : (data?.session.email ?? "")}
                </span>
              </DropdownMenuLabel>

              <AccountSwitcher
                data={data}
                loading={loading}
                switchingAccountId={switchingAccountId}
                isSigningOut={isSigningOut}
                onSelectAccount={handleSelectAccount}
              />
            </DropdownMenuGroup>

            <DropdownMenuSeparator inset />

            <DropdownMenuGroup>
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              {themeOptions.map((option) => {
                const selected = (theme ?? "system") === option.value;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => {
                      setTheme(option.value);
                    }}
                  >
                    <SidebarNavIcon
                      icon={option.icon}
                      className="text-muted-foreground"
                    />
                    <span>{option.label}</span>
                    <SidebarNavIcon
                      icon={Tick02Icon}
                      className={cn(
                        selected ? "ml-auto opacity-80" : "invisible ml-auto"
                      )}
                    />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator inset />

            <DropdownMenuItem
              onSelect={() => {
                onOpenShortcuts();
              }}
            >
              <SidebarNavIcon
                icon={KeyboardIcon}
                className="text-muted-foreground"
              />
              <span className="flex-1">Keyboard shortcuts</span>
              <HotkeyChord
                id="acct-menu-shortcuts"
                binding={SHORTCUTS_PALETTE_HOTKEY}
                className="ml-2 shrink-0"
              />
            </DropdownMenuItem>

            {panelError ? (
              <p className="text-destructive mx-2 my-1.5 text-xs leading-snug">
                {panelError}
              </p>
            ) : null}

            <DropdownMenuSeparator inset />

            <DropdownMenuItem
              variant="destructive"
              disabled={isSigningOut || Boolean(switchingAccountId)}
              onSelect={() => {
                void handleSignOut();
              }}
            >
              {isSigningOut ? (
                <Spinner />
              ) : (
                <SidebarNavIcon icon={Logout01Icon} />
              )}
              {signOutLabel(demo, isSigningOut)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const servicesRootItem: SidebarTabGroupItem<ServicesSidebarKey> = {
  key: "services",
  label: "Services",
  href: "/services",
  icon: Calendar04Icon,
};

const ServicesSidebarMenuItem = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const planPath = parsePlanWorkspacePath(pathname);
  const isPlanWorkspace = Boolean(planPath);
  const activeScheduleView = planPath?.view ?? "assign";
  const viewItem = (
    key: TopBarView,
    icon: SidebarTabGroupItem["icon"]
  ): SidebarTabGroupItem<ServicesSidebarKey> => {
    const href = buildScheduleViewUrl(pathname, searchParams, key);
    return {
      key,
      label: getTopBarViewLabel(key),
      href,
      icon,
      handleNavigate: (event) => {
        if (updatePlanWorkspaceUrl(pathname, href, "push")) {
          event.preventDefault();
        }
      },
    };
  };
  const servicesViewItems: SidebarTabGroupItem<ServicesSidebarKey>[] = [
    servicesRootItem,
    viewItem("assign", UserAdd01Icon),
    viewItem("lineup", Layout3ColumnIcon),
    viewItem("plan", ListMusicIcon),
    viewItem("times", Clock01Icon),
  ];
  let servicesActiveKey: ServicesSidebarKey | null = null;
  if (pathname === "/services") {
    servicesActiveKey = "services";
  } else if (isPlanWorkspace) {
    servicesActiveKey = activeScheduleView;
  }

  return (
    <SidebarTabGroup
      activeKey={servicesActiveKey}
      fallbackItem={servicesRootItem}
      isGrouped={isPlanWorkspace}
      items={isPlanWorkspace ? servicesViewItems : [servicesRootItem]}
    />
  );
};

const ServicesSidebarMenuItemFallback = () => (
  <SidebarMenuButton render={<Link href="/services" />} tooltip="Services">
    <SidebarNavIcon icon={Calendar04Icon} />
    <span>Services</span>
  </SidebarMenuButton>
);

const AppSidebar = ({ peoplePageEnabled }: { peoplePageEnabled: boolean }) => {
  const pathname = usePathname();
  const [cachedPeopleFeature] = useBrowserStorage(PEOPLE_PAGE_NAV_CACHE_KEY);
  const peopleFeatureQuery = useQuery({
    queryKey: queryKeys.peopleFeature(),
    queryFn: fetchPeopleNavFeature,
  });
  const adminFeatureQuery = useQuery({
    queryKey: queryKeys.adminFeature(),
    queryFn: fetchAdminNavFeature,
  });
  const peopleNavEnabled =
    peopleFeatureQuery.data?.enabled ??
    parsePeoplePageNavState(cachedPeopleFeature)?.enabled ??
    peoplePageEnabled;
  const adminNavEnabled = adminFeatureQuery.data?.enabled ?? false;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useHotkey(
    SHORTCUTS_PALETTE_HOTKEY,
    () => {
      setShortcutsOpen(true);
    },
    { ignoreInputs: true }
  );

  return (
    <>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader size="chrome">
          <div className={APP_CHROME_HEADER_CLASS}>
            <SidebarChromeTrigger when="sidebar" />
            <SidebarBrandMark />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Suspense fallback={<ServicesSidebarMenuItemFallback />}>
                    <ServicesSidebarMenuItem />
                  </Suspense>
                </SidebarMenuItem>
                {peopleNavEnabled ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/people" />}
                      isActive={pathname.startsWith("/people")}
                      tooltip="People"
                    >
                      <SidebarNavIcon icon={UsersIcon} />
                      <span>People</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {adminNavEnabled ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/admin" />}
                      isActive={pathname.startsWith("/admin")}
                      tooltip="Admin"
                    >
                      <SidebarNavIcon icon={Shield01Icon} />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="border-sidebar-border/50 flex flex-col gap-2 border-t pt-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  tooltip="Shortcuts"
                  onClick={() => {
                    setShortcutsOpen(true);
                  }}
                >
                  <SidebarNavIcon icon={Settings02Icon} />
                  <span>Shortcuts</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarAccountPanel
              onOpenShortcuts={() => {
                setShortcutsOpen(true);
              }}
            />
          </div>
        </SidebarFooter>
      </Sidebar>
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shortcuts</DialogTitle>
            <DialogDescription>
              Keyboard shortcuts available in pcobooster.com.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 text-sm">
            {APP_SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"
              >
                <dt className="text-muted-foreground">{shortcut.label}</dt>
                <dd>
                  <HotkeyChord id={shortcut.id} binding={shortcut.binding} />
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
};

/** Visitors on a demo link need to know why nothing they change sticks. */
const DemoBadge = () => {
  const { data } = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: fetchAccounts,
  });
  if (data?.demo !== true) {
    return null;
  }
  return (
    <HoverLabel
      label="Explore freely. Changes aren’t saved."
      side="bottom"
      align="end"
      sideOffset={8}
      render={<Badge variant="secondary" className="ml-auto" />}
    >
      Read-only demo
    </HoverLabel>
  );
};

export const AppShell = ({
  children,
  peoplePageEnabled,
  presentationMode,
}: {
  children: ReactNode;
  peoplePageEnabled: boolean;
  presentationMode: boolean;
}): ReactNode => {
  const pathname = usePathname();
  const isStandaloneRoute =
    pathname.startsWith("/auth") || pathname.startsWith("/demo/");
  const [storedOpen, setStoredOpen] = useBrowserStorage(
    SIDEBAR_OPEN_STORAGE_KEY
  );
  const sidebarOpen = storedOpen !== "false";

  const handleSidebarOpenChange = useCallback(
    (nextOpen: boolean) => {
      setStoredOpen(String(nextOpen));
    },
    [setStoredOpen]
  );

  if (isStandaloneRoute) {
    return children;
  }

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      className="h-svh min-h-0 overflow-hidden"
    >
      <SidebarToggleHotkey />
      <AppSidebar peoplePageEnabled={peoplePageEnabled} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <AppInsetChromeHeader>
          <SidebarChromeTrigger when="inset" />
          <Suspense fallback={<AppTopBarFallback pathname={pathname} />}>
            <AppTopBar />
          </Suspense>
          <DemoBadge />
          {presentationMode ? (
            <span className="bg-status-scheduled/10 text-status-scheduled ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-medium">
              Presentation mode
            </span>
          ) : null}
        </AppInsetChromeHeader>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
};
