import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DemoButton, DemoSearchInput } from "../ui/demo-control";
import {
  addAssignment,
  candidatesFor,
  findPosition,
  fullName,
  removeAssignment,
  setAssignmentStatus,
  slotSummary,
  teamOpenCount,
  useAssignments,
  weeksAgoLabel,
} from "./demo-model";
import type { Assignments, Candidate } from "./demo-model";
import {
  Avatar,
  Panel,
  PositionGlyph,
  ScoreMeter,
  StatusDot,
  useDismiss,
} from "./demo-parts";
import { plan, teams } from "./fixtures";
import type { DemoPosition, DemoTeam } from "./fixtures";

import styles from "./product-demo.module.css";

const ADDING_DELAY_MS = 450;

const SlotCount = ({
  position,
  assignments,
}: {
  position: DemoPosition;
  assignments: Assignments;
}) => {
  const { filled, open, pending } = slotSummary(position, assignments);
  if (open === 0) {
    return (
      <StatusDot
        tone={pending > 0 ? "pending" : "confirmed"}
        label={pending > 0 ? "Filled, awaiting reply" : "Filled"}
      />
    );
  }
  return (
    <span className={styles["slot-count"]}>
      {filled > 0 ? (
        <span>
          {filled}/{position.slots}
        </span>
      ) : null}
      <strong>+{open}</strong>
    </span>
  );
};

const TeamGroup = ({
  team,
  assignments,
  selectedId,
  onSelect,
}: {
  team: DemoTeam;
  assignments: Assignments;
  selectedId: string;
  onSelect: (positionId: string) => void;
}) => {
  const [open, setOpen] = useState(true);
  const openCount = teamOpenCount(team, assignments);
  return (
    <div className={styles["team-group"]}>
      <DemoButton
        variant="team"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className={styles.grow}>{team.name}</span>
        {openCount > 0 ? (
          <strong className={styles["open-count"]}>{openCount}</strong>
        ) : (
          <StatusDot tone="confirmed" />
        )}
        {open ? (
          <ChevronDown aria-hidden size={14} />
        ) : (
          <ChevronRight aria-hidden size={14} />
        )}
      </DemoButton>
      {open ? (
        <ul className={styles["position-list"]}>
          {team.positions.map((position) => (
            <li key={position.id}>
              <DemoButton
                variant="row"
                aria-current={position.id === selectedId ? "true" : undefined}
                onClick={() => {
                  onSelect(position.id);
                }}
              >
                <PositionGlyph icon={position.icon} />
                <span className={`${styles.truncate} ${styles.grow}`}>
                  {position.name}
                </span>
                <SlotCount position={position} assignments={assignments} />
              </DemoButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const PositionPicker = ({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (positionId: string) => void;
}) => {
  const assignments = useAssignments();
  return (
    <nav className={styles["position-picker"]} aria-label="Positions">
      {teams.map((team) => (
        <TeamGroup
          key={team.id}
          team={team}
          assignments={assignments}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
};

const HistoryButton = ({
  candidate,
  defaultOpen,
}: {
  candidate: Candidate;
  defaultOpen: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  // A showcase opens this on load; it stays pinned until the visitor toggles it.
  const [pinned, setPinned] = useState(defaultOpen);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, open && !pinned, () => {
    setOpen(false);
  });
  const history = candidate.person.served.toSorted(
    (a, b) => b.weeksAgo - a.weeksAgo
  );

  return (
    <span className={styles["popover-anchor"]} ref={ref}>
      <DemoButton
        variant="icon"
        aria-label={`Recent serving for ${fullName(candidate.person)}`}
        aria-expanded={open}
        onClick={() => {
          setPinned(false);
          setOpen((value) => !value);
        }}
      >
        <Info aria-hidden size={15} />
      </DemoButton>
      {open ? (
        <Panel label="Recent serving">
          <p className={styles["panel-title"]}>Recent serving</p>
          <ol className={styles.timeline}>
            {history.map((item) => (
              <li key={`${item.weeksAgo}-${item.positionId}`}>
                <StatusDot tone="confirmed" />
                <span>
                  <strong>{weeksAgoLabel(item.weeksAgo)}</strong>
                  {plan.serviceType}
                </span>
                <em>{findPosition(item.positionId)?.position.name}</em>
              </li>
            ))}
            <li data-current="">
              <StatusDot tone="pending" />
              <span>
                <strong>{plan.when}</strong>
                The plan you’re building
              </span>
            </li>
          </ol>
          {history.length === 0 ? (
            <p className={styles["panel-note"]}>
              Hasn’t served in the last few months.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </span>
  );
};

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

const CandidateRow = ({
  candidate,
  positionId,
  historyOpen,
}: {
  candidate: Candidate;
  positionId: string;
  historyOpen: boolean;
}) => {
  const { person, state } = candidate;
  const isOnSlot = state === "confirmed" || state === "pending";
  const isUnavailable = state === "blocked" || state === "declined";
  const ring = isOnSlot ? state : undefined;

  return (
    <li
      className={styles.candidate}
      data-unavailable={isUnavailable || undefined}
    >
      <Avatar
        person={person}
        ring={ring}
        dashed={!isOnSlot && candidate.alsoOnPlan.length > 0}
        muted={isUnavailable}
      />
      <span className={styles["candidate-name"]}>
        <span className={styles.truncate}>{fullName(person)}</span>
        {isUnavailable ? (
          <span className={styles["state-label"]} data-state={state}>
            {unavailableLabel[state]}
          </span>
        ) : null}
        <HistoryButton candidate={candidate} defaultOpen={historyOpen} />
      </span>
      <ScoreMeter score={candidate.score} reasons={candidate.reasons} />
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
    </li>
  );
};

export const CandidateList = ({
  positionId,
  limit,
  showFilter = true,
  openHistoryFor,
}: {
  positionId: string;
  limit?: number;
  showFilter?: boolean;
  openHistoryFor?: string;
}) => {
  const assignments = useAssignments();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const matching = candidatesFor(positionId, assignments).filter((candidate) =>
    fullName(candidate.person).toLowerCase().includes(normalized)
  );
  const shown = limit === undefined ? matching : matching.slice(0, limit);
  const available = shown.filter(
    (candidate) =>
      candidate.state !== "blocked" && candidate.state !== "declined"
  );
  const unavailable = shown.filter(
    (candidate) =>
      candidate.state === "blocked" || candidate.state === "declined"
  );
  const renderRow = (candidate: Candidate) => (
    <CandidateRow
      key={candidate.person.id}
      candidate={candidate}
      positionId={positionId}
      historyOpen={candidate.person.id === openHistoryFor}
    />
  );

  return (
    <div className={styles.candidates}>
      {showFilter ? (
        <DemoSearchInput
          icon={<Search aria-hidden size={15} />}
          placeholder="Filter"
          aria-label="Filter people"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      ) : null}
      <ul className={styles["candidate-card"]}>
        {available.map(renderRow)}
        {available.length === 0 ? (
          <li className={styles.empty}>No one matches “{query}”.</li>
        ) : null}
      </ul>
      {unavailable.length > 0 ? (
        <>
          <p className={styles["section-label"]}>
            Unavailable <span>{unavailable.length}</span>
          </p>
          <ul className={styles["candidate-card"]}>
            {unavailable.map(renderRow)}
          </ul>
        </>
      ) : null}
    </div>
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
  return (
    <div className={styles.assign}>
      <PositionPicker selectedId={positionId} onSelect={onSelectPosition} />
      <section className={styles["assign-main"]} aria-live="polite">
        <h3 className={styles["position-heading"]}>
          {selected?.position.name}
          <span>{selected?.team.name}</span>
        </h3>
        <CandidateList key={positionId} positionId={positionId} />
      </section>
    </div>
  );
};
