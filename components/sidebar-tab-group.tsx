"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface SidebarTabGroupItem<Key extends string = string> {
  key: Key;
  label: string;
  href: string;
  icon: LucideIcon;
}

interface SidebarTabGroupProps<Key extends string = string> {
  activeKey: Key | null;
  fallbackItem: SidebarTabGroupItem<Key>;
  isGrouped: boolean;
  items: SidebarTabGroupItem<Key>[];
}

const groupedButtonClassName =
  "ml-5 h-9 w-[calc(100%-1.25rem)] rounded-xl px-2.5 text-[13px]";
const sidebarTabGroupExitMs = 170;

export function SidebarTabGroup<Key extends string>({
  activeKey,
  fallbackItem,
  isGrouped,
  items,
}: SidebarTabGroupProps<Key>) {
  const [renderGrouped, setRenderGrouped] = useState(isGrouped);

  useEffect(() => {
    if (isGrouped) {
      setRenderGrouped(true);
      return;
    }

    const timeout = window.setTimeout(
      () => setRenderGrouped(false),
      sidebarTabGroupExitMs
    );
    return () => window.clearTimeout(timeout);
  }, [isGrouped]);

  if (!renderGrouped) {
    const Icon = fallbackItem.icon;
    return (
      <SidebarMenuButton
        asChild
        isActive={activeKey === fallbackItem.key}
        hoverCard={fallbackItem.label}
      >
        <Link href={fallbackItem.href}>
          <Icon />
          <span>{fallbackItem.label}</span>
        </Link>
      </SidebarMenuButton>
    );
  }

  const FallbackIcon = fallbackItem.icon;

  return (
    <div
      data-state={isGrouped ? "open" : "closed"}
      className="sidebar-tab-group border-sidebar-border/65 bg-sidebar-accent/45 rounded-2xl border p-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.32)]"
    >
      <SidebarMenuButton
        asChild
        isActive={activeKey === fallbackItem.key}
        hoverCard={fallbackItem.label}
        className={cn("mb-1 h-9 rounded-xl px-2.5 text-[13px] font-medium")}
      >
        <Link href={fallbackItem.href}>
          <FallbackIcon />
          <span>{fallbackItem.label}</span>
        </Link>
      </SidebarMenuButton>
      <SidebarMenuSub className="mx-0 translate-x-0 gap-1 border-0 p-0">
        {items
          .filter((item) => item.key !== fallbackItem.key)
          .map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuSubItem key={item.key}>
                <SidebarMenuSubButton
                  asChild
                  isActive={activeKey === item.key}
                  className={groupedButtonClassName}
                >
                  <Link href={item.href}>
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
      </SidebarMenuSub>
    </div>
  );
}
