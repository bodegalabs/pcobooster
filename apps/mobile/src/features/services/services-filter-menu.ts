import type { NativeStackHeaderItem } from "expo-router";

import { upcomingWindows, windowTitle } from "./agenda";
import type { ServicesAgenda } from "./use-services-agenda";

/** Past this many service types the Swift menu moves to a searchable sheet (a later layer). */
const INLINE_SERVICE_TYPE_LIMIT = 8;

/**
 * The agenda's filter button (Swift `ServicesFilterMenu`): which dates to list and which service
 * types to include. Service type toggles keep the menu open so several can be switched at once.
 */
export const servicesFilterItem = (
  agenda: ServicesAgenda
): NativeStackHeaderItem => ({
  type: "menu",
  label: "Filter",
  accessibilityLabel: "Filter plans",
  icon: {
    type: "sfSymbol",
    name: agenda.hasActiveFilters
      ? "line.3.horizontal.decrease.circle.fill"
      : "line.3.horizontal.decrease",
  },
  menu: {
    items: [
      {
        type: "submenu",
        label: "Dates",
        inline: true,
        items: upcomingWindows.map((window) => ({
          type: "action",
          label: windowTitle[window],
          state: agenda.window === window ? "on" : "off",
          onPress: () => {
            agenda.setWindow(window);
          },
        })),
      },
      {
        type: "submenu",
        label: "Past",
        inline: true,
        items: [
          {
            type: "action",
            label: windowTitle.recent,
            icon: { type: "sfSymbol", name: "clock.arrow.circlepath" },
            state: agenda.window === "recent" ? "on" : "off",
            onPress: () => {
              agenda.setWindow("recent");
            },
          },
        ],
      },
      {
        type: "submenu",
        label: "Service types",
        inline: true,
        items: [
          ...agenda.serviceTypes.all
            .slice(0, INLINE_SERVICE_TYPE_LIMIT)
            .map((serviceType) => {
              const isSelected = agenda.selectedIds.has(serviceType.id);
              return {
                type: "action" as const,
                label: serviceType.name,
                state: isSelected ? ("on" as const) : ("off" as const),
                keepsMenuPresented: true,
                onPress: () => {
                  agenda.setSelected(serviceType.id, !isSelected);
                },
              };
            }),
          ...(agenda.selectsAllServiceTypes
            ? []
            : [
                {
                  type: "action" as const,
                  label: "Show all service types",
                  keepsMenuPresented: true,
                  onPress: agenda.selectAllServiceTypes,
                },
              ]),
        ],
      },
      ...(agenda.hasActiveFilters
        ? [
            {
              type: "submenu" as const,
              label: "",
              inline: true,
              items: [
                {
                  type: "action" as const,
                  label: "Reset filters",
                  icon: {
                    type: "sfSymbol" as const,
                    name: "arrow.counterclockwise" as const,
                  },
                  onPress: agenda.resetFilters,
                },
              ],
            },
          ]
        : []),
    ],
  },
});
