import MinusSignIcon from "@hugeicons/core-free-icons/MinusSignIcon";
import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon";
import { CalendarPlus, Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DemoButton, DemoSearchInput, DemoSwitch } from "../ui/demo-control";
import { DayBars } from "./day-bars";
import {
  addAssignment,
  adjustOpenSlots,
  candidatesFor,
  findPosition,
  fullName,
  historyDays,
  removeAssignment,
  scheduleFacts,
  setAssignmentStatus,
  slotSummary,
  useAssignments,
  useSlotTotals,
} from "./demo-model";
import type { Candidate } from "./demo-model";
import {
  AvatarStatus,
  DemoIcon,
  FitMeter,
  Panel,
  PositionGlyph,
  StatusDot,
  useDismiss,
} from "./demo-parts";
import { teams } from "./fixtures";
import { TeamRoster } from "./team-roster";

import styles from "./product-demo.module.css";

const ADDING_DELAY_MS = 450;

/** Phones swap the roster for a row of position pills, like the product's picker sheet. */
const PositionPills = ({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (positionId: string) => void;
}) => (
  <nav className={styles["position-pills"]} aria-label="Positions">
    {teams.flatMap((team) =>
      team.positions.map((position) => (
        <DemoButton
          key={position.id}
          variant="row"
          aria-current={position.id === selectedId ? "true" : undefined}
          onClick={() => {
            onSelect(position.id);
          }}
        >
          <PositionGlyph icon={position.icon} />
          <span className={styles.truncate}>{position.name}</span>
        </DemoButton>
      ))
    )}
  </nav>
);

const StatusMenu = ({
  candidate,
  positionId,
}: {
  candidate: Candidate;
  positionId: string;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = () => {
    setOpen(false);
  };
  useDismiss(ref, open, close);
  const isConfirmed = candidate.state === "confirmed";

  return (
    <span className={styles["popover-anchor"]} ref={ref}>
      <DemoButton
        variant="status"
        aria-label={`${isConfirmed ? "Confirmed" : "Pending"}. Change status for ${fullName(candidate.person)}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <StatusDot tone={isConfirmed ? "confirmed" : "pending"} />
        <span>{isConfirmed ? "Confirmed" : "Pending"}</span>
      </DemoButton>
      {open ? (
        <Panel label="Change status" align="end">
          <div className={styles.menu} role="menu">
            <DemoButton
              variant="menu-item"
              role="menuitem"
              onClick={() => {
                setAssignmentStatus(
                  positionId,
                  candidate.person.id,
                  isConfirmed ? "pending" : "confirmed"
                );
                close();
              }}
            >
              <StatusDot tone={isConfirmed ? "pending" : "confirmed"} />
              Mark {isConfirmed ? "pending" : "confirmed"}
            </DemoButton>
            <DemoButton
              variant="destructive-menu-item"
              role="menuitem"
              onClick={() => {
                removeAssignment(positionId, candidate.person.id);
                close();
              }}
            >
              Remove from plan
            </DemoButton>
          </div>
        </Panel>
      ) : null}
    </span>
  );
};

const AddButton = ({
  candidate,
  positionId,
}: {
  candidate: Candidate;
  positionId: string;
}) => {
  const [adding, setAdding] = useState(false);
  const unavailable =
    candidate.state === "blocked" || candidate.state === "declined";

  useEffect(() => {
    // Mirrors the real round trip to Planning Center so the state change reads.
    const timer = adding
      ? window.setTimeout(() => {
          addAssignment(positionId, candidate.person.id);
        }, ADDING_DELAY_MS)
      : undefined;
    return () => {
      window.clearTimeout(timer);
    };
  }, [adding, positionId, candidate.person.id]);

  return (
    <DemoButton
      variant="outline"
      disabled={unavailable || adding}
      aria-label={`Add ${fullName(candidate.person)} to this position`}
      onClick={() => {
        setAdding(true);
      }}
    >
      {adding ? (
        <Loader2 className={styles.spin} aria-hidden size={14} />
      ) : (
        <CalendarPlus aria-hidden size={14} />
      )}
      <span>{adding ? "Adding" : "Add"}</span>
    </DemoButton>
  );
};

const unavailableLabel = { blocked: "Blocked", declined: "Declined" } as const;

/** One muted line under a name: other positions on this plan, then when they last and next serve. */
const CandidateFacts = ({ candidate }: { candidate: Candidate }) => {
  const parts = [
    ...candidate.alsoOnPlan.map((position) => ({
      text: `Also on ${position}`,
      alsoOn: true,
    })),
    ...scheduleFacts(candidate.person).map((text) => ({
      text,
      alsoOn: false,
    })),
  ];
  return (
    <p className={styles["candidate-facts"]}>
      {parts.map((part, index) => (
        <span key={part.text} data-also-on={part.alsoOn ? "" : undefined}>
          {index > 0 ? " · " : null}
          {part.text}
        </span>
      ))}
    </p>
  );
};

const CandidateRow = ({
  candidate,
  positionId,
  showHistory,
  openDayOffset,
}: {
  candidate: Candidate;
  positionId: string;
  showHistory: boolean;
  openDayOffset?: number;
}) => {
  const { person, state } = candidate;
  const assignments = useAssignments();
  const isOnSlot = state === "confirmed" || state === "pending";
  const isUnavailable = state === "blocked" || state === "declined";

  return (
    <li
      className={styles.candidate}
      data-unavailable={isUnavailable || undefined}
    >
      <div className={styles["candidate-main"]}>
        <AvatarStatus
          person={person}
          status={isOnSlot ? state : undefined}
          alsoScheduled={candidate.alsoOnPlan.length > 0}
          muted={state === "blocked"}
        />
        <span className={styles["candidate-identity"]}>
          <span className={styles["candidate-name"]}>
            <span className={styles.truncate}>{fullName(person)}</span>
            {isUnavailable ? (
              <span className={styles["state-label"]} data-state={state}>
                {unavailableLabel[state]}
              </span>
            ) : null}
          </span>
          <CandidateFacts candidate={candidate} />
        </span>
        {candidate.score === null ? null : (
          <FitMeter score={candidate.score} reasons={candidate.reasons} />
        )}
        <span className={styles["candidate-action"]}>
          {isOnSlot ? (
            <StatusMenu candidate={candidate} positionId={positionId} />
          ) : (
            <AddButton
              key={`${positionId}-${person.id}`}
              candidate={candidate}
              positionId={positionId}
            />
          )}
        </span>
      </div>
      <div
        className={styles["history-collapse"]}
        data-open={showHistory}
        inert={!showHistory}
      >
        <div>
          <div className={styles["history-inner"]}>
            <DayBars
              days={historyDays(person, assignments)}
              openOffset={openDayOffset}
            />
          </div>
        </div>
      </div>
    </li>
  );
};

const SectionLabel = ({
  title,
  count,
}: {
  title: string;
  count: string | number;
}) => (
  <h4 className={styles["section-label"]}>
    {title} <span>{count}</span>
  </h4>
);

const OpenSlotsRow = ({ open }: { open: number }) => (
  <li className={styles["open-slots"]}>
    <span className={styles["open-ring"]} aria-hidden />
    {open === 0 ? "No open slots" : `${open} open slot${open === 1 ? "" : "s"}`}
  </li>
);

export const CandidateList = ({
  positionId,
  filter = "",
  showHistory = true,
  limit,
  compact = false,
  openHistoryFor,
}: {
  positionId: string;
  filter?: string;
  showHistory?: boolean;
  limit?: number;
  /** Only the "Add someone" list, for showcases beside page copy. */
  compact?: boolean;
  /** A person whose busiest recent day starts open, for showcases. */
  openHistoryFor?: { personId: string; offset: number };
}) => {
  const assignments = useAssignments();
  const totals = useSlotTotals();
  const normalized = filter.trim().toLowerCase();
  const matching = candidatesFor(positionId, assignments).filter((candidate) =>
    fullName(candidate.person).toLowerCase().includes(normalized)
  );
  const onSlot = matching.filter(
    (candidate) =>
      candidate.state === "confirmed" || candidate.state === "pending"
  );
  const unavailable = matching.filter(
    (candidate) =>
      candidate.state === "blocked" || candidate.state === "declined"
  );
  const available = matching.filter(
    (candidate) => candidate.state === "available"
  );
  const shownAvailable =
    limit === undefined ? available : available.slice(0, limit);
  const found = findPosition(positionId);
  const open =
    found === undefined
      ? 0
      : slotSummary(found.position, assignments, totals).open;
  const filledCount = (assignments[positionId] ?? []).length;
  const renderRow = (candidate: Candidate) => (
    <CandidateRow
      key={candidate.person.id}
      candidate={candidate}
      positionId={positionId}
      showHistory={showHistory}
      openDayOffset={
        candidate.person.id === openHistoryFor?.personId
          ? openHistoryFor.offset
          : undefined
      }
    />
  );

  return (
    <div className={styles.candidates}>
      {compact ? null : (
        <section className={styles["candidate-section"]}>
          <SectionLabel
            title="Scheduled"
            count={`${filledCount}/${filledCount + open}`}
          />
          <ul className={styles["candidate-card"]}>
            {onSlot.map(renderRow)}
            {open > 0 || filledCount === 0 ? (
              <OpenSlotsRow open={open} />
            ) : null}
          </ul>
        </section>
      )}
      <section className={styles["candidate-section"]}>
        <SectionLabel title="Add someone" count={available.length} />
        <ul className={styles["candidate-card"]}>
          {shownAvailable.map(renderRow)}
          {shownAvailable.length === 0 ? (
            <li className={styles.empty}>
              {normalized === ""
                ? "No one else is on this roster."
                : `No one matches “${filter.trim()}”.`}
            </li>
          ) : null}
        </ul>
      </section>
      {compact || unavailable.length === 0 ? null : (
        <section className={styles["candidate-section"]}>
          <SectionLabel title="Unavailable" count={unavailable.length} />
          <ul className={styles["candidate-card"]} data-dimmed="">
            {unavailable.map(renderRow)}
          </ul>
        </section>
      )}
    </div>
  );
};

/** Filled over total slots, with one more or one fewer open slot a click away. */
const SlotStepper = ({ positionId }: { positionId: string }) => {
  const assignments = useAssignments();
  const totals = useSlotTotals();
  const found = findPosition(positionId);
  if (found === undefined) {
    return null;
  }
  const { filled, open, total } = slotSummary(
    found.position,
    assignments,
    totals
  );

  return (
    <fieldset className={styles.stepper} aria-label="Open slots">
      <DemoButton
        variant="stepper"
        aria-label={`Remove an open ${found.position.name} slot`}
        disabled={open === 0}
        onClick={() => {
          adjustOpenSlots(found.position, "remove");
        }}
      >
        <DemoIcon icon={MinusSignIcon} className={styles["stepper-icon"]} />
      </DemoButton>
      <span
        className={styles["stepper-count"]}
        aria-label={`${filled} of ${total} filled`}
      >
        {filled}/{total}
      </span>
      <DemoButton
        variant="stepper"
        aria-label={`Add an open ${found.position.name} slot`}
        onClick={() => {
          adjustOpenSlots(found.position, "add");
        }}
      >
        <DemoIcon icon={PlusSignIcon} className={styles["stepper-icon"]} />
      </DemoButton>
    </fieldset>
  );
};

export const AssignView = ({
  positionId,
  onSelectPosition,
}: {
  positionId: string;
  onSelectPosition: (positionId: string) => void;
}) => {
  const selected = findPosition(positionId);
  const [filter, setFilter] = useState("");
  const [showHistory, setShowHistory] = useState(true);
  return (
    <div className={styles.assign}>
      <nav className={styles["assign-roster"]} aria-label="Positions">
        <TeamRoster
          layout="stack"
          selectedId={positionId}
          onSelect={onSelectPosition}
        />
      </nav>
      <PositionPills selectedId={positionId} onSelect={onSelectPosition} />
      <section className={styles["assign-main"]} aria-live="polite">
        <div className={styles["assign-head"]}>
          <h3 className={styles["position-heading"]}>
            {selected?.position.name}
            <span className={styles["sr-only"]}> on {selected?.team.name}</span>
          </h3>
          <SlotStepper positionId={positionId} />
        </div>
        <div className={styles["assign-controls"]}>
          <DemoSearchInput
            icon={<Search aria-hidden size={15} />}
            placeholder="Filter people"
            aria-label="Filter people"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          <DemoSwitch checked={showHistory} onCheckedChange={setShowHistory}>
            Show history
          </DemoSwitch>
        </div>
        <CandidateList
          key={positionId}
          positionId={positionId}
          filter={filter}
          showHistory={showHistory}
        />
      </section>
    </div>
  );
};
