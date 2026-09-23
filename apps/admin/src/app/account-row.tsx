"use client";

import type { AdminAccountActivity } from "@pcobooster/contracts/admin";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";

interface AdminAccountRowProps {
  account: AdminAccountActivity;
  createdLabel: string;
  lastLoginLabel: string;
}

export const AdminAccountRow = ({
  account,
  createdLabel,
  lastLoginLabel,
}: AdminAccountRowProps) => {
  const router = useRouter();
  const href = `/users/${account.userId}`;

  const openAccount = useCallback(() => {
    router.push(href);
  }, [href, router]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openAccount();
    },
    [openAccount]
  );

  return (
    <TableRow
      className="cursor-pointer"
      tabIndex={0}
      aria-label={`Open ${account.name}`}
      onClick={openAccount}
      onKeyDown={handleKeyDown}
    >
      <TableCell>
        <div className="flex min-w-52 flex-col">
          <span className="font-medium">{account.name}</span>
          <span className="text-muted-foreground text-xs">{account.email}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{account.linkedAccounts}</Badge>
          {account.providers.map((provider) => (
            <Badge key={provider} variant="outline">
              {provider}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right">{account.activeSessions}</TableCell>
      <TableCell className="text-right">{account.loginEvents7d}</TableCell>
      <TableCell className="text-right">{account.loginEvents30d}</TableCell>
      <TableCell className="text-right">{account.loginEvents}</TableCell>
      <TableCell>{lastLoginLabel}</TableCell>
      <TableCell>{createdLabel}</TableCell>
      <TableCell className="text-right">
        <ChevronRight className="ml-auto size-4" aria-hidden="true" />
      </TableCell>
    </TableRow>
  );
};
