import {
  formatCalendarDateLabel,
  orgCalendarDaysBetween,
} from "@pcobooster/planning-center-models/calendar";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar-day";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PersonWithAvailability,
  ServiceHistoryItem,
} from "@pcobooster/planning-center-models/types";
import { useState } from "react";

import { tabRouter as router } from "../tab-router";
import { Action, Card, Editor, Label, Row, Toggle } from "./ui";

const historyDays = (
  entries: readonly ServiceHistoryItem[],
  timeZone: string
) => {
  const days = new Map<string, ServiceHistoryItem[]>();
  for (const entry of entries) {
    const day = formatCalendarDayInTimeZone(entry.date, timeZone);
    const existing = days.get(day) ?? [];
    existing.push(entry);
    days.set(day, existing);
  }
  return [...days.entries()].toSorted(([left], [right]) =>
    right.localeCompare(left)
  );
};

const Preferences = ({ person }: { person: PersonWithAvailability }) => {
  const preferences = person.schedulingPreferences;
  if (preferences === undefined || preferences === null) {
    return (
      <Label secondary>
        No scheduling preferences provided for this position.
      </Label>
    );
  }
  return (
    <Card title="Scheduling preferences">
      <Label>{preferences.schedulePreference ?? "As often as needed"}</Label>
      {preferences.preferredWeeks.length > 0 ? (
        <Label>Preferred weeks: {preferences.preferredWeeks.join(", ")}</Label>
      ) : null}
      <Label>
        {preferences.timePreferenceOptionIds.length > 0
          ? "Preferred service times are included in the ranking."
          : "Any service time"}
      </Label>
      <Label secondary>
        Maximum plans per day: {preferences.maxPlansPerDay ?? "No preference"};
        per month: {preferences.maxPlansPerMonth ?? "No preference"}
      </Label>
    </Card>
  );
};

const HistoryDay = ({
  entries,
  day,
  planDate,
  timeZone,
}: {
  entries: readonly ServiceHistoryItem[];
  day: string;
  planDate: Date | undefined;
  timeZone: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [first] = entries;
  if (first === undefined) {
    return null;
  }
  const difference =
    planDate === undefined
      ? null
      : orgCalendarDaysBetween(planDate, first.date, timeZone);
  return (
    <Card>
      <Action
        label={`${formatCalendarDateLabel(first.date, timeZone, "weekdayMonthDayYear")} · ${entries.length} commitment${entries.length === 1 ? "" : "s"}`}
        selected={expanded}
        onPress={() => {
          setExpanded(!expanded);
        }}
      />
      {difference === null ? null : (
        <Label secondary>
          {difference === 0
            ? "On the selected plan's date"
            : `${Math.abs(difference)} days ${difference < 0 ? "before" : "after"} this plan`}
        </Label>
      )}
      {expanded
        ? entries.map((entry) => (
            <Row
              key={`${day}:${entry.id}`}
              title={entry.planTitle ?? entry.serviceTypeName ?? "Plan"}
              detail={`${entry.teamName ?? "Team"} · ${entry.teamPositionName} · ${entry.timeType ?? "service"} · ${entry.status}`}
            />
          ))
        : null}
    </Card>
  );
};

export const CandidateDetail = ({
  person,
  planDate,
  positionName,
  timeZone,
}: {
  person: PersonWithAvailability;
  planDate: Date | undefined;
  positionName: string | undefined;
  timeZone: string;
}) => {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  return (
    <>
      <Action
        label={`Why this ranking: ${person.fullName}`}
        onPress={() => {
          setOpen(true);
        }}
      />
      <Editor
        label={person.fullName}
        visible={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Label heading>Why this ranking</Label>
        <Label>
          {positionName ?? "Selected position"} ·{" "}
          {person.availability ?? "unknown"}
        </Label>
        {planDate === undefined ? null : (
          <Label secondary>
            {formatCalendarDateLabel(planDate, timeZone, "weekdayMonthDayYear")}{" "}
            · {PLAN_HISTORY_HALF_RANGE_DAYS} days before and after · {timeZone}
          </Label>
        )}
        {person.recommendationScore === undefined ? (
          <Label secondary>
            Ranking is waiting for complete serving history.
          </Label>
        ) : (
          <Label>
            Recommendation score: {person.recommendationScore.toFixed(1)} / 100
          </Label>
        )}
        {(person.recommendationReasoning ?? []).map((reason) => (
          <Label key={reason}>{reason}</Label>
        ))}
        {person.selectedPlanDeclineReason !== undefined &&
        person.selectedPlanDeclineReason !== null &&
        person.selectedPlanDeclineReason !== "" ? (
          <Label>Decline reason: {person.selectedPlanDeclineReason}</Label>
        ) : null}
        {person.selectedPlanAssignmentLabels?.map((label) => (
          <Label key={label}>{label}</Label>
        ))}
        <Preferences person={person} />
        <Toggle
          label="Show serving history"
          checked={showHistory}
          onChange={setShowHistory}
        />
        {showHistory
          ? historyDays(person.serviceHistory ?? [], timeZone).map(
              ([day, entries]) => (
                <HistoryDay
                  key={day}
                  day={day}
                  entries={entries}
                  planDate={planDate}
                  timeZone={timeZone}
                />
              )
            )
          : null}
        {showHistory && (person.serviceHistory?.length ?? 0) === 0 ? (
          <Label secondary>No serving commitments in this window.</Label>
        ) : null}
        <Action
          label="Open person details"
          onPress={() => {
            setOpen(false);
            router.push({
              pathname: "/people/[personId]",
              params: { personId: person.id },
            });
          }}
        />
      </Editor>
    </>
  );
};
