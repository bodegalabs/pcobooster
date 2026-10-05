import { reorderLineupColumnIds } from "@pcobooster/client/lineup-column-order";
import type { TeamPositionGroup } from "@pcobooster/contracts/catalog";
import { useState } from "react";
import type { ReactNode } from "react";

import { Action, Card, Editor, Label } from "./ui";

export const LineupLayoutControls = ({
  groups,
  collapsed,
  busy,
  onCollapse,
  onOrder,
}: {
  groups: TeamPositionGroup[];
  collapsed: ReadonlySet<string>;
  busy: boolean;
  onCollapse: (ids: string[]) => void;
  onOrder: (ids: string[]) => void;
}) => {
  const [reordering, setReordering] = useState(false);
  const allCollapsed =
    groups.length > 0 && groups.every((group) => collapsed.has(group.teamId));
  const move = (index: number, offset: number): void => {
    const active = groups[index];
    const target = groups[index + offset];
    if (active !== undefined && target !== undefined) {
      onOrder(
        reorderLineupColumnIds(
          groups.map((group) => group.teamId),
          active.teamId,
          target.teamId
        )
      );
    }
  };
  return (
    <>
      <Action
        label={allCollapsed ? "Expand all teams" : "Collapse all teams"}
        disabled={busy || groups.length === 0}
        onPress={() => {
          onCollapse(allCollapsed ? [] : groups.map((group) => group.teamId));
        }}
      />
      <Action
        label="Reorder teams"
        disabled={busy || groups.length < 2}
        onPress={() => {
          setReordering(true);
        }}
      />
      <Editor
        label="Reorder teams"
        visible={reordering}
        busy={busy}
        onClose={() => {
          setReordering(false);
        }}
      >
        <Label secondary>
          Saved on this device for every plan of this service type.
        </Label>
        {groups.map((group, index) => (
          <Card key={group.teamId} title={group.teamName}>
            <Action
              label={`Move ${group.teamName} up`}
              disabled={busy || index === 0}
              onPress={() => {
                move(index, -1);
              }}
            />
            <Action
              label={`Move ${group.teamName} down`}
              disabled={busy || index === groups.length - 1}
              onPress={() => {
                move(index, 1);
              }}
            />
          </Card>
        ))}
        <Action
          label="Use Planning Center order"
          disabled={busy}
          onPress={() => {
            onOrder([]);
          }}
        />
      </Editor>
    </>
  );
};

export const LineupTeam = ({
  group,
  collapsed,
  busy,
  onToggle,
  onAdd,
  children,
}: {
  group: TeamPositionGroup;
  collapsed: boolean;
  busy: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children: ReactNode;
}) => (
  <Card title={group.teamName}>
    <Action
      label={`${collapsed ? "Expand" : "Collapse"} ${group.teamName}`}
      disabled={busy}
      onPress={onToggle}
    />
    {collapsed ? (
      <Label secondary>{group.positions.length} positions</Label>
    ) : (
      children
    )}
    {onAdd === undefined || collapsed ? null : (
      <Action label={`Add position to ${group.teamName}`} onPress={onAdd} />
    )}
  </Card>
);
