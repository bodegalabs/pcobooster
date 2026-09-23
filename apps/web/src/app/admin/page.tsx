import type { AdminAccountActivity } from "@pcobooster/contracts/admin";
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
import { getAdminAccounts } from "@/server/api";

export const dynamic = "force-dynamic";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDateTime = (value: string | null): string => {
  if (!(value !== null && value !== "")) {
    return "Never";
  }

  return dateTimeFormatter.format(new Date(value));
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const formatDate = (value: string): string =>
  dateFormatter.format(new Date(value));

const StatCard = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) => (
  <div className="border-border/70 bg-card rounded-2xl border px-4 py-3 md:rounded-md">
    <div className="flex items-start justify-between gap-3">
      <p className="text-muted-foreground text-sm leading-snug">{label}</p>
      <Icon className="text-muted-foreground size-4" />
    </div>
    <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
  </div>
);

const getTotals = (accounts: AdminAccountActivity[]) => {
  const totals = {
    users: accounts.length,
    activeSessions: 0,
    loginEvents30d: 0,
    loginEvents: 0,
  };
  for (const account of accounts) {
    totals.activeSessions += account.activeSessions;
    totals.loginEvents30d += account.loginEvents30d;
    totals.loginEvents += account.loginEvents;
  }
  return totals;
};

const AdminPage = async () => {
  const { accounts, email } = await getAdminAccounts();
  const totals = getTotals(accounts);

  return (
    <main className="bg-background min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-1 pb-6 md:gap-6 md:px-6 md:py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal max-md:sr-only">
              Admin
            </h1>
            <p className="text-muted-foreground text-sm md:mt-1">
              Accounts, active sessions, and login frequency from pcobooster.com
              auth activity.
            </p>
          </div>
          <Badge variant="outline">Only visible to {email}</Badge>
        </div>

        <section className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
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
};

export default AdminPage;
