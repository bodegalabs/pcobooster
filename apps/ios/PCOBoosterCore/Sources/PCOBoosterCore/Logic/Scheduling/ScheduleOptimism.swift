import Foundation

// Pure versions of the cache transforms in apps/web/src/hooks/use-schedule-cache-optimism.ts,
// which patch cached team positions, position candidates, and plan-window histories the
// moment a schedule write starts. Pinned by the `scheduling.optimism` parity suite in
// scripts/parity/scheduling.parity.ts, which drives the web's own functions through a TanStack
// query client. Invalidation and the delayed reconcile refetch belong to the app's query
// layer, not here.

/// The person a schedule write adds (`OptimisticSchedulePerson`).
public struct OptimisticSchedulePerson: Codable, Hashable, Sendable, Identifiable {
  public var id: String
  public var firstName: String?
  public var lastName: String?
  public var fullName: String
  public var photoUrl: String?
  public var photoThumbnailUrl: String?

  public init(
    id: String,
    firstName: String? = nil,
    lastName: String? = nil,
    fullName: String,
    photoUrl: String? = nil,
    photoThumbnailUrl: String? = nil
  ) {
    self.id = id
    self.firstName = firstName
    self.lastName = lastName
    self.fullName = fullName
    self.photoUrl = photoUrl
    self.photoThumbnailUrl = photoThumbnailUrl
  }
}

/// Optimistic schedule writes as pure transforms of the cached API values. Each optimistic
/// write in the web app maps to these:
/// - schedule: `scheduleCandidate` on the slot's candidates and `schedulePerson` on the
///   plan's team positions;
/// - reconcile the real plan person id: both `reconcilePlanPersonId` overloads, on every
///   cached candidates and team positions value;
/// - status change: `setSlotStatus`, `setWindowRowStatus`, and `updateFilledPersonStatus` on
///   every cached value;
/// - unschedule: `clearSlot`, `removeWindowRows`, and `removeFilledPerson` on every cached
///   value.
///
/// A status code the contract does not know (`.unknown`) counts as pending.
public enum ScheduleOptimism {
  // MARK: Team positions

  /// Adds or moves the person onto a position with the given status, confirmed people first
  /// and then by name; `.d` takes them off it instead. The counts are recomputed from the
  /// people (`upsertFilledPerson`).
  public static func upsertFilledPerson(
    _ position: TeamPosition,
    person: OptimisticSchedulePerson,
    planPersonId: String,
    status: PlanPersonStatusCode
  ) -> TeamPosition {
    let current = position.filledPeople ?? []
    let previous = current.first { $0.planPersonId == planPersonId }
    let others = current.filter { $0.planPersonId != planPersonId && $0.id != person.id }
    var updated = position
    guard let filledStatus = filledStatus(status) else {
      updated.filledPeople = others
      return recalculateFilledCounts(updated)
    }
    let added = FilledPositionPerson(
      id: person.id,
      planPersonId: planPersonId,
      name: person.fullName,
      status: filledStatus,
      rawStatus: status.rawValue,
      photoThumbnailUrl: person.photoThumbnailUrl,
      // A new assignment's email state depends on team settings; the refetch fills it in.
      notification: previous?.notification)
    updated.filledPeople = sortedFilledPeople(others + [added])
    return recalculateFilledCounts(updated)
  }

  /// Changes the status of the person with `planPersonId`; `.d` takes them off the position.
  /// A position without that person comes back unchanged (`updateFilledPersonStatus`).
  public static func updateFilledPersonStatus(
    _ position: TeamPosition, planPersonId: String, status: PlanPersonStatusCode
  ) -> TeamPosition {
    let current = position.filledPeople ?? []
    guard current.contains(where: { $0.planPersonId == planPersonId }) else {
      return position
    }
    guard let filledStatus = filledStatus(status) else {
      return removeFilledPerson(position, planPersonId: planPersonId)
    }
    var updated = position
    updated.filledPeople = sortedFilledPeople(
      current.map { person in
        guard person.planPersonId == planPersonId else { return person }
        var changed = person
        changed.status = filledStatus
        changed.rawStatus = status.rawValue
        return changed
      })
    return recalculateFilledCounts(updated)
  }

  /// Takes the person with `planPersonId` off the position and recomputes the counts
  /// (`removeFilledPerson`).
  public static func removeFilledPerson(_ position: TeamPosition, planPersonId: String)
    -> TeamPosition
  {
    var updated = position
    updated.filledPeople = (position.filledPeople ?? []).filter {
      $0.planPersonId != planPersonId
    }
    return recalculateFilledCounts(updated)
  }

  /// `upsertFilledPerson` with `.u` on the one position that was scheduled.
  public static func schedulePerson(
    _ person: OptimisticSchedulePerson,
    planPersonId: String,
    teamId: String,
    positionId: String,
    in groups: [TeamPositionGroup]
  ) -> [TeamPositionGroup] {
    groups.map { group in
      guard group.teamId == teamId else { return group }
      var updated = group
      updated.positions = group.positions.map { position in
        position.id == positionId
          ? upsertFilledPerson(position, person: person, planPersonId: planPersonId, status: .u)
          : position
      }
      return updated
    }
  }

  /// `updateFilledPersonStatus` on every position.
  public static func updateFilledPersonStatus(
    _ groups: [TeamPositionGroup], planPersonId: String, status: PlanPersonStatusCode
  ) -> [TeamPositionGroup] {
    mapPositions(groups) {
      updateFilledPersonStatus($0, planPersonId: planPersonId, status: status)
    }
  }

  /// `removeFilledPerson` on every position, which also recomputes every position's counts.
  public static func removeFilledPerson(_ groups: [TeamPositionGroup], planPersonId: String)
    -> [TeamPositionGroup]
  {
    mapPositions(groups) { removeFilledPerson($0, planPersonId: planPersonId) }
  }

  /// Swaps the optimistic plan person id for the one Planning Center created.
  public static func reconcilePlanPersonId(
    _ groups: [TeamPositionGroup], from optimisticPlanPersonId: String, to planPersonId: String
  ) -> [TeamPositionGroup] {
    guard optimisticPlanPersonId != planPersonId else { return groups }
    return mapPositions(groups) { position in
      var updated = position
      updated.filledPeople = position.filledPeople?.map { person in
        guard person.planPersonId == optimisticPlanPersonId else { return person }
        var changed = person
        changed.planPersonId = planPersonId
        return changed
      }
      return updated
    }
  }

  // MARK: Position candidates

  /// The selected slot an optimistic write gives a candidate (`slotWithStatus`).
  public static func optimisticSlot(status: PlanPersonStatusCode, planPersonId: String)
    -> SelectedPlanSlot
  {
    let slotStatus: SelectedPlanSlotStatus =
      switch status {
      case .c: .confirmed
      case .d: .declined
      case .u, .unknown: .pending
      }
    return SelectedPlanSlot(planPersonId: planPersonId, status: slotStatus, declineReason: nil)
  }

  /// A candidate for someone scheduled from outside the candidate list, pending on the slot,
  /// with names split from the full name when they are missing (`createOptimisticCandidate`).
  /// Preferences stay unknown until the next candidates read.
  public static func optimisticCandidate(
    _ person: OptimisticSchedulePerson, planPersonId: String
  ) -> PositionCandidate {
    let words = JSParity.words(person.fullName)
    return PositionCandidate(
      id: person.id,
      firstName: person.firstName ?? words.first ?? "",
      lastName: person.lastName ?? words.dropFirst().joined(separator: " "),
      fullName: person.fullName,
      photoUrl: person.photoUrl,
      photoThumbnailUrl: person.photoThumbnailUrl,
      archived: false,
      selectedPlanRosterLabels: [],
      selectedPlanSlot: optimisticSlot(status: .u, planPersonId: planPersonId),
      schedulingPreferences: nil)
  }

  /// Puts the person on the slot as pending; someone not in the list joins at the end, so
  /// earlier detail batches keep their keys.
  public static func scheduleCandidate(
    _ candidates: PositionCandidates, person: OptimisticSchedulePerson, planPersonId: String
  ) -> PositionCandidates {
    var updated = candidates
    if candidates.candidates.contains(where: { $0.id == person.id }) {
      updated.candidates = candidates.candidates.map { candidate in
        guard candidate.id == person.id else { return candidate }
        var changed = candidate
        changed.selectedPlanSlot = optimisticSlot(status: .u, planPersonId: planPersonId)
        return changed
      }
    } else {
      updated.candidates.append(optimisticCandidate(person, planPersonId: planPersonId))
    }
    return updated
  }

  /// Swaps the optimistic plan person id on the slot for the one Planning Center created.
  public static func reconcilePlanPersonId(
    _ candidates: PositionCandidates, from optimisticPlanPersonId: String, to planPersonId: String
  ) -> PositionCandidates {
    guard optimisticPlanPersonId != planPersonId else { return candidates }
    return mapSlots(candidates) { slot in
      guard slot?.planPersonId == optimisticPlanPersonId, var changed = slot else { return slot }
      changed.planPersonId = planPersonId
      return changed
    }
  }

  /// Gives the slot held by `planPersonId` the new status, clearing any decline reason.
  public static func setSlotStatus(
    _ candidates: PositionCandidates, planPersonId: String, status: PlanPersonStatusCode
  ) -> PositionCandidates {
    mapSlots(candidates) { slot in
      slot?.planPersonId == planPersonId
        ? optimisticSlot(status: status, planPersonId: planPersonId) : slot
    }
  }

  /// Clears the slot held by `planPersonId`, and any slot of the person `personId` names.
  public static func clearSlot(
    _ candidates: PositionCandidates, planPersonId: String, personId: String?
  ) -> PositionCandidates {
    var updated = candidates
    updated.candidates = candidates.candidates.map { candidate in
      let holdsSlot = candidate.selectedPlanSlot?.planPersonId == planPersonId
      let isPerson = JSString.isNonEmpty(personId) && candidate.id == personId
      guard holdsSlot || isPerson else { return candidate }
      var changed = candidate
      changed.selectedPlanSlot = nil
      return changed
    }
    return updated
  }

  // MARK: Plan-window history

  /// History's copy of the selected plan can still name a plan person the scheduler just
  /// changed; without a roster entry for the slot, the list would fall back to that copy.
  /// `update` returns the changed row, or nil to drop it (`updateWindowRosterRows`).
  public static func patchWindowRows(
    _ calls: [PlanWindowHistoryBatch],
    planPersonId: String,
    update: (WindowRosterRow) -> WindowRosterRow?
  ) -> [PlanWindowHistoryBatch] {
    calls.map { call in
      var updated = call
      updated.people = call.people.map { person in
        var changed = person
        changed.rows = person.rows.flatMap { row in
          guard row.id == planPersonId else { return [row] }
          return update(row).map { [$0] } ?? []
        }
        return changed
      }
      return updated
    }
  }

  /// The new status on the window rows for `planPersonId`, without a decline reason.
  public static func setWindowRowStatus(
    _ calls: [PlanWindowHistoryBatch], planPersonId: String, status: PlanPersonStatusCode
  ) -> [PlanWindowHistoryBatch] {
    patchWindowRows(calls, planPersonId: planPersonId) { row in
      var changed = row
      changed.status = status.rawValue
      changed.declineReason = nil
      return changed
    }
  }

  /// Drops the window rows for `planPersonId`.
  public static func removeWindowRows(_ calls: [PlanWindowHistoryBatch], planPersonId: String)
    -> [PlanWindowHistoryBatch]
  {
    patchWindowRows(calls, planPersonId: planPersonId) { _ in nil }
  }

  // MARK: Helpers

  /// `C` is confirmed, `D` is off the position (nil), anything else is pending.
  private static func filledStatus(_ status: PlanPersonStatusCode) -> FilledPositionPersonStatus? {
    switch status {
    case .d: nil
    case .c: .confirmed
    case .u, .unknown: .pending
    }
  }

  /// Confirmed first, then by name (`localeCompare`), keeping the order of ties.
  private static func sortedFilledPeople(_ people: [FilledPositionPerson])
    -> [FilledPositionPerson]
  {
    JSSort.sorted(people) { a, b in
      if a.status != b.status {
        return a.status == .confirmed ? -1 : 1
      }
      return Double(JSCollator.compare(a.name, b.name))
    }
  }

  /// Counts from the people, and no list when nobody is left (`recalculateFilledCounts`).
  private static func recalculateFilledCounts(_ position: TeamPosition) -> TeamPosition {
    let people = position.filledPeople ?? []
    var updated = position
    updated.filledConfirmedCount = Double(people.count(where: { $0.status == .confirmed }))
    updated.filledPendingCount = Double(people.count(where: { $0.status == .pending }))
    updated.filledPeople = people.isEmpty ? nil : people
    return updated
  }

  private static func mapPositions(
    _ groups: [TeamPositionGroup], _ transform: (TeamPosition) -> TeamPosition
  ) -> [TeamPositionGroup] {
    groups.map { group in
      var updated = group
      updated.positions = group.positions.map(transform)
      return updated
    }
  }

  private static func mapSlots(
    _ candidates: PositionCandidates, _ transform: (SelectedPlanSlot?) -> SelectedPlanSlot?
  ) -> PositionCandidates {
    var updated = candidates
    updated.candidates = candidates.candidates.map { candidate in
      var changed = candidate
      changed.selectedPlanSlot = transform(candidate.selectedPlanSlot)
      return changed
    }
    return updated
  }
}
