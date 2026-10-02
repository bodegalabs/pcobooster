import Foundation
import PCOBoosterCore

/// The plan's scheduling writes, with the web's optimism (`use-schedule-cache-optimism.ts`
/// through the `ScheduleOptimism` ports): every cached lineup, candidate list, and window
/// history changes the moment a write starts, rolls back if it fails, and the screens showing
/// them refetch 2.5 s after the last write (the settle refetch). Failures surface as error
/// toasts; there are no success toasts.
@MainActor
struct ScheduleWriter {
  let queries: QueryClient
  let serviceTypeId: String
  let planId: String

  var teamPositionsKey: QueryKey {
    .teamPositions(serviceTypeId: serviceTypeId, planId: planId)
  }

  // MARK: Assign

  enum AssignResult: Equatable {
    /// Scheduled (or Planning Center already had them there, which counts the same).
    case scheduled
    /// Failed and rolled back; `message` is what to show.
    case failed(message: String, retryable: Bool)
  }

  /// Schedules `person` on `slot` (`schedule.assign`). `ALREADY_SCHEDULED` counts as success;
  /// `POSITION_MISMATCH` names the position Planning Center used instead.
  func assign(_ person: OptimisticSchedulePerson, slot: SlotRef, oneOff: Bool) async
    -> AssignResult
  {
    let optimisticId = "optimistic:\(planId):\(slot.teamId):\(slot.positionId):\(person.id)"
    let candidatesKey = QueryKey.positionCandidates(
      serviceTypeId: serviceTypeId, teamId: slot.teamId, positionId: slot.positionId,
      planId: planId)
    var rollback = queries.mutate(candidatesKey, as: PositionCandidates.self) { candidates in
      candidates = ScheduleOptimism.scheduleCandidate(
        candidates, person: person, planPersonId: optimisticId)
    }
    rollback.append(
      queries.mutate(teamPositionsKey, as: [TeamPositionGroup].self) { groups in
        groups = ScheduleOptimism.schedulePerson(
          person, planPersonId: optimisticId, teamId: slot.teamId, positionId: slot.positionId,
          in: groups)
        // Scheduling someone fills one of the position's open slots in Planning Center, so the
        // count stays steady instead of jumping until the refetch.
        groups = Self.adjustingNeededCount(groups, slot: slot, by: -1)
      })
    let input = ScheduleAssignInput(
      serviceTypeId: serviceTypeId, personId: person.id, planId: planId, teamId: slot.teamId,
      positionId: slot.positionId, teamName: slot.teamName, positionName: slot.positionName,
      oneOff: oneOff)
    let settle = settleFilters(teamId: slot.teamId, positionId: slot.positionId)
    do {
      let output = try await queries.perform(RPC.Schedule.assign, input, settle: settle)
      reconcile(from: optimisticId, to: output.data.id)
      return .scheduled
    } catch let error as APIError where error.code == .alreadyScheduled {
      return .scheduled
    } catch {
      rollback.rollback()
      return .failed(message: Self.assignMessage(error), retryable: Self.isRetryable(error))
    }
  }

  private func reconcile(from optimisticId: String, to planPersonId: String) {
    guard !planPersonId.isEmpty, planPersonId != optimisticId else { return }
    _ = queries.mutate(
      matching: .family(.positionCandidates) { [planId] in $0.parts.last == planId },
      as: PositionCandidates.self
    ) { _, candidates in
      candidates = ScheduleOptimism.reconcilePlanPersonId(
        candidates, from: optimisticId, to: planPersonId)
    }
    _ = queries.mutate(teamPositionsKey, as: [TeamPositionGroup].self) { groups in
      groups = ScheduleOptimism.reconcilePlanPersonId(
        groups, from: optimisticId, to: planPersonId)
    }
  }

  // MARK: Status and unschedule

  /// Changes a plan person's status (`schedule.updateStatus`). Declining takes them off the
  /// lineup, as Planning Center does. Returns whether it saved.
  @discardableResult
  func updateStatus(
    planPersonId: String, personId: String?, status: PlanPersonStatusCode,
    slot: (teamId: String, positionId: String)?
  ) async -> Bool {
    let input = ScheduleUpdateStatusInput(
      planPersonId: planPersonId, status: status, serviceTypeId: serviceTypeId,
      personId: personId, planId: planId)
    let output = await queries.write(
      RPC.Schedule.updateStatus, input,
      optimistic: { queries in
        var rollback = queries.mutate(
          matching: .family(.positionCandidates), as: PositionCandidates.self
        ) { _, candidates in
          candidates = ScheduleOptimism.setSlotStatus(
            candidates, planPersonId: planPersonId, status: status)
        }
        rollback.append(
          queries.mutate(
            matching: .family(.planWindowHistory), as: [PlanWindowHistoryBatch].self
          ) { _, calls in
            calls = ScheduleOptimism.setWindowRowStatus(
              calls, planPersonId: planPersonId, status: status)
          })
        rollback.append(
          queries.mutate(matching: .family(.teamPositions), as: [TeamPositionGroup].self) {
            _, groups in
            groups = ScheduleOptimism.updateFilledPersonStatus(
              groups, planPersonId: planPersonId, status: status)
          })
        return rollback
      },
      settle: settleFilters(teamId: slot?.teamId, positionId: slot?.positionId))
    return output != nil
  }

  /// Takes a plan person off their position (`schedule.remove`). Returns whether it saved.
  @discardableResult
  func unschedule(
    planPersonId: String, personId: String?, slot: (teamId: String, positionId: String)?
  ) async -> Bool {
    let input = ScheduleRemoveInput(
      planPersonId: planPersonId, serviceTypeId: serviceTypeId, personId: personId,
      planId: planId)
    let output = await queries.write(
      RPC.Schedule.remove, input,
      optimistic: { queries in
        var rollback = queries.mutate(
          matching: .family(.positionCandidates), as: PositionCandidates.self
        ) { _, candidates in
          candidates = ScheduleOptimism.clearSlot(
            candidates, planPersonId: planPersonId, personId: personId)
        }
        rollback.append(
          queries.mutate(
            matching: .family(.planWindowHistory), as: [PlanWindowHistoryBatch].self
          ) { _, calls in
            calls = ScheduleOptimism.removeWindowRows(calls, planPersonId: planPersonId)
          })
        rollback.append(
          queries.mutate(matching: .family(.teamPositions), as: [TeamPositionGroup].self) {
            _, groups in
            groups = ScheduleOptimism.removeFilledPerson(groups, planPersonId: planPersonId)
          })
        return rollback
      },
      settle: settleFilters(teamId: slot?.teamId, positionId: slot?.positionId))
    return output != nil
  }

  // MARK: Plan times

  /// Replaces the plan times a person is assigned to (`planPeople.updateTimes`). The lineup
  /// shows the change at once; plan times and the history built from them reload after.
  @discardableResult
  func updateTimes(planPersonId: String, personId: String, planTimeIds: [String]) async -> Bool {
    let input = PlanPeopleUpdateTimesInput(
      serviceTypeId: serviceTypeId, planId: planId, personId: personId,
      planPersonId: planPersonId, planTimeIds: planTimeIds)
    let output = await queries.write(
      RPC.PlanPeople.updateTimes, input,
      optimistic: { [teamPositionsKey] queries in
        queries.mutate(teamPositionsKey, as: [TeamPositionGroup].self) { groups in
          for groupIndex in groups.indices {
            for positionIndex in groups[groupIndex].positions.indices {
              guard var people = groups[groupIndex].positions[positionIndex].filledPeople,
                let index = people.firstIndex(where: { $0.planPersonId == planPersonId })
              else { continue }
              people[index].assignedTimeIds = planTimeIds
              groups[groupIndex].positions[positionIndex].filledPeople = people
            }
          }
        }
      },
      settle: [])
    guard output != nil else { return false }
    let planId = planId
    queries.invalidate([
      .prefix(.teamPositions, [serviceTypeId, planId]),
      .key(.planTimes(serviceTypeId: serviceTypeId, planId: planId)),
      .family(.positionCandidates) { $0.parts.contains(planId) },
      .family(.planWindowHistory),
      Self.historyDetailsFilter,
    ])
    return true
  }

  // MARK: Settling

  /// What a schedule write makes stale (`getScheduleMutationQueryFilters`): the person's
  /// scheduled plans, this plan's lineup, the slot's candidates, window histories, and
  /// candidate details that carry schedule history (blockouts do not change).
  func settleFilters(teamId: String?, positionId: String?) -> [QueryFilter] {
    var filters: [QueryFilter] = [
      .family(.myScheduledPlans),
      .prefix(.teamPositions, [serviceTypeId, planId]),
      .family(.planWindowHistory),
      Self.historyDetailsFilter,
    ]
    if let teamId, let positionId {
      filters.append(
        .key(
          .positionCandidates(
            serviceTypeId: serviceTypeId, teamId: teamId, positionId: positionId, planId: planId)))
    } else {
      filters.append(.family(.positionCandidates))
    }
    return filters
  }

  /// Candidate details that carry schedule history (the key's plan id is set).
  static let historyDetailsFilter = QueryFilter.family(.candidateDetails) { key in
    key.parts.count > 1 && key.parts[1] != nil
  }

  // MARK: Helpers

  static func adjustingNeededCount(
    _ groups: [TeamPositionGroup], slot: SlotRef, by delta: Double
  ) -> [TeamPositionGroup] {
    groups.map { group in
      guard group.teamId == slot.teamId else { return group }
      var updated = group
      updated.positions = group.positions.map { position in
        guard position.id == slot.positionId, let needed = position.neededCount else {
          return position
        }
        var changed = position
        changed.neededCount = max(0, needed + delta)
        return changed
      }
      return updated
    }
  }

  /// The message for a failed assign: the position Planning Center used for a mismatch,
  /// otherwise the server's own message.
  static func assignMessage(_ error: any Error) -> String {
    guard let apiError = error as? APIError else { return error.userFacingMessage }
    switch apiError.code {
    case .positionMismatch:
      if let data = apiError.data(as: SchedulePositionMismatchErrorData.self) {
        let selected = data.details.selected
        return
          "Created in \"\(data.details.created.teamPositionName)\" instead of \"\(selected.teamName) - \(selected.positionName)\"."
      }
      return apiError.message
    case .tooManyRequests:
      if let wait = apiError.retryAfter {
        let seconds = max(1, Int(wait.components.seconds))
        return "Planning Center is busy. Try again in \(seconds) seconds."
      }
      return "Planning Center is busy. Try again in a moment."
    default:
      return apiError.message
    }
  }

  static func isRetryable(_ error: any Error) -> Bool {
    (error as? APIError)?.isRetryable ?? false
  }
}
