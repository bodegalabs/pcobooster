import Foundation
import PCOBoosterCore

/// Who a plan time is for, as the assignment picker edits it (web `TimeAssignmentValue`): whole
/// teams, team positions, needed-position slots, and individual plan people.
struct TimeAssignmentValue: Hashable {
  var teamIds: [String]
  var positionIds: [String]
  var neededPositionIds: [String]
  var planPersonIds: [String]

  static let empty = TimeAssignmentValue(
    teamIds: [], positionIds: [], neededPositionIds: [], planPersonIds: [])

  init(teamIds: [String], positionIds: [String], neededPositionIds: [String], planPersonIds: [String]) {
    self.teamIds = teamIds
    self.positionIds = positionIds
    self.neededPositionIds = neededPositionIds
    self.planPersonIds = planPersonIds
  }

  init(_ edit: EditablePlanTime) {
    teamIds = edit.assignedTeamIds
    positionIds = edit.assignedPositionIds
    neededPositionIds = edit.assignedNeededPositionIds
    planPersonIds = edit.assignedPlanPersonIds
  }

  var isEmpty: Bool {
    teamIds.isEmpty && positionIds.isEmpty && neededPositionIds.isEmpty && planPersonIds.isEmpty
  }

  /// `edit` with these assignments.
  func applied(to edit: EditablePlanTime) -> EditablePlanTime {
    var next = edit
    next.assignedTeamIds = teamIds
    next.assignedPositionIds = positionIds
    next.assignedNeededPositionIds = neededPositionIds
    next.assignedPlanPersonIds = planPersonIds
    return next
  }
}

/// One position or plan slot in the picker (web `PositionOption`).
struct TimePositionOption: Identifiable, Hashable {
  let positionId: String
  let name: String
  let teamId: String
  let teamName: String
  let source: TeamPositionSource
  let neededPositionId: String?

  /// Unique across sources, like the web's `${source}:${id}` key.
  var id: String { "\(source.rawValue):\(positionId)" }

  /// A needed-position slot, which toggles `neededPositionIds`.
  var isNeededSlot: Bool {
    source == .neededPosition && !(neededPositionId ?? "").isEmpty
  }

  /// Team positions and needed slots can carry a time; plan-member and custom positions follow
  /// their people instead (the web disables them).
  var isSelectable: Bool {
    source == .teamPosition || isNeededSlot
  }

  func isSelected(in value: TimeAssignmentValue) -> Bool {
    if isNeededSlot, let neededPositionId {
      return value.neededPositionIds.contains(neededPositionId)
    }
    return value.positionIds.contains(positionId)
  }
}

/// One scheduled person in the picker (web `buildMemberRows`).
struct TimePersonOption: Identifiable, Hashable {
  let planPersonId: String
  let personId: String?
  let name: String
  let photoURL: URL?
  let teamName: String
  let positionName: String
  let status: PlanPersonStatusValue

  var id: String { planPersonId }

  /// Planning Center skips declined people when a time's people change, so the picker shows
  /// them without a toggle.
  var isSelectable: Bool { status != .declined }

  var scheduleStatus: ScheduleStatus {
    switch status {
    case .confirmed: .confirmed
    case .scheduled: .pending
    case .declined: .declined
    }
  }
}

/// Pure helpers for time assignments, ported from `time-assignment-selector.tsx` where the web
/// has them, plus the row summaries the native list adds.
enum TimeAssignments {
  static func positionOptions(_ groups: [TeamPositionGroup]) -> [TimePositionOption] {
    groups.flatMap { group in
      group.positions.map { position in
        TimePositionOption(
          positionId: position.id, name: position.name, teamId: group.teamId,
          teamName: group.teamName, source: position.source ?? .teamPosition,
          neededPositionId: position.neededPositionId)
      }
    }
  }

  static func personOptions(_ groups: [TeamPositionGroup]) -> [TimePersonOption] {
    var seen = Set<String>()
    var people: [TimePersonOption] = []
    for group in groups {
      for position in group.positions {
        for person in position.filledPeople ?? [] where seen.insert(person.planPersonId).inserted {
          people.append(
            TimePersonOption(
              planPersonId: person.planPersonId, personId: person.personId, name: person.name,
              photoURL: person.photoThumbnailUrl.flatMap(URL.init(string:)),
              teamName: group.teamName, positionName: position.name,
              status: planPersonStatusValue(person)))
        }
      }
    }
    return people
  }

  /// Adds `id` when missing, removes it when present (web `toggleId`).
  static func toggle(_ ids: [String], _ id: String) -> [String] {
    ids.contains(id) ? ids.filter { $0 != id } : ids + [id]
  }

  /// The picker's summary (web `buildLabel`): "No assignments", "All teams", a single name, or
  /// "2 teams, 3 positions, 1 person".
  ///
  /// One deliberate difference: the web compares the first needed-position id with `===`, so
  /// with no needed slots chosen it matches the first position that has none and can name it
  /// instead of the one chosen person. This looks names up only for ids that exist.
  static func label(groups: [TeamPositionGroup], value: TimeAssignmentValue) -> String {
    let positionCount = value.positionIds.count + value.neededPositionIds.count
    let count = value.teamIds.count + positionCount + value.planPersonIds.count
    if count == 0 {
      return "No assignments"
    }
    if !groups.isEmpty, value.teamIds.count == groups.count, positionCount == 0,
      value.planPersonIds.isEmpty
    {
      return "All teams"
    }
    if count == 1, let name = singleName(groups: groups, value: value), !name.isEmpty {
      return name
    }
    return [
      value.teamIds.isEmpty ? nil : counted(value.teamIds.count, "team", "teams"),
      positionCount == 0 ? nil : counted(positionCount, "position", "positions"),
      value.planPersonIds.isEmpty ? nil : counted(value.planPersonIds.count, "person", "people"),
    ]
    .compactMap { $0 }
    .joined(separator: ", ")
  }

  private static func singleName(groups: [TeamPositionGroup], value: TimeAssignmentValue)
    -> String?
  {
    if let teamId = value.teamIds.first {
      return groups.first { $0.teamId == teamId }?.teamName
    }
    let positions = positionOptions(groups)
    if let positionId = value.positionIds.first {
      return positions.first { $0.positionId == positionId }?.name
    }
    if let neededId = value.neededPositionIds.first {
      return positions.first { $0.neededPositionId == neededId }?.name
    }
    if let planPersonId = value.planPersonIds.first {
      return personOptions(groups).first { $0.planPersonId == planPersonId }?.name
    }
    return nil
  }

  static func counted(_ count: Int, _ singular: String, _ plural: String) -> String {
    "\(count) \(count == 1 ? singular : plural)"
  }

  /// The row's "who" line from the saved time: "All teams", "Band and Vocals", "4 teams", plus
  /// position names or a count, plus the plan slots tied to it. Nil when the time names no
  /// teams, positions, or slots.
  static func rowSummary(_ time: PlanTime, groups: [TeamPositionGroup]?) -> String? {
    let groups = groups ?? []
    var parts: [String] = []
    let teamIds = time.assignedTeamIds
    if !teamIds.isEmpty {
      let names = groups.filter { teamIds.contains($0.teamId) }.map(\.teamName)
      if !groups.isEmpty, Set(teamIds).isSuperset(of: groups.map(\.teamId)) {
        parts.append("All teams")
      } else if names.count == teamIds.count, (1...3).contains(names.count) {
        parts.append(names.formatted(.list(type: .and)))
      } else {
        parts.append(counted(teamIds.count, "team", "teams"))
      }
    }
    let positionIds = time.assignedPositionIds
    if !positionIds.isEmpty {
      let names = positionOptions(groups).filter { positionIds.contains($0.positionId) }.map(\.name)
      if names.count == positionIds.count, (1...2).contains(names.count) {
        parts.append(names.formatted(.list(type: .and)))
      } else {
        parts.append(counted(positionIds.count, "position", "positions"))
      }
    }
    // Needed slots carry their time on the slot itself, not on the plan time.
    let slots = groups.flatMap(\.positions).filter { position in
      position.timeId == time.id && !(position.neededPositionId ?? "").isEmpty
    }
    if slots.count == 1, let slot = slots.first {
      parts.append("\(slot.name) slot")
    } else if slots.count > 1 {
      parts.append(counted(slots.count, "plan slot", "plan slots"))
    }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }

  /// The people serving at a time: everyone on the plan whose assigned times include it, minus
  /// declines, one entry per person, in lineup order.
  static func people(at timeId: String, in groups: [TeamPositionGroup]?) -> [TimePersonOption] {
    guard let groups else { return [] }
    var seen = Set<String>()
    var people: [TimePersonOption] = []
    for group in groups {
      for position in group.positions {
        for person in position.filledPeople ?? []
        where person.assignedTimeIds?.contains(timeId) == true {
          let status = planPersonStatusValue(person)
          let key = person.personId ?? person.name
          guard status != .declined, seen.insert(key).inserted else { continue }
          people.append(
            TimePersonOption(
              planPersonId: person.planPersonId, personId: person.personId, name: person.name,
              photoURL: person.photoThumbnailUrl.flatMap(URL.init(string:)),
              teamName: group.teamName, positionName: position.name, status: status))
        }
      }
    }
    return people
  }
}
