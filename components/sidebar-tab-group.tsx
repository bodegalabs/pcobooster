"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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

export const SidebarTabGroup = <Key extends string>({
  activeKey,
  fallbackItem,
  isGrouped,
  items,
}: SidebarTabGroupProps<Key>) => {
  const FallbackIcon = fallbackItem.icon;

  if (!isGrouped) {
    return (
      <SidebarMenuButton
        render={<Link href={fallbackItem.href} />}
        isActive={activeKey === fallbackItem.key}
        tooltip={fallbackItem.label}
      >
        <FallbackIcon />
        <span>{fallbackItem.label}</span>
      </SidebarMenuButton>
    );
  }

  const groupedItems: ReactNode[] = [];
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
        >
          <Icon />
          <span>{item.label}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <>
      <SidebarMenuButton
        render={<Link href={fallbackItem.href} />}
        isActive={activeKey === fallbackItem.key}
        tooltip={fallbackItem.label}
      >
        <FallbackIcon />
        <span>{fallbackItem.label}</span>
      </SidebarMenuButton>
      <SidebarMenuSub>{groupedItems}</SidebarMenuSub>
    </>
  );
};
