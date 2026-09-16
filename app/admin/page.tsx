import {
  Activity,
  CalendarClock,
  LogIn,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { AdminAccountRow } from "@/app/admin/admin-account-row";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminSession } from "@/lib/use-cases/admin/auth";
import {
  getAccountActivity,
  type AdminAccountActivity,
} from "@/lib/use-cases/admin/get-account-activity";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <div className="border-border/70 bg-card rounded-md border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        <Icon className="text-muted-foreground size-4" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
    </div>
  );
}

function getTotals(accounts: AdminAccountActivity[]) {
  return accounts.reduce(
    (totals, account) => ({
      users: totals.users + 1,
      activeSessions: totals.activeSessions + account.activeSessions,
      loginEvents30d: totals.loginEvents30d + account.loginEvents30d,
      loginEvents: totals.loginEvents + account.loginEvents,
    }),
    {
      users: 0,
      activeSessions: 0,
      loginEvents30d: 0,
      loginEvents: 0,
    }
  );
}

export default async function AdminPage() {
  const session = await requireAdminSession();
  const accounts = await getAccountActivity();
  const totals = getTotals(accounts);

  return (
    <main className="bg-background min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Admin</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Accounts, active sessions, and login frequency from
              worshipadmin.com auth activity.
            </p>
          </div>
          <Badge variant="outline">Only visible to {session.user.email}</Badge>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Accounts" value={totals.users} icon={Users} />
          <StatCard
            label="Active sessions"
            value={totals.activeSessions}
            icon={UserRoundCheck}
          />
          <StatCard
            label="Logins in 30 days"
            value={totals.loginEvents30d}
            icon={CalendarClock}
          />
          <StatCard
            label="Total login events"
            value={totals.loginEvents}
            icon={LogIn}
          />
        </section>

        <section className="border-border/70 bg-card rounded-md border">
          <div className="border-border/70 flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">Accounts</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Login counts start when auth activity logging was added.
              </p>
            </div>
            <Activity className="text-muted-foreground size-4" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Linked</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">7d</TableHead>
                <TableHead className="text-right">30d</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <AdminAccountRow
                  key={account.userId}
                  account={account}
                  lastLoginLabel={formatDateTime(account.lastLoginAt)}
                  createdLabel={formatDate(account.createdAt)}
                />
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
}
