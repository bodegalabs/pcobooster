import Foundation
import Observation
import PCOBoosterCore

/// The Overview's reads (team positions, plan items, and plan times, shared through the cache
/// with Lineup, Plan, and Times) and the summaries the cards draw from them, all from the
/// `Logic/Plans` ports of apps/web/src/lib/plan-overview.ts.
@MainActor
@Observable
final class PlanOverviewModel {
  let teamPositions: QueryState<[TeamPositionGroup]>
  let planItems: QueryState<[PlanItem]>
  let planTimes: QueryState<[PlanTime]>
  /// Set when the notifications check handed off to Planning Center; coming back rereads the
  /// roster so sent emails show (`useRecheckRosterOnReturn`).
  private(set) var isRosterRecheckArmed = false

  @ObservationIgnored private let queries: QueryClient

  init(queries: QueryClient, context: PlanContext) {
    self.queries = queries
    let serviceTypeId = context.serviceTypeId
    let planId = context.planId
    teamPositions = queries.query(
      .teamPositions(serviceTypeId: serviceTypeId, planId: planId), RPC.Catalog.teamPositions,
      TeamPositionsInput(
        serviceTypeId: serviceTypeId, planId: planId, seriesId: context.header?.seriesId))
    planItems = queries.query(
      .planItems(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanItems.list,
      PlanItemsListInput(serviceTypeId: serviceTypeId, planId: planId))
    planTimes = queries.query(
      .planTimes(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanTimes.list,
      PlanTimesListInput(serviceTypeId: serviceTypeId, planId: planId))
  }

  var staffing: PlanStaffing? { teamPositions.value.map(summarizeStaffing) }
  var order: PlanOrder? { planItems.value.map(summarizeOrder) }
  var schedule: PlanSchedule? { planTimes.value.map(summarizeTimes) }

  var checks: [ReadinessCheck] {
    buildReadinessChecks(staffing: staffing, order: order, schedule: schedule)
  }

  /// A part has neither loaded nor failed yet.
  var isLoading: Bool {
    isPending(teamPositions) || isPending(planItems) || isPending(planTimes)
  }

  /// A part failed, so the checklist may be missing checks.
  var isIncomplete: Bool {
    teamPositions.error != nil || planItems.error != nil || planTimes.error != nil
  }

  func refresh() async {
    async let positions: Void = teamPositions.refresh()
    async let items: Void = planItems.refresh()
    async let times: Void = planTimes.refresh()
    _ = await (positions, items, times)
  }

  func armRosterRecheck() {
    isRosterRecheckArmed = true
  }

  /// Back from Planning Center: reread who has been notified.
  func recheckRosterIfArmed() {
    guard isRosterRecheckArmed else { return }
    isRosterRecheckArmed = false
    queries.invalidate(teamPositions.key)
  }

  private func isPending<Value>(_ state: QueryState<Value>) -> Bool {
    state.value == nil && state.error == nil
  }
}
