import type { IconSvgElement } from "@hugeicons/react";
import type { ReactElement, ReactNode } from "react";

import { SidebarNavIcon } from "@/components/sidebar-nav-icon";
import {
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export interface SidebarTabGroupItem<Key extends string = string> {
  key: Key;
  label: string;
  /** A router `<Link>`; the menu button renders through it. */
  link: ReactElement;
  icon: IconSvgElement;
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
  if (!isGrouped) {
    return (
      <SidebarMenuButton
        render={fallbackItem.link}
        isActive={activeKey === fallbackItem.key}
        tooltip={fallbackItem.label}
      >
        <SidebarNavIcon icon={fallbackItem.icon} />
        <span>{fallbackItem.label}</span>
      </SidebarMenuButton>
    );
  }

  const groupedItems: ReactNode[] = [];
  for (const item of items) {
    if (item.key === fallbackItem.key) {
      continue;
    }
    groupedItems.push(
      <SidebarMenuSubItem key={item.key}>
        <SidebarMenuSubButton
          render={item.link}
          isActive={activeKey === item.key}
        >
          <SidebarNavIcon icon={item.icon} />
          <span>{item.label}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <div className="group/tab-group flex flex-col">
      <SidebarMenuButton
        render={fallbackItem.link}
        isActive={activeKey === fallbackItem.key}
        tooltip={fallbackItem.label}
      >
        <SidebarNavIcon icon={fallbackItem.icon} />
        <span>{fallbackItem.label}</span>
      </SidebarMenuButton>
      <SidebarMenuSub>{groupedItems}</SidebarMenuSub>
    </div>
  );
};
