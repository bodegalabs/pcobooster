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

const sidebarTabGroupExitMs = 170;

export const SidebarTabGroup = <Key extends string>({
  activeKey,
  fallbackItem,
  isGrouped,
  items,
}: SidebarTabGroupProps<Key>) => {
  const [closingGroup, setClosingGroup] = useState(isGrouped);
  const renderGrouped = isGrouped || closingGroup;

  useEffect(() => {
    const timeout = isGrouped
      ? null
      : window.setTimeout(() => {
          setClosingGroup(false);
        }, sidebarTabGroupExitMs);
    return () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [isGrouped]);

  if (!renderGrouped) {
    const Icon = fallbackItem.icon;
    return (
      <SidebarMenuButton
        render={<Link href={fallbackItem.href} />}
        isActive={activeKey === fallbackItem.key}
        tooltip={fallbackItem.label}
      >
        <Icon />
        <span>{fallbackItem.label}</span>
      </SidebarMenuButton>
    );
  }

  const FallbackIcon = fallbackItem.icon;
  const groupedItems: React.ReactNode[] = [];
  for (const item of items) {
    if (item.key === fallbackItem.key) {
      continue;
    }
    const Icon = item.icon;
    groupedItems.push(
      <SidebarMenuSubItem key={item.key}>
        <SidebarMenuSubButton
          render={<Link href={item.href} />}
          isActive={activeKey === item.key}
          className="ml-5 h-9 w-[calc(100%-1.25rem)]"
        >
          <Icon />
          <span>{item.label}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <div
      data-state={isGrouped ? "open" : "closed"}
      onAnimationStart={(event) => {
        if (event.target === event.currentTarget && isGrouped) {
          setClosingGroup(true);
        }
      }}
      className="sidebar-tab-group sidebar-highlight-shadow border-sidebar-border/65 bg-sidebar-accent/45 rounded-2xl border p-1.5"
    >
      <SidebarMenuButton
        render={<Link href={fallbackItem.href} />}
        isActive={activeKey === fallbackItem.key}
        tooltip={fallbackItem.label}
        className="mb-1 h-9"
      >
        <FallbackIcon />
        <span>{fallbackItem.label}</span>
      </SidebarMenuButton>
      <SidebarMenuSub className="mx-0 translate-x-0">
        {groupedItems}
      </SidebarMenuSub>
    </div>
  );
};
