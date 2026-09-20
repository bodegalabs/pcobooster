import type { AdminLinkedAccount } from "@worship-admin/api/admin-contracts";
import { CalendarClock, KeyRound, LinkIcon, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminUser } from "@/server/api";

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

const splitScope = (scope: string | null): string[] => {
  if (!(scope !== null && scope !== "")) {
    return [];
  }
  return scope
    .split(/[\s,]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
};

const TokenStatus = ({ account }: { account: AdminLinkedAccount }) => {
  const hasAccessExpiry = Boolean(account.accessTokenExpiresAt);
  const hasRefreshExpiry = Boolean(account.refreshTokenExpiresAt);

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={hasAccessExpiry ? "secondary" : "outline"}>
        access{" "}
        {hasAccessExpiry
          ? formatDateTime(account.accessTokenExpiresAt)
          : "no expiry"}
      </Badge>
      <Badge variant={hasRefreshExpiry ? "secondary" : "outline"}>
        refresh{" "}
        {hasRefreshExpiry
          ? formatDateTime(account.refreshTokenExpiresAt)
          : "no expiry"}
      </Badge>
    </div>
  );
};

const AdminUserPage = async ({
  params,
}: {
  params: Promise<{ userId: string }>;
}) => {
  const { userId } = await params;
  const { user } = await getAdminUser(userId);

  if (!user) {
    notFound();
  }

  return (
    <main className="bg-background min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">
              {user.name}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{user.email}</p>
          </div>
          <Badge variant="outline">
            {user.linkedAccounts} linked account(s)
          </Badge>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-border/70 bg-card rounded-md border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">Active sessions</p>
              <ShieldCheck className="text-muted-foreground size-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-normal">
              {user.activeSessions}
            </p>
          </div>
          <div className="border-border/70 bg-card rounded-md border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">Total logins</p>
              <KeyRound className="text-muted-foreground size-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-normal">
              {user.loginEvents}
            </p>
          </div>
          <div className="border-border/70 bg-card rounded-md border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">Logins in 30 days</p>
              <CalendarClock className="text-muted-foreground size-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-normal">
              {user.loginEvents30d}
            </p>
          </div>
          <div className="border-border/70 bg-card rounded-md border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">Last login</p>
              <LinkIcon className="text-muted-foreground size-4" />
            </div>
            <p className="mt-2 text-sm font-medium">
              {formatDateTime(user.lastLoginAt)}
            </p>
          </div>
        </section>

        <section className="border-border/70 bg-card rounded-md border">
          <div className="border-border/70 border-b px-4 py-3">
            <h2 className="text-sm font-medium">
              Linked Planning Center Accounts
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              OAuth tokens are intentionally hidden; this shows identifiers and
              expiry metadata only.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Church</TableHead>
                <TableHead>Provider account ID</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Token status</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.linkedAccountDetails.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{account.providerId}</span>
                      <span className="text-muted-foreground text-xs">
                        {account.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-48 flex-col">
                      <span className="font-medium">
                        {account.identity?.organizationName ??
                          "Unknown organization"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {account.identity?.organizationId ??
                          "No organization ID available"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{account.providerAccountId}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {splitScope(account.scope).map((scope) => (
                        <Badge key={scope} variant="outline">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TokenStatus account={account} />
                  </TableCell>
                  <TableCell className="text-right">
                    {account.activityEvents}
                  </TableCell>
                  <TableCell>{formatDateTime(account.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
};

export default AdminUserPage;
