import type { NativeStackHeaderItem } from "expo-router";

import {
  groupTeams,
  rosterSortLabels,
  teamLabel,
  teamScope,
} from "./dashboard";
import type { PeopleScope, RosterSort } from "./dashboard";
import { peopleTestIds } from "./routes";
import type { PeopleDashboardModel } from "./use-people-dashboard";

const SORTS: readonly RosterSort[] = ["name", "lastServed", "served90"];

const state = (isOn: boolean) => (isOn ? ("on" as const) : ("off" as const));

/**
 * The People list's options (Swift `PeopleScopeMenu` and the roster's sort): the view, who to
 * show, the order, and the teams in scope: Teams I lead (for leaders), All teams, then each
 * team under its service type with "Other teams" last.
 */
export const peopleMenuItem = (
  model: PeopleDashboardModel
): NativeStackHeaderItem => {
  const teams = model.roster?.teams ?? [];
  const ledTeamIds = model.roster?.ledTeamIds ?? [];
  const scopeAction = (scope: PeopleScope, label: string) => ({
    type: "action" as const,
    label,
    state: state(model.scope === scope),
    onPress: () => {
      model.selectScope(scope);
    },
  });
  const isFiltered = model.show !== "everyone" || model.sort !== "name";
  return {
    type: "menu",
    label: "Choose teams",
    accessibilityLabel: `Choose teams and order, ${model.scopeLabel}`,
    identifier: peopleTestIds.scopeMenu,
    icon: {
      type: "sfSymbol",
      name: isFiltered
        ? "line.3.horizontal.decrease.circle.fill"
        : "line.3.horizontal.decrease",
    },
    menu: {
      items: [
        {
          type: "submenu",
          label: "View",
          inline: true,
          items: [
            {
              type: "action",
              label: "List",
              icon: { type: "sfSymbol", name: "list.bullet" },
              state: state(model.view === "list"),
              onPress: () => {
                model.setView("list");
              },
            },
            {
              type: "action",
              label: "Month",
              icon: { type: "sfSymbol", name: "calendar" },
              state: state(model.view === "month"),
              onPress: () => {
                model.setView("month");
              },
            },
          ],
        },
        {
          type: "submenu",
          label: "Show",
          inline: true,
          items: [
            {
              type: "action",
              label: "Everyone",
              state: state(model.show === "everyone"),
              onPress: () => {
                model.setShow("everyone");
              },
            },
            {
              type: "action",
              label: "Needs attention",
              state: state(model.show === "attention"),
              onPress: () => {
                model.setShow("attention");
              },
            },
          ],
        },
        {
          type: "submenu",
          label: "Sort by",
          inline: true,
          items: SORTS.map((sort) => ({
            type: "action" as const,
            label: rosterSortLabels[sort],
            state: state(model.sort === sort),
            onPress: () => {
              model.setSort(sort);
            },
          })),
        },
        {
          type: "submenu",
          label: "Teams",
          inline: true,
          items: [
            ...(ledTeamIds.length > 0
              ? [scopeAction("mine", "Teams I lead")]
              : []),
            scopeAction("all", "All teams"),
          ],
        },
        ...groupTeams(teams).map((group) => ({
          type: "submenu" as const,
          label: group.serviceType,
          items: group.teams.map((team) => ({
            ...scopeAction(teamScope(team.id), team.name),
            accessibilityLabel: teamLabel(team),
          })),
        })),
      ],
    },
  };
};
