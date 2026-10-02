import Foundation
import Observation
import PCOBoosterCore

/// One open plan time form: the draft (`EditablePlanTime`, wall times in the organization's
/// zone), what it started from, and the rules for closing it. Editing an existing time saves on
/// close when valid (the web's persist-on-close popover); adding is the one explicit action.
///
/// The date pickers bind through `start`/`end`, which convert between the draft's wall-clock
/// strings and instants with `OrgCalendar` in the organization's zone, never the device's.
@MainActor
@Observable
final class PlanTimeEditorModel: Identifiable {
  enum Mode: Equatable {
    case edit(planTimeId: String)
    case create
  }

  let mode: Mode
  let timeZone: String
  var draft: EditablePlanTime
  /// The form as it opened, for "did anything change" in the add sheet.
  private(set) var opening: EditablePlanTime
  /// The person touched assignments, so later team position loads must not overwrite them.
  private(set) var assignmentsTouched = false
  /// Closing discards the draft (after Delete, or "Discard changes").
  var discarded = false
  /// Bumps when closing was refused because the form is invalid, to replay the warning.
  private(set) var refusedCloses = 0
  /// The "keep editing or discard" question is showing.
  var isConfirmingDiscard = false
  /// The end the "End time" toggle restores after it was switched off.
  @ObservationIgnored private var lastEnd: ZonedWallTime?

  var id: String {
    switch mode {
    case .edit(let planTimeId): planTimeId
    case .create: "new-time"
    }
  }

  var planTimeId: String? {
    if case .edit(let id) = mode { id } else { nil }
  }

  var isCreating: Bool { mode == .create }

  init(mode: Mode, draft: EditablePlanTime, timeZone: String) {
    self.mode = mode
    self.draft = draft
    opening = draft
    self.timeZone = timeZone
  }

  /// The form for an existing time.
  convenience init(editing planTime: PlanTime, groups: [TeamPositionGroup]?, timeZone: String) {
    self.init(
      mode: .edit(planTimeId: planTime.id),
      draft: buildEditablePlanTime(planTime, timeZone: timeZone, groups: groups),
      timeZone: timeZone)
  }

  /// The add form, prefilled from `template` (the plan's last time, or the time being
  /// duplicated), limited to the types the person may add. A plan without times starts a new
  /// service on the plan's own day rather than today (the web starts at the current moment,
  /// which for next Sunday's plan is the wrong day).
  convenience init(
    adding template: [PlanTime], allowedTypes: [PlanTimeType], planDate: Date?,
    timeZone: String, now: Date
  ) {
    let start =
      template.isEmpty
      ? Self.emptyPlanStart(planDate: planDate, now: now, timeZone: timeZone) : now
    var draft = buildDefaultNewPlanTimeEdit(template, timeZone: timeZone, now: start)
    if !allowedTypes.contains(draft.timeType), let fallback = allowedTypes.first {
      draft.timeType = fallback
      draft.name = PlanTimeKind(fallback).defaultNewName ?? draft.name
    }
    self.init(mode: .create, draft: draft, timeZone: timeZone)
  }

  /// Where a plan's first time starts: the plan's day in the organization's zone, at the plan's
  /// time unless that is midnight (a date-only plan), else at the current wall time.
  static func emptyPlanStart(planDate: Date?, now: Date, timeZone: String) -> Date {
    guard let planDate else { return now }
    let plan = OrgCalendar.wallTime(planDate, timeZone: timeZone)
    guard plan.timeValue == "00:00" else { return planDate }
    let clock = OrgCalendar.wallTime(now, timeZone: timeZone)
    return OrgCalendar.utcInstant(
      dateKey: plan.dateKey, timeValue: clock.timeValue, timeZone: timeZone) ?? planDate
  }

  // MARK: Validation

  var isValid: Bool { isValidPlanTimeEdit(draft, timeZone: timeZone) }

  /// Why the form can't save, or nil when it can.
  var validationMessage: String? {
    isValid ? nil : invalidPlanTimeEditMessage(draft, timeZone: timeZone)
  }

  /// Which field the validation message belongs under, in the order the web checks them.
  enum ValidationField {
    case name
    case when
  }

  var invalidField: ValidationField? {
    guard !isValid else { return nil }
    return draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .name : .when
  }

  /// Whether the draft differs from the saved time (edit) or the prefilled form (add).
  func hasChanges(against planTime: PlanTime?, groups: [TeamPositionGroup]?) -> Bool {
    if let planTime {
      return planTimeEditHasChanges(planTime, draft, timeZone: timeZone, groups: groups)
    }
    return draft != opening
  }

  /// Refuses to close an invalid draft: plays the warning and asks to keep editing or discard.
  func refuseClose() {
    refusedCloses += 1
    isConfirmingDiscard = true
  }

  // MARK: Fields

  var name: String {
    get { draft.name }
    set { draft.name = newValue }
  }

  /// Switching type in the add sheet also swaps a still-default name ("New service" to
  /// "New rehearsal").
  var timeType: PlanTimeType {
    get { draft.timeType }
    set {
      let wasDefault = PlanTimeKind.pickerOrder.contains { type in
        PlanTimeKind(type).defaultNewName == draft.name
      }
      if isCreating, wasDefault, let name = PlanTimeKind(newValue).defaultNewName {
        draft.name = name
      }
      draft.timeType = newValue
    }
  }

  /// The start as an instant (organization wall time).
  var start: Date {
    get { instant(date: draft.startDate, time: draft.startTime) ?? .now }
    set { moveStart(to: newValue) }
  }

  var hasEnd: Bool {
    get { !draft.endTime.isEmpty }
    set { setHasEnd(newValue) }
  }

  /// The end as an instant; the start while there is none.
  var end: Date {
    get {
      let endDate = draft.endDate.isEmpty ? draft.startDate : draft.endDate
      return instant(date: endDate, time: draft.endTime) ?? start
    }
    set {
      let wall = OrgCalendar.wallTime(max(newValue, start), timeZone: timeZone)
      draft.endDate = wall.dateKey
      draft.endTime = wall.timeValue
    }
  }

  var assignments: TimeAssignmentValue {
    get { TimeAssignmentValue(draft) }
    set {
      assignmentsTouched = true
      draft = newValue.applied(to: draft)
    }
  }

  /// Fills in the needed slots and people Planning Center already ties to the time, once team
  /// positions load, unless the person has started choosing (web disables the selector until
  /// then, so it never saves an assignment list built without them).
  func syncAssignments(from planTime: PlanTime, groups: [TeamPositionGroup]?) {
    guard !assignmentsTouched, !isCreating else { return }
    let fresh = buildEditablePlanTime(planTime, timeZone: timeZone, groups: groups)
    draft.assignedNeededPositionIds = fresh.assignedNeededPositionIds
    draft.assignedPlanPersonIds = fresh.assignedPlanPersonIds
    opening.assignedNeededPositionIds = fresh.assignedNeededPositionIds
    opening.assignedPlanPersonIds = fresh.assignedPlanPersonIds
  }

  /// Moving the start keeps the length, as Calendar does (the web leaves the end behind and
  /// then reports the range invalid).
  private func moveStart(to newStart: Date) {
    let length = hasEnd ? max(0, end.timeIntervalSince(start)) : nil
    let wall = OrgCalendar.wallTime(newStart, timeZone: timeZone)
    draft.startDate = wall.dateKey
    draft.startTime = wall.timeValue
    if let length {
      let endWall = OrgCalendar.wallTime(newStart.addingTimeInterval(length), timeZone: timeZone)
      draft.endDate = endWall.dateKey
      draft.endTime = endWall.timeValue
    } else {
      draft.endDate = wall.dateKey
    }
  }

  private func setHasEnd(_ on: Bool) {
    if on {
      let restored = lastEnd.flatMap { instant(date: $0.dateKey, time: $0.timeValue) }
      let endInstant = restored.map { max($0, start) } ?? start.addingTimeInterval(3600)
      let wall = OrgCalendar.wallTime(endInstant, timeZone: timeZone)
      draft.endDate = wall.dateKey
      draft.endTime = wall.timeValue
    } else {
      if !draft.endTime.isEmpty {
        lastEnd = ZonedWallTime(
          dateKey: draft.endDate.isEmpty ? draft.startDate : draft.endDate,
          timeValue: draft.endTime)
      }
      draft.endTime = ""
      draft.endDate = draft.startDate
    }
  }

  private func instant(date: String, time: String) -> Date? {
    OrgCalendar.utcInstant(dateKey: date, timeValue: time, timeZone: timeZone)
  }
}
