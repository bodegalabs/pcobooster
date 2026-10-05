import { ChevronDown, UserPlus } from "lucide-react";
import { useState } from "react";

import { DemoButton } from "../ui/demo-control";
import {
  findPerson,
  fullName,
  slotSummary,
  teamOpenCount,
  useAssignments,
  useSlotTotals,
} from "./demo-model";
import type { Assignments, SlotTotals } from "./demo-model";
import { Avatar, PositionGlyph, StatusDot } from "./demo-parts";
import { teams } from "./fixtures";
import type { DemoPosition, DemoTeam } from "./fixtures";

import styles from "./product-demo.module.css";

/**
 * The product's team roster: `row` lays teams side by side in one row that
 * scrolls sideways (Lineup), `stack` puts them in one column (Assign's list).
 */
export type TeamRosterLayout = "row" | "stack";

const PositionRows = ({
  team,
  position,
  assignments,
  totals,
  active,
  onSelect,
}: {
  team: DemoTeam;
  position: DemoPosition;
  assignments: Assignments;
  totals: SlotTotals;
  active: boolean;
  onSelect: (positionId: string) => void;
}) => {
  const slots = assignments[position.id] ?? [];
  const { open } = slotSummary(position, assignments, totals);
  const select = () => {
    onSelect(position.id);
  };

  return (
    <li
      className={styles["roster-position"]}
      data-active={active || undefined}
      aria-current={active || undefined}
    >
      <DemoButton
        variant="roster-position"
        aria-label={`${position.name}, ${team.name}`}
        onClick={select}
      >
        <PositionGlyph icon={position.icon} />
        <span className={`${styles.truncate} ${styles.grow}`}>
          {position.name}
        </span>
      </DemoButton>
      <ul className={styles["roster-people"]}>
        {slots.map((slot) => {
          const person = findPerson(slot.personId);
          if (person === undefined) {
            return null;
          }
          return (
            <li key={slot.personId}>
              <DemoButton
                variant="roster-row"
                aria-label={`${position.name}: ${fullName(person)}, ${slot.status}`}
                onClick={select}
              >
                <span className={styles["avatar-status"]}>
                  <Avatar person={person} />
                  <StatusDot tone={slot.status} />
                </span>
                <span className={styles.truncate}>{fullName(person)}</span>
              </DemoButton>
            </li>
          );
        })}
        {open > 0 ? (
          <li>
            <DemoButton
              variant="roster-row"
              aria-label={`Fill ${open} open ${position.name} ${open === 1 ? "slot" : "slots"}`}
              onClick={select}
            >
              <span className={styles["open-seat"]}>
                <UserPlus aria-hidden size={14} />
              </span>
              <span className={styles["open-label"]}>
                {open === 1 ? "Open" : `${open} open`}
              </span>
            </DemoButton>
          </li>
        ) : null}
      </ul>
    </li>
  );
};

const TeamPanel = ({
  team,
  assignments,
  totals,
  selectedId,
  onSelect,
}: {
  team: DemoTeam;
  assignments: Assignments;
  totals: SlotTotals;
  selectedId?: string;
  onSelect: (positionId: string) => void;
}) => {
  const [open, setOpen] = useState(true);
  const openCount = teamOpenCount(team, assignments, totals);
  // A collapsed team still shows its selected position, as in the product.
  const shown = open
    ? team.positions
    : team.positions.filter((position) => position.id === selectedId);

  return (
    <section className={styles["team-panel"]}>
      <DemoButton
        variant="team-header"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <PositionGlyph icon={team.icon} />
        <h3 className={`${styles.truncate} ${styles.grow}`}>{team.name}</h3>
        {!open && openCount > 0 ? (
          <strong className={styles["open-count"]}>{openCount} open</strong>
        ) : null}
        <ChevronDown
          aria-hidden
          size={14}
          className={styles["team-chevron"]}
          data-collapsed={open ? undefined : ""}
        />
      </DemoButton>
      {shown.length > 0 ? (
        <ul className={styles.roster}>
          {shown.map((position) => (
            <PositionRows
              key={position.id}
              team={team}
              position={position}
              assignments={assignments}
              totals={totals}
              active={position.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

/** Every team's roster: each position, then the people on it. */
export const TeamRoster = ({
  layout,
  selectedId,
  onSelect,
}: {
  layout: TeamRosterLayout;
  selectedId?: string;
  onSelect: (positionId: string) => void;
}) => {
  const assignments = useAssignments();
  const totals = useSlotTotals();
  return (
    <div className={styles["team-roster"]} data-layout={layout}>
      {teams.map((team) => (
        <TeamPanel
          key={team.id}
          team={team}
          assignments={assignments}
          totals={totals}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
