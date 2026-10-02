import Foundation
import PCOBoosterCore

/// The cache patches behind the Times screen's optimistic writes: what the plan's times and team
/// positions will look like once Planning Center applies a save, an add, or a delete. They run
/// before the request; the query layer rolls them back if it fails and refetches both reads
/// shortly after the last write, so the server's answer always wins.
enum PlanTimeOptimism {
  // MARK: Plan times

  /// Times in the order the API returns them: by start, ties kept in place.
  static func sorted(_ times: [PlanTime]) -> [PlanTime] {
    times.enumerated()
      .sorted { lhs, rhs in
        lhs.element.startsAt == rhs.element.startsAt
          ? lhs.offset < rhs.offset : lhs.element.startsAt < rhs.element.startsAt
      }
      .map(\.element)
  }

  /// The saved time `patch` describes, on top of `time`.
  static func applying(_ patch: PlanTimesUpdateInput, to time: PlanTime) -> PlanTime {
    var next = time
    if let name = patch.name {
      next.name = name
    }
    if let timeType = patch.timeType {
      next.timeType = timeType
    }
    if let startsAt = patch.startsAt.flatMap(JSONCoding.parseISODate) {
      next.startsAt = startsAt
    }
    switch patch.endsAt {
    case .some(.null): next.endsAt = nil
    case .some(.value(let endsAt)): next.endsAt = JSONCoding.parseISODate(endsAt) ?? next.endsAt
    case nil: break
    }
    if let teamIds = patch.assignedTeamIds {
      next.assignedTeamIds = teamIds
    }
    if let positionIds = patch.assignedPositionIds {
      next.assignedPositionIds = positionIds
    }
    return next
  }

  /// The placeholder row an add shows until the server answers.
  static func pendingTime(_ request: PlanTimesCreateInput, id: String) -> PlanTime? {
    guard let startsAt = JSONCoding.parseISODate(request.startsAt) else { return nil }
    let endsAt: Date? =
      switch request.endsAt {
      case .some(.value(let value)): JSONCoding.parseISODate(value)
      case .some(.null), nil: nil
      }
    return PlanTime(
      startsAt: startsAt, endsAt: endsAt, id: id, name: request.name ?? "",
      timeType: request.timeType, teamReminders: .array([]),
      assignedTeamIds: request.assignedTeamIds ?? [],
      assignedPositionIds: request.assignedPositionIds ?? [],
      splitTeamRehearsalAssignmentIds: [])
  }

  static func replacing(_ time: PlanTime, in times: [PlanTime]) -> [PlanTime] {
    sorted(times.map { $0.id == time.id ? time : $0 })
  }

  static func inserting(_ time: PlanTime, into times: [PlanTime]) -> [PlanTime] {
    sorted(times.filter { $0.id != time.id } + [time])
  }

  /// The real time in place of its placeholder (or added, when a refetch already dropped it).
  static func reconciling(pendingId: String, with created: PlanTime, in times: [PlanTime])
    -> [PlanTime]
  {
    let kept = times.filter { $0.id != pendingId && $0.id != created.id }
    return sorted(kept + [created])
  }

  // MARK: Team positions

  /// Needed slots and plan people newly assigned to, or cleared from, `timeId`, as the update's
  /// diffs describe them. People keep `serviceTimeIds` in step for service times.
  static func applyingAssignments(
    _ groups: [TeamPositionGroup], timeId: String, isService: Bool,
    assignedNeeded: [String], clearedNeeded: [String],
    assignedPeople: [String], clearedPeople: [String]
  ) -> [TeamPositionGroup] {
    let assignNeeded = Set(assignedNeeded)
    let clearNeeded = Set(clearedNeeded)
    let assignPeople = Set(assignedPeople)
    let clearPeople = Set(clearedPeople)
    guard !(assignNeeded.isEmpty && clearNeeded.isEmpty && assignPeople.isEmpty && clearPeople.isEmpty)
    else { return groups }
    return groups.map { group in
      var group = group
      group.positions = group.positions.map { position in
        var position = position
        if let neededId = position.neededPositionId {
          if assignNeeded.contains(neededId) {
            position.timeId = timeId
          } else if clearNeeded.contains(neededId), position.timeId == timeId {
            position.timeId = nil
          }
        }
        position.filledPeople = position.filledPeople?.map { person in
          var person = person
          if assignPeople.contains(person.planPersonId) {
            person.assignedTimeIds = adding(timeId, to: person.assignedTimeIds)
            if isService {
              person.serviceTimeIds = adding(timeId, to: person.serviceTimeIds)
            }
          } else if clearPeople.contains(person.planPersonId) {
            person.assignedTimeIds = person.assignedTimeIds?.filter { $0 != timeId }
            person.serviceTimeIds = person.serviceTimeIds?.filter { $0 != timeId }
          }
          return person
        }
        return position
      }
      return group
    }
  }

  /// Every trace of a deleted time: needed slots lose it and people's times drop it.
  static func removingTime(_ timeId: String, from groups: [TeamPositionGroup])
    -> [TeamPositionGroup]
  {
    groups.map { group in
      var group = group
      group.positions = group.positions.map { position in
        var position = position
        if position.timeId == timeId {
          position.timeId = nil
        }
        position.filledPeople = position.filledPeople?.map { person in
          var person = person
          person.assignedTimeIds = person.assignedTimeIds?.filter { $0 != timeId }
          person.serviceTimeIds = person.serviceTimeIds?.filter { $0 != timeId }
          return person
        }
        return position
      }
      return group
    }
  }

  private static func adding(_ id: String, to ids: [String]?) -> [String] {
    let ids = ids ?? []
    return ids.contains(id) ? ids : ids + [id]
  }
}
