"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Columns3,
  Keyboard,
  Laptop,
  ListMusic,
  Loader2,
  LogOut,
  Moon,
  Settings2,
  Shield,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { HotkeyChord } from "@/components/hotkey-chord";
import {
  SidebarTabGroup,
  type SidebarTabGroupItem,
} from "@/components/sidebar-tab-group";
import { SidebarToggleHotkey } from "@/components/sidebar-toggle-hotkey";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ACCOUNT_PANEL_CACHE_KEY,
  parseCachedAccountPanel,
  serializeAccountPanel,
  summarizeAccountPanel,
  type AccountPanelSummary,
} from "@/lib/account-panel-cache";
import { APP_SHORTCUTS, SHORTCUTS_PALETTE_HOTKEY } from "@/lib/app-hotkeys";
import { authClient } from "@/lib/auth-client";
import { getJson, postJson } from "@/lib/http/client";
import { clearCachedMyScheduledPlans } from "@/lib/my-scheduled-plans-cache";
import { clearCachedOrganizationTimeZone } from "@/lib/organization-time-zone-cache";
import { clearCachedPeople } from "@/lib/people-cache";
import { clearCachedPeopleDashboards } from "@/lib/people-dashboard-cache";
import {
  PEOPLE_PAGE_NAV_CACHE_KEY,
  parsePeoplePageNavState,
  serializePeoplePageNavState,
} from "@/lib/people-page-nav-cache";
import { clearCachedPeopleSearch } from "@/lib/people-search-cache";
import { clearCachedPlanItems } from "@/lib/plan-items-cache";
import { clearCachedScheduleCatalog } from "@/lib/schedule-catalog-cache";
import { clearCachedSongOptions } from "@/lib/song-options-cache";
import { clearCachedSongSearch } from "@/lib/song-search-cache";
import { clearCachedTeamPositions } from "@/lib/team-positions-cache";
import { cn } from "@/lib/utils";

type PlanningCenterAccount = {
  id: string;
  providerId: string;
  updatedAt: string;
  identity: {
    sub: string | null;
    name: string | null;
    email: string | null;
    organizationId: string | null;
    organizationName: string | null;
  } | null;
};

type PlanningCenterAccountsResponse = {
  session: {
    userId: string;
    name: string;
    email: string;
    image: string | null;
  };
  selectedAccountId: string | null;
  accounts: PlanningCenterAccount[];
};

const SIDEBAR_WIDTH_STORAGE_KEY = "worshipadmin:sidebar-width";
const SIDEBAR_OPEN_STORAGE_KEY = "worshipadmin:sidebar-open";
const DEFAULT_SIDEBAR_WIDTH = 288;
const MIN_SIDEBAR_WIDTH = 232;
const MAX_SIDEBAR_WIDTH = 380;

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function initialsFromName(name: string | null | undefined): string {
  if (!name) return "WA";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "WA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored)
    ? clampSidebarWidth(stored)
    : DEFAULT_SIDEBAR_WIDTH;
}

function readStoredSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
  if (stored === "false") return false;
  if (stored === "true") return true;
  return true;
}

function readCachedAccountPanelSummary(): AccountPanelSummary | null {
  if (typeof window === "undefined") return null;
  return parseCachedAccountPanel(
    window.localStorage.getItem(ACCOUNT_PANEL_CACHE_KEY)
  );
}

function writeCachedAccountPanelSummary(summary: AccountPanelSummary) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ACCOUNT_PANEL_CACHE_KEY,
      serializeAccountPanel(summary)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

function readCachedPeoplePageEnabled(fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  return (
    parsePeoplePageNavState(
      window.localStorage.getItem(PEOPLE_PAGE_NAV_CACHE_KEY)
    )?.enabled ?? fallback
  );
}

function writeCachedPeoplePageEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PEOPLE_PAGE_NAV_CACHE_KEY,
      serializePeoplePageNavState({ enabled })
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

function SidebarResizeRail({
  width,
  onWidthChange,
  onCollapsePreviewChange,
}: {
  width: number;
  onWidthChange: (width: number) => void;
  onCollapsePreviewChange?: (preview: boolean) => void;
}) {
  const { isMobile, setOpen } = useSidebar();
  const pendingCollapseRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (isMobile) return;
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = width;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      pendingCollapseRef.current = false;
      onCollapsePreviewChange?.(false);

      const detach = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        document.body.style.userSelect = prevUserSelect;
        onCollapsePreviewChange?.(false);
        if (pendingCollapseRef.current) {
          setOpen(false);
        }
        pendingCollapseRef.current = false;
        if (target.hasPointerCapture(upEvent.pointerId)) {
          target.releasePointerCapture(upEvent.pointerId);
        }
        detach();
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth + moveEvent.clientX - startX;
        if (nextWidth < MIN_SIDEBAR_WIDTH) {
          pendingCollapseRef.current = true;
          onCollapsePreviewChange?.(true);
          return;
        }
        pendingCollapseRef.current = false;
        onCollapsePreviewChange?.(false);
        onWidthChange(clampSidebarWidth(nextWidth));
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [isMobile, onCollapsePreviewChange, onWidthChange, setOpen, width]
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (isMobile) return;
      onCollapsePreviewChange?.(false);
      pendingCollapseRef.current = false;
      onWidthChange(MIN_SIDEBAR_WIDTH);
    },
    [isMobile, onCollapsePreviewChange, onWidthChange]
  );

  if (isMobile) return null;

  return (
    <button
      type="button"
      aria-label="Resize sidebar. Double-click for minimum width."
      title="Drag to resize. Double-click for minimum width."
      tabIndex={-1}
      className={cn(
        /* Inset card uses m-2 + rounded-lg (~--radius); shorten rail slightly so it avoids corner curves */
        "absolute top-3 right-0 bottom-3 z-[70] hidden w-3 cursor-col-resize rounded-none border-0 bg-transparent p-0 md:block",
        "after:bg-border touch-none after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:rounded-full after:opacity-0 after:transition-opacity hover:after:opacity-100",
        "focus-visible:outline-none focus-visible:after:opacity-100"
      )}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
    />
  );
}

type TopBarView = "assign" | "lineup" | "plan" | "times";
type ServicesSidebarKey = "services" | TopBarView;

function parseTopBarView(value: string | undefined): TopBarView {
  if (value === "lineup") return "lineup";
  if (value === "plan") return "plan";
  if (value === "times") return "times";
  return "assign";
}

function getTopBarViewLabel(view: TopBarView): string {
  if (view === "lineup") return "Lineup";
  if (view === "plan") return "Plan";
  if (view === "times") return "Times";
  return "Assign";
}

const planViewOptions: TopBarView[] = ["assign", "lineup", "plan", "times"];

function getServicesPlanPath(pathname: string): {
  serviceTypeId: string;
  planId: string;
  view: TopBarView;
} | null {
  const match = /^\/services\/([^/]+)\/plans\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (!match) return null;

  const view = parseTopBarView(match[3]);
  if (match[3] !== view) return null;

  return {
    serviceTypeId: match[1],
    planId: match[2],
    view,
  };
}

function buildScheduleViewUrl(
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
  view: TopBarView
): string {
  const planPath = getServicesPlanPath(pathname);
  if (!planPath) return "/services";

  const params = new URLSearchParams(searchParams.toString());
  const query = params.toString();
  const path = `/services/${planPath.serviceTypeId}/plans/${planPath.planId}/${view}`;
  return query ? `${path}?${query}` : path;
}

function getTopLevelPageLabel(pathname: string) {
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/people")) return "People";
  return "Services";
}

function AppTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const planPath = getServicesPlanPath(pathname);
  const hasPlan = Boolean(planPath);
  const planView = planPath?.view ?? "assign";
  const planViewLabel = getTopBarViewLabel(planView);
  const isPersonDetail = /^\/people\/[^/]+/.test(pathname);
  const isAdminUserDetail = /^\/admin\/users\/[^/]+/.test(pathname);
  const pageLabel = getTopLevelPageLabel(pathname);

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
      <Breadcrumb className="shrink-0">
        <BreadcrumbList>
          {isPersonDetail || isAdminUserDetail ? (
            <>
              <BreadcrumbItem>
                {isPersonDetail ? (
                  <BreadcrumbLink asChild>
                    <Link href="/people">People</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href="/admin">Admin</Link>
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
                  <BreadcrumbLink asChild>
                    <Link href="/services">Services</Link>
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
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <span>{planViewLabel}</span>
                          <ChevronDown
                            className="text-muted-foreground size-3.5"
                            aria-hidden
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-36">
                        {planViewOptions.map((view) => (
                          <DropdownMenuItem
                            key={view}
                            onSelect={() => {
                              startTransition(() => {
                                router.replace(
                                  buildScheduleViewUrl(
                                    pathname,
                                    searchParams,
                                    view
                                  )
                                );
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
}

function AppTopBarFallback({ pathname }: { pathname: string }) {
  const isPersonDetail = /^\/people\/[^/]+/.test(pathname);
  const isAdminUserDetail = /^\/admin\/users\/[^/]+/.test(pathname);
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
}

function SidebarAccountPanel({
  onOpenShortcuts,
  onPeekLockChange,
}: {
  onOpenShortcuts: () => void;
  /** Keeps collapsed offcanvas sidebar peek visible while dropdown content is portaled. */
  onPeekLockChange?: (locked: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [data, setData] = useState<PlanningCenterAccountsResponse | null>(null);
  const [cachedSummary, setCachedSummary] =
    useState<AccountPanelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  const liveSummary = useMemo(() => summarizeAccountPanel(data), [data]);
  const triggerSummary = data ? liveSummary : (cachedSummary ?? liveSummary);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getJson<PlanningCenterAccountsResponse>(
        "/api/planning-center/accounts"
      );
      setData(response);
      const summary = summarizeAccountPanel(response);
      setCachedSummary(summary);
      writeCachedAccountPanelSummary(summary);
      setError("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load account details";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCachedSummary(readCachedAccountPanelSummary());
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const handleSelectAccount = async (accountId: string) => {
    if (switchingAccountId || isSigningOut) return;
    setSwitchingAccountId(accountId);
    try {
      await postJson<{ success: boolean; selectedAccountId: string }>(
        "/api/planning-center/accounts",
        { accountId }
      );
      clearCachedPeople();
      clearCachedPeopleDashboards();
      clearCachedPeopleSearch();
      clearCachedMyScheduledPlans();
      clearCachedOrganizationTimeZone();
      clearCachedPlanItems();
      clearCachedScheduleCatalog();
      clearCachedSongOptions();
      clearCachedSongSearch();
      clearCachedTeamPositions();
      await loadAccounts();
      await queryClient.invalidateQueries();
      router.refresh();
      setAccountMenuOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to switch organization";
      setError(message);
    } finally {
      setSwitchingAccountId(null);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut || switchingAccountId) return;
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      startTransition(() => {
        router.replace("/auth");
        router.refresh();
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Laptop },
  ];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          open={accountMenuOpen}
          onOpenChange={(open) => {
            setAccountMenuOpen(open);
            onPeekLockChange?.(open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-6 rounded-md">
                {triggerSummary.image ? (
                  <AvatarImage
                    src={triggerSummary.image}
                    alt={triggerSummary.avatarName ?? "User"}
                  />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground rounded-md text-[10px] font-medium">
                  {initialsFromName(triggerSummary.avatarName)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-left text-sm font-medium">
                {triggerSummary.organizationName}
              </span>
              <ChevronDown
                className={cn(
                  "text-muted-foreground ml-auto size-3.5 transition-transform group-data-[collapsible=icon]:hidden",
                  accountMenuOpen ? "rotate-180" : null
                )}
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="border-border/60 bg-popover z-[80] w-[var(--radix-dropdown-menu-trigger-width)] max-w-none min-w-[14rem] gap-0 rounded-xl p-1 shadow-xl shadow-black/35"
          >
            <DropdownMenuLabel className="cursor-default rounded-none px-2.5 py-2.5 pb-2 font-normal">
              <span className="text-foreground block truncate text-sm font-semibold">
                {data?.session.name ?? "Account"}
              </span>
              <span className="text-muted-foreground mt-1 block truncate text-xs">
                {data?.session.email ?? ""}
              </span>
            </DropdownMenuLabel>

            {(loading && !data) ||
            (data !== null && data.accounts.length > 1) ? (
              <>
                <DropdownMenuSeparator className="bg-border/50 my-0" />
                {loading && !data ? (
                  <DropdownMenuItem
                    disabled
                    className="rounded-sm px-2.5 py-2 text-sm"
                  >
                    Loading…
                  </DropdownMenuItem>
                ) : (
                  data!.accounts.map((account) => {
                    const isSelected = account.id === data!.selectedAccountId;
                    const orgName =
                      account.identity?.organizationName ||
                      "Unknown organization";
                    return (
                      <DropdownMenuItem
                        key={account.id}
                        className="gap-2 rounded-sm px-2.5 py-2 text-sm"
                        disabled={Boolean(switchingAccountId) || isSigningOut}
                        onSelect={(event) => {
                          event.preventDefault();
                          void handleSelectAccount(account.id);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {orgName}
                        </span>
                        {switchingAccountId === account.id ? (
                          <Loader2 className="size-4 shrink-0 animate-spin" />
                        ) : (
                          <Check
                            className={cn(
                              "size-4 shrink-0",
                              isSelected ? "opacity-80" : "invisible"
                            )}
                          />
                        )}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </>
            ) : null}

            <DropdownMenuSeparator className="bg-border/50 my-0" />

            <DropdownMenuLabel className="text-muted-foreground px-2.5 pt-2 pb-1.5 text-xs font-medium">
              Appearance
            </DropdownMenuLabel>
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const selected = (theme ?? "system") === option.value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  className="gap-2 rounded-sm px-2.5 py-2 text-sm"
                  onSelect={() => setTheme(option.value)}
                >
                  <Icon
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <span>{option.label}</span>
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      selected ? "ml-auto opacity-80" : "invisible ml-auto"
                    )}
                  />
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator className="bg-border/50 my-0" />

            <DropdownMenuItem
              className="rounded-sm px-2.5 py-2 text-sm"
              onSelect={() => onOpenShortcuts()}
            >
              <Keyboard
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
              <span className="flex-1">Keyboard shortcuts</span>
              <HotkeyChord
                id="acct-menu-shortcuts"
                binding={SHORTCUTS_PALETTE_HOTKEY}
                className="[&_[data-slot=kbd]]:border-border/50 [&_[data-slot=kbd]]:bg-muted/40 ml-2 shrink-0 [&_[data-slot=kbd]]:h-7 [&_[data-slot=kbd]]:min-h-7 [&_[data-slot=kbd]]:px-1.5 [&_[data-slot=kbd]]:text-[11px]"
              />
            </DropdownMenuItem>

            {error ? (
              <p className="text-destructive mx-2 my-1.5 text-[11px] leading-snug">
                {error}
              </p>
            ) : null}

            <DropdownMenuSeparator className="bg-border/50 my-0" />

            <DropdownMenuItem
              variant="destructive"
              className="rounded-sm px-2.5 py-2 text-sm"
              disabled={isSigningOut || Boolean(switchingAccountId)}
              onSelect={() => void handleSignOut()}
            >
              {isSigningOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              {isSigningOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ServicesSidebarMenuItem() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const planPath = getServicesPlanPath(pathname);
  const isPlanWorkspace = Boolean(planPath);
  const activeScheduleView = planPath?.view ?? "assign";
  const servicesRootItem: SidebarTabGroupItem<ServicesSidebarKey> = {
    key: "services",
    label: "Services",
    href: "/services",
    icon: CalendarDays,
  };
  const servicesViewItems: SidebarTabGroupItem<ServicesSidebarKey>[] = [
    servicesRootItem,
    {
      key: "assign",
      label: "Assign",
      href: buildScheduleViewUrl(pathname, searchParams, "assign"),
      icon: UserPlus,
    },
    {
      key: "lineup",
      label: "Lineup",
      href: buildScheduleViewUrl(pathname, searchParams, "lineup"),
      icon: Columns3,
    },
    {
      key: "plan",
      label: "Plan",
      href: buildScheduleViewUrl(pathname, searchParams, "plan"),
      icon: ListMusic,
    },
    {
      key: "times",
      label: "Times",
      href: buildScheduleViewUrl(pathname, searchParams, "times"),
      icon: Clock3,
    },
  ];
  const servicesActiveKey: ServicesSidebarKey | null =
    pathname === "/services"
      ? "services"
      : isPlanWorkspace
        ? activeScheduleView
        : null;

  return (
    <SidebarTabGroup
      activeKey={servicesActiveKey}
      fallbackItem={servicesRootItem}
      isGrouped={isPlanWorkspace}
      items={isPlanWorkspace ? servicesViewItems : [servicesRootItem]}
    />
  );
}

function ServicesSidebarMenuItemFallback() {
  return (
    <SidebarMenuButton asChild hoverCard="Services">
      <Link href="/services">
        <CalendarDays />
        <span>Services</span>
      </Link>
    </SidebarMenuButton>
  );
}

function AppSidebar({
  trailingChrome,
  collapsePreview = false,
  peoplePageEnabled,
}: {
  trailingChrome: ReactNode;
  collapsePreview?: boolean;
  peoplePageEnabled: boolean;
}) {
  const pathname = usePathname();
  const [peopleNavEnabled, setPeopleNavEnabled] = useState(peoplePageEnabled);
  const [adminNavEnabled, setAdminNavEnabled] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarPeekLocked, setSidebarPeekLocked] = useState(false);

  useHotkey(SHORTCUTS_PALETTE_HOTKEY, () => setShortcutsOpen(true), {
    ignoreInputs: true,
  });

  useEffect(() => {
    let cancelled = false;

    setPeopleNavEnabled(readCachedPeoplePageEnabled(peoplePageEnabled));

    void getJson<{ enabled: boolean }>("/api/people/feature")
      .then(({ enabled }) => {
        if (cancelled) return;
        setPeopleNavEnabled(enabled);
        writeCachedPeoplePageEnabled(enabled);
      })
      .catch(() => {
        // Keep the initial/cached value if the feature check fails.
      });

    return () => {
      cancelled = true;
    };
  }, [peoplePageEnabled]);

  useEffect(() => {
    let cancelled = false;

    void getJson<{ enabled: boolean }>("/api/admin/feature")
      .then(({ enabled }) => {
        if (cancelled) return;
        setAdminNavEnabled(enabled);
      })
      .catch(() => {
        if (cancelled) return;
        setAdminNavEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Sidebar
        variant="inset"
        collapsible="offcanvas"
        collapsePreview={collapsePreview}
        peekLocked={sidebarPeekLocked}
        trailingChrome={trailingChrome}
      >
        <SidebarHeader>
          <SidebarAccountPanel
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onPeekLockChange={setSidebarPeekLocked}
          />
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
                      asChild
                      isActive={pathname.startsWith("/people")}
                      hoverCard="People"
                    >
                      <Link href="/people">
                        <Users />
                        <span>People</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {adminNavEnabled ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/admin")}
                      hoverCard="Admin"
                    >
                      <Link href="/admin">
                        <Shield />
                        <span>Admin</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                hoverCard={{
                  children: (
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium">Shortcuts</p>
                      <HotkeyChord
                        binding={SHORTCUTS_PALETTE_HOTKEY}
                        id="shortcuts-sidebar-hover"
                      />
                    </div>
                  ),
                }}
                onClick={() => setShortcutsOpen(true)}
              >
                <Settings2 />
                <span>Shortcuts</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shortcuts</DialogTitle>
            <DialogDescription>
              Keyboard shortcuts available in worshipadmin.com.
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
}

export function AppShell({
  children,
  peoplePageEnabled,
  presentationMode,
}: {
  children: ReactNode;
  peoplePageEnabled: boolean;
  presentationMode: boolean;
}) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsePreview, setSidebarCollapsePreview] = useState(false);

  useEffect(() => {
    setSidebarWidth(readStoredSidebarWidth());
    setSidebarOpen(readStoredSidebarOpen());
  }, []);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    const clamped = clampSidebarWidth(nextWidth);
    setSidebarWidth(clamped);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
  }, []);

  const handleSidebarOpenChange = useCallback((nextOpen: boolean) => {
    setSidebarOpen(nextOpen);
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(nextOpen));
  }, []);

  if (isAuthRoute) return <>{children}</>;

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      className="h-svh min-h-0 overflow-hidden"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <SidebarToggleHotkey />
      <AppSidebar
        collapsePreview={sidebarCollapsePreview}
        peoplePageEnabled={peoplePageEnabled}
        trailingChrome={
          <SidebarResizeRail
            width={sidebarWidth}
            onWidthChange={handleSidebarWidthChange}
            onCollapsePreviewChange={setSidebarCollapsePreview}
          />
        }
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="border-border/50 flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Suspense fallback={<AppTopBarFallback pathname={pathname} />}>
            <AppTopBar />
          </Suspense>
          {presentationMode ? (
            <span className="ml-auto shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              Presentation mode
            </span>
          ) : null}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
