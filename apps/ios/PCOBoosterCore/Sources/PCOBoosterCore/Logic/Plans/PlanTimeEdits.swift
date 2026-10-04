import Foundation

// Port of apps/web/src/lib/schedule/plan-time-edits.ts: the plan time form's model, its
// validation, and the planTimes.update and planTimes.create inputs it becomes, with wall times
// read in the organization's zone. Pinned by the `plans.buildEditablePlanTime`,
// `plans.isValidPlanTimeEdit`, `plans.planTimeEditHasChanges`, `plans.buildPlanTimePatch`,
// `plans.buildDefaultNewPlanTimeEdit`, and `plans.buildCreatePlanTimeRequest` parity suites.

/// A plan time as its form edits it: wall-clock dates (`YYYY-MM-DD`) and times (`HH:mm`) in
/// the organization's zone, plus the teams, positions, and people assigned to it.
public struct EditablePlanTime: Codable, Hashable, Sendable {
  public var name: String
  public var timeType: PlanTimeType
  public var startDate: String
  public var startTime: String
  public var endDate: String
  /// Empty for a time without an end.
  public var endTime: String
  public var assignedTeamIds: [String]
  public var assignedPositionIds: [String]
  public var assignedNeededPositionIds: [String]
  public var assignedPlanPersonIds: [String]

  public init(
    name: String, timeType: PlanTimeType, startDate: String, startTime: String, endDate: String,
    endTime: String, assignedTeamIds: [String], assignedPositionIds: [String],
    assignedNeededPositionIds: [String], assignedPlanPersonIds: [String]
  ) {
    self.name = name
    self.timeType = timeType
    self.startDate = startDate
    self.startTime = startTime
    self.endDate = endDate
    self.endTime = endTime
    self.assignedTeamIds = assignedTeamIds
    self.assignedPositionIds = assignedPositionIds
    self.assignedNeededPositionIds = assignedNeededPositionIds
    self.assignedPlanPersonIds = assignedPlanPersonIds
  }
}

/// The same length, and every id in `b` is in `a` (`haveSameIds`; not a strict set comparison
/// when ids repeat, like the web's).
private func haveSameIds(_ a: [String], _ b: [String]) -> Bool {
  guard a.count == b.count else {
    return false
  }
  let ids = Set(a)
  return b.allSatisfy(ids.contains)
}

/// The instant a form date and time name in `timeZone`.
///
/// The web parses `` `${date}T${time}:00` `` with `Date.parse`, which reads the browser's zone;
/// the port takes the organization's zone instead, the zone the saved time is converted in.
/// It accepts the ISO shape `Date.parse` accepts: a four-digit year, months 01 to 12, days 01
/// to 31 (a day past the month's end rolls into the next month, as in JavaScript), and `HH` or
/// `HH:mm` with hours 00 to 24 (24 only on the hour, meaning the next midnight). Anything else
/// is unreadable. (V8's fallback parser also accepts some malformed strings, such as an empty
/// date with a non-numeric time, as January 1, 2000; the port rejects those.)
private func formInstant(date: String, time: String, timeZone: String) -> Date? {
  guard let day = formDateFields(date), let clock = formTimeFields(time) else {
    return nil
  }
  // `utcInstant` reads years 0 to 99 as 1900 to 1999, like `Date.UTC`; ISO parsing takes them
  // literally. The Gregorian calendar repeats every 400 years (146,097 days), so convert 400
  // years later and step back.
  let isTwoDigitYear = day.year < 100
  guard
    let instant = OrgCalendar.utcInstant(
      dateKey: "\(isTwoDigitYear ? day.year + 400 : day.year)-\(day.month)-\(day.day)",
      timeValue: "\(clock.hour):\(clock.minute)", timeZone: timeZone)
  else {
    return nil
  }
  return isTwoDigitYear ? instant.addingTimeInterval(-146_097 * 86_400) : instant
}

/// The fixed-width ASCII digits at `range`, or nil.
private func digits(_ scalars: [Unicode.Scalar], _ range: Range<Int>) -> Int? {
  guard range.upperBound <= scalars.count else {
    return nil
  }
  var value = 0
  for scalar in scalars[range] {
    guard MusicText.isDigit(scalar) else {
      return nil
    }
    value = value * 10 + Int(scalar.value - 48)
  }
  return value
}

private func formDateFields(_ text: String) -> (year: Int, month: Int, day: Int)? {
  let scalars = Array(text.unicodeScalars)
  guard scalars.count == 10, scalars[4] == "-", scalars[7] == "-",
    let year = digits(scalars, 0..<4), let month = digits(scalars, 5..<7),
    let day = digits(scalars, 8..<10), (1...12).contains(month), (1...31).contains(day)
  else {
    return nil
  }
  return (year, month, day)
}

private func formTimeFields(_ text: String) -> (hour: Int, minute: Int)? {
  let scalars = Array(text.unicodeScalars)
  guard scalars.count == 2 || (scalars.count == 5 && scalars[2] == ":"),
    let hour = digits(scalars, 0..<2)
  else {
    return nil
  }
  let minute = scalars.count == 5 ? digits(scalars, 3..<5) : 0
  guard let minute, minute <= 59, hour < 24 || (hour == 24 && minute == 0) else {
    return nil
  }
  return (hour, minute)
}

/// Whether the form can save: a name, a start date and time, and an end (when there is one)
/// no earlier than the start (`isValidPlanTimeEdit`).
///
/// Pass the organization's zone: the web compares the two wall times in the browser's zone,
/// and the parity fixtures pin its behavior with both zones UTC.
public func isValidPlanTimeEdit(_ edit: EditablePlanTime, timeZone: String) -> Bool {
  if JSParity.trim(edit.name).isEmpty {
    return false
  }
  if edit.startDate.isEmpty || edit.startTime.isEmpty {
    return false
  }
  if edit.endTime.isEmpty {
    return true
  }
  return endFollowsStart(edit, timeZone: timeZone)
}

private func endFollowsStart(_ edit: EditablePlanTime, timeZone: String) -> Bool {
  guard
    let start = formInstant(date: edit.startDate, time: edit.startTime, timeZone: timeZone),
    let end = formInstant(date: edit.endDate, time: edit.endTime, timeZone: timeZone)
  else {
    return false
  }
  return JSParity.time(end) >= JSParity.time(start)
}

/// Why the form can't save, for an error message (`getInvalidPlanTimeEditMessage`); a valid
/// form gets the generic "Fix this time before saving."
public func invalidPlanTimeEditMessage(_ edit: EditablePlanTime, timeZone: String) -> String {
  if JSParity.trim(edit.name).isEmpty {
    return "Time name is required."
  }
  if edit.startDate.isEmpty || edit.startTime.isEmpty {
    return "Start date and time are required."
  }
  if !edit.endTime.isEmpty, !endFollowsStart(edit, timeZone: timeZone) {
    return "End time must be after start time."
  }
  return "Fix this time before saving."
}

/// Needed positions Planning Center attached to the time, in lineup order.
private func neededPositionIds(_ groups: [TeamPositionGroup]?, planTimeId: String) -> [String] {
  var ids: [String] = []
  for group in groups ?? [] {
    for position in group.positions where position.timeId == planTimeId {
      if let neededPositionId = position.neededPositionId, !neededPositionId.isEmpty {
        ids.append(neededPositionId)
      }
    }
  }
  return ids
}

/// Plan people assigned to the time, in lineup order.
private func planPersonIds(_ groups: [TeamPositionGroup]?, planTimeId: String) -> [String] {
  var ids: [String] = []
  for group in groups ?? [] {
    for position in group.positions {
      for person in position.filledPeople ?? []
      where person.assignedTimeIds?.contains(planTimeId) == true {
        ids.append(person.planPersonId)
      }
    }
  }
  return ids
}

/// The form's starting state for a plan time (`buildEditablePlanTime`). Pass the plan's team
/// positions to fill in which needed positions and people the time has.
public func buildEditablePlanTime(
  _ planTime: PlanTime, timeZone: String, groups: [TeamPositionGroup]?
) -> EditablePlanTime {
  let starts = OrgCalendar.wallTime(planTime.startsAt, timeZone: timeZone)
  let ends = planTime.endsAt.map { OrgCalendar.wallTime($0, timeZone: timeZone) }
  return EditablePlanTime(
    name: planTime.name,
    timeType: planTime.timeType,
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
    assignedTeamIds: planTime.assignedTeamIds,
    assignedPositionIds: planTime.assignedPositionIds,
    assignedNeededPositionIds: neededPositionIds(groups, planTimeId: planTime.id),
    assignedPlanPersonIds: planPersonIds(groups, planTimeId: planTime.id)
  )
}

/// Whether the form differs from the saved time (`planTimeEditHasChanges`). Id lists compare
/// without regard to order.
public func planTimeEditHasChanges(
  _ planTime: PlanTime, _ edit: EditablePlanTime, timeZone: String, groups: [TeamPositionGroup]?
) -> Bool {
  let original = buildEditablePlanTime(planTime, timeZone: timeZone, groups: groups)
  return !PlanLogic.identical(original.name, edit.name)
    || original.timeType != edit.timeType
    || !PlanLogic.identical(original.startDate, edit.startDate)
    || !PlanLogic.identical(original.startTime, edit.startTime)
    || !PlanLogic.identical(original.endDate, edit.endDate)
    || !PlanLogic.identical(original.endTime, edit.endTime)
    || !haveSameIds(original.assignedTeamIds, edit.assignedTeamIds)
    || !haveSameIds(original.assignedPositionIds, edit.assignedPositionIds)
    || !haveSameIds(original.assignedNeededPositionIds, edit.assignedNeededPositionIds)
    || !haveSameIds(original.assignedPlanPersonIds, edit.assignedPlanPersonIds)
}

/// A wall time's instant as `toISOString()` writes it (`zonedWallTimeToUtcIso`).
private func isoInstant(date: String, time: String, timeZone: String) -> String? {
  OrgCalendar.utcInstant(dateKey: date, timeValue: time, timeZone: timeZone).map(
    JSONCoding.isoString)
}

/// The start and end the form saves, with an empty end date falling back to the start date.
private func savedRange(
  _ edit: EditablePlanTime, timeZone: String
) -> (startsAt: String, endsAt: Nullable<String>)? {
  guard let startsAt = isoInstant(date: edit.startDate, time: edit.startTime, timeZone: timeZone)
  else {
    return nil
  }
  if edit.endTime.isEmpty {
    return (startsAt, .null)
  }
  let endDate = edit.endDate.isEmpty ? edit.startDate : edit.endDate
  guard let endsAt = isoInstant(date: endDate, time: edit.endTime, timeZone: timeZone) else {
    return nil
  }
  return (startsAt, .value(endsAt))
}

/// The planTimes.update input that saves the form (`buildPlanTimePatch`): the trimmed name,
/// type, start and end converted from the organization's wall time (an empty end clears it),
/// the team and position assignments, and the needed positions and plan people newly assigned
/// to or cleared from the time. Nil when a date or time can't be read, where the web throws.
public func buildPlanTimePatch(
  _ planTime: PlanTime, _ edit: EditablePlanTime, timeZone: String,
  groups: [TeamPositionGroup]?, serviceTypeId: String, planId: String
) -> PlanTimesUpdateInput? {
  guard let range = savedRange(edit, timeZone: timeZone) else {
    return nil
  }
  let originalNeededPositionIds = neededPositionIds(groups, planTimeId: planTime.id)
  let originalPlanPersonIds = planPersonIds(groups, planTimeId: planTime.id)
  let originalNeeded = Set(originalNeededPositionIds)
  let originalPeople = Set(originalPlanPersonIds)
  let editedNeeded = Set(edit.assignedNeededPositionIds)
  let editedPeople = Set(edit.assignedPlanPersonIds)
  return PlanTimesUpdateInput(
    serviceTypeId: serviceTypeId,
    planId: planId,
    planTimeId: planTime.id,
    name: JSParity.trim(edit.name),
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    timeType: edit.timeType,
    assignedTeamIds: edit.assignedTeamIds,
    assignedPositionIds: edit.assignedPositionIds,
    assignedNeededPositionIds: edit.assignedNeededPositionIds.filter {
      !originalNeeded.contains($0)
    },
    clearedNeededPositionIds: originalNeededPositionIds.filter { !editedNeeded.contains($0) },
    assignedPlanPersonIds: edit.assignedPlanPersonIds.filter { !originalPeople.contains($0) },
    clearedPlanPersonIds: originalPlanPersonIds.filter { !editedPeople.contains($0) }
  )
}

/// The add-time form's starting state (`buildDefaultNewPlanTimeEdit`): a copy of the plan's
/// last time (its wall times, type, and team and position assignments), or a new service at
/// `now` when the plan has no times. The web reads the clock; pass `now`.
public func buildDefaultNewPlanTimeEdit(
  _ planTimes: [PlanTime], timeZone: String, now: Date
) -> EditablePlanTime {
  let template = planTimes.last
  let starts = OrgCalendar.wallTime(template?.startsAt ?? now, timeZone: timeZone)
  let ends = template?.endsAt.map { OrgCalendar.wallTime($0, timeZone: timeZone) }
  let timeType = template?.timeType ?? .service
  return EditablePlanTime(
    name: timeType == .rehearsal ? "New rehearsal" : "New service",
    timeType: timeType,
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
    assignedTeamIds: template?.assignedTeamIds ?? [],
    assignedPositionIds: template?.assignedPositionIds ?? [],
    assignedNeededPositionIds: [],
    assignedPlanPersonIds: []
  )
}

/// The planTimes.create input that adds the form's time (`buildCreatePlanTimeRequest`). Nil
/// when a date or time can't be read, where the web throws.
public func buildCreatePlanTimeRequest(
  _ edit: EditablePlanTime, timeZone: String, serviceTypeId: String, planId: String
) -> PlanTimesCreateInput? {
  guard let range = savedRange(edit, timeZone: timeZone) else {
    return nil
  }
  return PlanTimesCreateInput(
    serviceTypeId: serviceTypeId,
    planId: planId,
    name: JSParity.trim(edit.name),
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    timeType: edit.timeType,
    assignedTeamIds: edit.assignedTeamIds,
    assignedPositionIds: edit.assignedPositionIds
  )
}
