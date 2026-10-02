import Foundation

// Ports of the team roster helpers: open positions (apps/web/src/lib/schedule/open-positions.ts),
// plan person status (apps/web/src/components/schedule/plan-person-status.ts), each person's
// assignments on the plan (apps/web/src/components/schedule/plan-assignments.ts), and the
// assignment labels on a candidate tile (apps/web/src/lib/people/plan-assignment-labels.ts).
// Pinned by the `scheduling.openSlotCount`, `scheduling.findFirstPosition`,
// `scheduling.findNextOpenPosition`, `scheduling.planPersonStatusValue`,
// `scheduling.collectPlanAssignments`, `scheduling.otherPlanAssignments`,
// `scheduling.positionFromLabel`, and `scheduling.otherPlanAssignmentLabels` parity suites in
// scripts/parity/scheduling.parity.ts.

/// One position on a plan's lineup (`SlotRef`, and `OpenPositionRef` in open-positions.ts).
public struct SlotRef: Codable, Hashable, Sendable {
  public var teamId: String
  public var teamName: String
  public var positionId: String
  public var positionName: String
  public var source: TeamPositionSource?

  public init(
    teamId: String,
    teamName: String,
    positionId: String,
    positionName: String,
    source: TeamPositionSource? = nil
  ) {
    self.teamId = teamId
    self.teamName = teamName
    self.positionId = positionId
    self.positionName = positionName
    self.source = source
  }

  init(group: TeamPositionGroup, position: TeamPosition) {
    self.init(
      teamId: group.teamId,
      teamName: group.teamName,
      positionId: position.id,
      positionName: position.name,
      source: position.source)
  }
}

/// `OpenPositionRef` in open-positions.ts, the same shape as `SlotRef`.
public typealias OpenPositionRef = SlotRef

/// A plan person's status code in Planning Center: `C` confirmed, `U` unconfirmed (pending),
/// `D` declined (`PlanPersonStatusCode`). It is the status `schedule.updateStatus` sends.
public typealias PlanPersonStatusCode = ScheduleUpdateStatusInputStatus

/// Open slots Planning Center still needs someone for on this position (`openSlotCount`).
/// The contract types the count as a number, so it stays a `Double`.
public func openSlotCount(_ position: TeamPosition) -> Double {
  position.neededCount ?? 0
}

/// The first position in list order, filled or not (`findFirstPosition`).
public func findFirstPosition(_ groups: [TeamPositionGroup]) -> SlotRef? {
  for group in groups {
    if let position = group.positions.first {
      return SlotRef(group: group, position: position)
    }
  }
  return nil
}

/// The next position, in list order after `current`, that still has open slots, wrapping past
/// the end; the first open position when nothing (or a position no longer listed) is selected
/// (`findNextOpenPosition`). Nil when every other position is filled; never `current` itself.
public func findNextOpenPosition(
  _ groups: [TeamPositionGroup], current: (teamId: String, positionId: String)?
) -> SlotRef? {
  let ordered = groups.flatMap { group in group.positions.map { (group: group, position: $0) } }
  let currentIndex =
    current.flatMap { current in
      ordered.firstIndex {
        JSString.equal($0.group.teamId, current.teamId)
          && JSString.equal($0.position.id, current.positionId)
      }
    } ?? -1
  for step in stride(from: 1, through: ordered.count, by: 1) {
    let index = (currentIndex + step) % ordered.count
    guard index != currentIndex else { continue }
    let entry = ordered[index]
    if openSlotCount(entry.position) > 0 {
      return SlotRef(group: entry.group, position: entry.position)
    }
  }
  return nil
}

/// A plan person's status as the lineup shows it (`PlanPersonStatusValue`).
public enum PlanPersonStatusValue: String, Codable, Hashable, Sendable, CaseIterable {
  case confirmed
  case scheduled
  case declined

  /// The Planning Center status code that sets it (`STATUS_TO_CODE`).
  public var code: PlanPersonStatusCode {
    switch self {
    case .confirmed: .c
    case .scheduled: .u
    case .declined: .d
    }
  }

  /// The status menu's label (`STATUS_ITEMS`); scheduled people read as pending.
  public var label: String {
    switch self {
    case .confirmed: "Confirmed"
    case .scheduled: "Pending"
    case .declined: "Declined"
    }
  }
}

/// A plan person's status from Planning Center's raw status, falling back to the mapped
/// status (`getPlanPersonStatusValue`).
public func planPersonStatusValue(_ person: FilledPositionPerson) -> PlanPersonStatusValue {
  planPersonStatusValue(status: person.status, rawStatus: person.rawStatus)
}

/// `planPersonStatusValue(_:)` from the two fields it reads.
public func planPersonStatusValue(
  status: FilledPositionPersonStatus, rawStatus: String?
) -> PlanPersonStatusValue {
  let raw = MusicText.lowercased(JSParity.trim(rawStatus ?? ""))
  if JSString.equal(raw, "c") || JSString.equal(raw, "confirmed") {
    return .confirmed
  }
  if JSString.equal(raw, "d") || JSString.contains(raw, "declined")
    || JSString.contains(raw, "removed")
  {
    return .declined
  }
  return status == .confirmed ? .confirmed : .scheduled
}

/// One of a person's non-declined assignments on a plan (`PlanAssignment`).
public struct PlanAssignment: Codable, Hashable, Sendable {
  public var teamId: String
  public var positionId: String
  public var positionName: String
  /// `.confirmed` or `.scheduled`; declined assignments are not collected.
  public var status: PlanPersonStatusValue

  public init(
    teamId: String, positionId: String, positionName: String, status: PlanPersonStatusValue
  ) {
    self.teamId = teamId
    self.positionId = positionId
    self.positionName = positionName
    self.status = status
  }
}

/// One key per person across positions; people without a Planning Center id key by
/// assignment (`planPersonKey`).
public func planPersonKey(_ person: FilledPositionPerson) -> String {
  person.personId ?? "plan-person:\(person.planPersonId)"
}

/// Each person's non-declined assignments on the plan, in lineup order, keyed by
/// `planPersonKey` (`collectPlanAssignments`).
public func collectPlanAssignments(_ groups: [TeamPositionGroup]) -> [String: [PlanAssignment]] {
  var byPerson: [String: [PlanAssignment]] = [:]
  for group in groups {
    for position in group.positions {
      for person in position.filledPeople ?? [] {
        let status = planPersonStatusValue(person)
        guard status != .declined else { continue }
        byPerson[planPersonKey(person), default: []].append(
          PlanAssignment(
            teamId: group.teamId,
            positionId: position.id,
            positionName: position.name,
            status: status))
      }
    }
  }
  return byPerson
}

/// The person's assignments on the plan other than the given position
/// (`otherPlanAssignments` in plan-assignments.ts).
public func otherPlanAssignments(
  _ assignments: [String: [PlanAssignment]],
  person: FilledPositionPerson,
  slot: (teamId: String, positionId: String)
) -> [PlanAssignment] {
  (assignments[planPersonKey(person)] ?? []).filter { assignment in
    !JSString.equal(assignment.teamId, slot.teamId)
      || !JSString.equal(assignment.positionId, slot.positionId)
  }
}

/// "Band - Keys" reads as "Keys"; the team is rarely in doubt on one plan
/// (`positionFromLabel`).
public func positionFromLabel(_ label: String) -> String {
  let separator = " - "
  guard let index = JSString.firstIndex(of: separator, in: label) else { return label }
  return JSString.suffix(label, from: index + separator.utf16.count)
}

/// The plan's assignment labels other than this slot, which they include when the person is
/// on it (`otherPlanAssignments` in plan-assignment-labels.ts). Labels come from two sources,
/// "Team - Position" and bare "Position", so a bare label that a prefixed one already names is
/// dropped.
public func otherPlanAssignments(
  labels: [String], teamName: String?, positionName: String?
) -> [String] {
  func normalized(_ label: String) -> [UInt16] {
    JSString.key(MusicText.lowercased(JSParity.trim(label)))
  }
  var thisSlot = Set<[UInt16]>()
  if let positionName, JSString.isNonEmpty(positionName) {
    thisSlot = [normalized("\(teamName ?? "") - \(positionName)"), normalized(positionName)]
  }
  let others = labels.filter { !thisSlot.contains(normalized($0)) }
  let normalizedOthers = others.map(normalized)
  return others.filter { label in
    let suffix = Array(" - ".utf16) + normalized(label)
    return !normalizedOthers.contains { $0.reversed().starts(with: suffix.reversed()) }
  }
}
