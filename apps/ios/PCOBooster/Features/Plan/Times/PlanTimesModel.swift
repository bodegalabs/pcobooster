import Foundation
import Observation
import PCOBoosterCore

/// The Times segment's reads and writes: the plan's times (`planTimes.list`) and its team
/// positions (`catalog.teamPositions`, shared through the cache with Lineup and Overview), plus
/// optimistic save, add, and delete that roll back on failure and settle with a refetch, as the
/// web's `useTimesTabController` does (the web saves pessimistically; here every write lands
/// on screen at once).
@MainActor
@Observable
final class PlanTimesModel {
  let serviceTypeId: String
  let planId: String
  let times: QueryState<[PlanTime]>
  let positions: QueryState<[TeamPositionGroup]>

  /// Bumps when a write the person made lands, for the success haptic.
  private(set) var landedWrites = 0

  @ObservationIgnored private let queries: QueryClient

  init(queries: QueryClient, context: PlanContext) {
    self.queries = queries
    serviceTypeId = context.serviceTypeId
    planId = context.planId
    times = queries.query(
      .planTimes(serviceTypeId: context.serviceTypeId, planId: context.planId),
      RPC.PlanTimes.list,
      PlanTimesListInput(serviceTypeId: context.serviceTypeId, planId: context.planId))
    positions = queries.query(
      .teamPositions(serviceTypeId: context.serviceTypeId, planId: context.planId),
      RPC.Catalog.teamPositions,
      TeamPositionsInput(
        serviceTypeId: context.serviceTypeId, planId: context.planId,
        seriesId: context.header?.seriesId))
  }

  // MARK: Reads

  /// The plan's times by start, including optimistic changes.
  var planTimes: [PlanTime] { times.value ?? [] }

  /// The team positions, or nil until they load.
  var groups: [TeamPositionGroup]? { positions.value }

  /// Assignments wait for team positions (the web disables its selector while they load).
  var assignmentsLoading: Bool { groups == nil && positions.errorMessage == nil }

  func time(id: String) -> PlanTime? {
    planTimes.first { $0.id == id }
  }

  /// The times grouped by the organization calendar day they start on.
  func days(timeZone: String, now: Date) -> [PlanTimeDay] {
    var order: [String] = []
    var byDay: [String: [PlanTime]] = [:]
    for time in planTimes {
      let key = OrgCalendar.dayKey(time.startsAt, timeZone: timeZone)
      if byDay[key] == nil {
        order.append(key)
      }
      byDay[key, default: []].append(time)
    }
    return order.compactMap { key in
      guard let times = byDay[key], let first = times.first else { return nil }
      return PlanTimeDay(
        dayKey: key,
        label: OrgCalendar.label(first.startsAt, timeZone: timeZone, style: .weekdayMonthDay),
        relative: formatPlanRelativeDay(first.startsAt, now: now, timeZone: timeZone),
        times: times)
    }
  }

  /// Pull to refresh: both reads at once.
  func refresh() async {
    let positionsRefresh = Task { await positions.refresh() }
    await times.refresh()
    await positionsRefresh.value
  }

  // MARK: Writes

  private var timesKey: QueryKey { times.key }
  private var positionsKey: QueryKey { positions.key }

  /// What a time write makes stale (web `invalidateRelatedPlanTimeQueries` plus the times
  /// themselves): the plan list for the service type, the team positions, and candidate
  /// history (window rosters and details that carry schedule history).
  private var settle: [QueryFilter] {
    [
      .key(timesKey),
      .key(positionsKey),
      .key(.plans(serviceTypeId: serviceTypeId)),
      .family(.planWindowHistory),
      .family(.candidateDetails) { key in key.parts.count > 1 && key.parts[1] != nil },
    ]
  }

  /// Saves `edit` over `planTime` when it changed and is valid (`persistPlanTime`). The list and
  /// the lineup show the result at once; a failure rolls both back and comes back for the view
  /// to toast (with a way back into the form).
  func save(_ planTime: PlanTime, edit: EditablePlanTime, timeZone: String) async
    -> PlanTimeWriteOutcome
  {
    let groups = groups
    guard planTimeEditHasChanges(planTime, edit, timeZone: timeZone, groups: groups),
      isValidPlanTimeEdit(edit, timeZone: timeZone),
      let patch = buildPlanTimePatch(
        planTime, edit, timeZone: timeZone, groups: groups, serviceTypeId: serviceTypeId,
        planId: planId)
    else { return .skipped }
    return await run(
      RPC.PlanTimes.update, patch,
      optimistic: { [timesKey, positionsKey] queries in
        let updated = PlanTimeOptimism.applying(patch, to: planTime)
        return queries.mutate(timesKey, as: [PlanTime].self) {
          $0 = PlanTimeOptimism.replacing(updated, in: $0)
        }
          + queries.mutate(positionsKey, as: [TeamPositionGroup].self) {
            $0 = PlanTimeOptimism.applyingAssignments(
              $0, timeId: planTime.id, isService: updated.timeType == .service,
              assignedNeeded: patch.assignedNeededPositionIds ?? [],
              clearedNeeded: patch.clearedNeededPositionIds ?? [],
              assignedPeople: patch.assignedPlanPersonIds ?? [],
              clearedPeople: patch.clearedPlanPersonIds ?? [])
          }
      })
  }

  /// Adds the time `edit` describes (`createPlanTimeFromEdit`). It shows at once as a pending row;
  /// the server's time replaces it. `planTimes.create` takes only team and position assignments,
  /// so needed slots and people chosen in the add sheet follow in one update once the time
  /// exists.
  func create(_ edit: EditablePlanTime, timeZone: String) async -> PlanTimeWriteOutcome {
    guard isValidPlanTimeEdit(edit, timeZone: timeZone),
      let request = buildCreatePlanTimeRequest(
        edit, timeZone: timeZone, serviceTypeId: serviceTypeId, planId: planId)
    else { return .skipped }
    let pendingId = TimeFacts.pendingIdPrefix + UUID().uuidString
    let created: PlanTime
    do {
      created = try await queries.perform(
        RPC.PlanTimes.create, request,
        optimistic: { [timesKey] queries in
          guard let pending = PlanTimeOptimism.pendingTime(request, id: pendingId) else {
            return QueryRollback()
          }
          return queries.mutate(timesKey, as: [PlanTime].self) {
            $0 = PlanTimeOptimism.inserting(pending, into: $0)
          }
        },
        settle: settle)
    } catch {
      return .failed(error)
    }
    _ = queries.mutate(timesKey, as: [PlanTime].self) {
      $0 = PlanTimeOptimism.reconciling(pendingId: pendingId, with: created, in: $0)
    }
    landedWrites += 1
    await assignAfterCreate(created, edit: edit)
    return .landed
  }

  /// The needed slots and people an add chose, applied to the new time.
  private func assignAfterCreate(_ created: PlanTime, edit: EditablePlanTime) async {
    let needed = edit.assignedNeededPositionIds
    let people = edit.assignedPlanPersonIds
    guard !needed.isEmpty || !people.isEmpty else { return }
    let input = PlanTimesUpdateInput(
      serviceTypeId: serviceTypeId, planId: planId, planTimeId: created.id,
      assignedNeededPositionIds: needed, assignedPlanPersonIds: people)
    await queries.write(
      RPC.PlanTimes.update, input,
      optimistic: { [positionsKey] queries in
        queries.mutate(positionsKey, as: [TeamPositionGroup].self) {
          $0 = PlanTimeOptimism.applyingAssignments(
            $0, timeId: created.id, isService: created.timeType == .service,
            assignedNeeded: needed, clearedNeeded: [], assignedPeople: people, clearedPeople: [])
        }
      },
      settle: settle)
  }

  /// Deletes `planTime` (`removePlanTime`): gone from the list and from everyone's times at once,
  /// restored if Planning Center refuses.
  func delete(_ planTime: PlanTime) async -> PlanTimeWriteOutcome {
    guard !TimeFacts.isPending(planTime) else { return .skipped }
    return await run(
      RPC.PlanTimes.delete,
      PlanTimesDeleteInput(serviceTypeId: serviceTypeId, planId: planId, planTimeId: planTime.id),
      optimistic: { [timesKey, positionsKey] queries in
        queries.mutate(timesKey, as: [PlanTime].self) { $0.removeAll { $0.id == planTime.id } }
          + queries.mutate(positionsKey, as: [TeamPositionGroup].self) {
            $0 = PlanTimeOptimism.removingTime(planTime.id, from: $0)
          }
      })
  }

  /// Runs one write with the shared settle list, counting it when it lands.
  private func run<Input, Output>(
    _ procedure: Procedure<Input, Output>, _ input: Input,
    optimistic: (QueryClient) -> QueryRollback
  ) async -> PlanTimeWriteOutcome {
    do {
      _ = try await queries.perform(procedure, input, optimistic: optimistic, settle: settle)
      landedWrites += 1
      return .landed
    } catch {
      return .failed(error)
    }
  }
}

/// How a time write ended, so the view can toast a failure with a way back in.
enum PlanTimeWriteOutcome {
  /// Planning Center saved it.
  case landed
  /// Nothing to send (no change, or an invalid form).
  case skipped
  /// Rolled back; `error` says why.
  case failed(any Error)

  /// The failure worth telling the person about: not a cancellation, and not an expired session
  /// (the session handles that one).
  var reportableError: (any Error)? {
    guard case .failed(let error) = self, !error.isCancellation else { return nil }
    if let apiError = error as? APIError, apiError.isUnauthorized {
      return nil
    }
    return error
  }
}

/// One organization calendar day of plan times.
struct PlanTimeDay: Identifiable {
  let dayKey: String
  /// "Sun, Oct 4"
  let label: String
  /// "Today", "Tomorrow", "In 3 days", or nil.
  let relative: String?
  let times: [PlanTime]

  var id: String { dayKey }
}
