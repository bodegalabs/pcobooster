import type { TeamPositionGroup } from "@pcobooster/contracts/catalog";

import { Card, Toggle } from "./ui";

export const TimeIndividualAssignments = ({
  groups,
  timeId,
  changes,
  onChange,
  editable,
}: {
  groups: readonly TeamPositionGroup[];
  timeId: string;
  changes: ReadonlyMap<string, boolean>;
  onChange: (key: string, checked: boolean) => void;
  editable: boolean;
}) => (
  <Card title="Individual assignments">
    {groups.map((group) => (
      <Card key={group.teamId} title={group.teamName}>
        {group.positions.map((position) => (
          <Card key={position.id} title={position.name}>
            {position.neededPositionId === undefined ? null : (
              <Toggle
                label="Open slots at this time"
                checked={
                  changes.get(`needed:${position.neededPositionId}`) ??
                  position.timeId === timeId
                }
                onChange={(checked) => {
                  if (editable && position.neededPositionId !== undefined) {
                    onChange(`needed:${position.neededPositionId}`, checked);
                  }
                }}
              />
            )}
            {position.filledPeople?.map((person) => (
              <Toggle
                key={person.planPersonId}
                label={person.name}
                checked={
                  changes.get(`person:${person.planPersonId}`) ??
                  new Set(person.assignedTimeIds).has(timeId)
                }
                onChange={(checked) => {
                  if (editable) {
                    onChange(`person:${person.planPersonId}`, checked);
                  }
                }}
              />
            ))}
          </Card>
        ))}
      </Card>
    ))}
  </Card>
);
