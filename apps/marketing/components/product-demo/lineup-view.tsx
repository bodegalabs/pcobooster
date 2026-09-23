"use client";

import { Plus } from "lucide-react";

import { DemoButton } from "../ui/demo-control";
import {
  findPerson,
  fullName,
  slotSummary,
  teamOpenCount,
  useAssignments,
} from "./demo-model";
import { Avatar, PositionGlyph, StatusDot } from "./demo-parts";
import { teams } from "./fixtures";

import styles from "./product-demo.module.css";

export const LineupView = ({
  onOpenPosition,
}: {
  onOpenPosition: (positionId: string) => void;
}) => {
  const assignments = useAssignments();
  return (
    <div className={styles.lineup}>
      {teams.map((team) => {
        const openCount = teamOpenCount(team, assignments);
        return (
          <section key={team.id} className={styles["lineup-column"]}>
            <h3 className={styles["lineup-team"]}>
              {team.name}
              {openCount > 0 ? (
                <strong className={styles["open-count"]}>{openCount}</strong>
              ) : (
                <StatusDot tone="confirmed" label="Fully staffed" />
              )}
            </h3>
            {team.positions.map((position) => {
              const { open } = slotSummary(position, assignments);
              const slots = assignments[position.id] ?? [];
              return (
                <article key={position.id} className={styles["lineup-card"]}>
                  <header>
                    <PositionGlyph icon={position.icon} />
                    <span className={styles.truncate}>{position.name}</span>
                  </header>
                  <ul>
                    {slots.map((slot) => {
                      const person = findPerson(slot.personId);
                      if (person === undefined) {
                        return null;
                      }
                      return (
                        <li key={slot.personId}>
                          <Avatar person={person} size="sm" />
                          <span className={styles.truncate}>
                            {fullName(person)}
                          </span>
                          <StatusDot
                            tone={slot.status}
                            label={
                              slot.status === "confirmed"
                                ? "Confirmed"
                                : "Pending"
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                  {open > 0 ? (
                    <DemoButton
                      variant="open-slot"
                      onClick={() => {
                        onOpenPosition(position.id);
                      }}
                    >
                      <Plus aria-hidden size={14} />
                      {open === 1 ? "1 open spot" : `${open} open spots`}
                      <span>Find someone</span>
                    </DemoButton>
                  ) : null}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
};
