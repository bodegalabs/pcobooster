import Foundation

// Port of packages/planning-center-models/src/plan-window-history.ts. Pinned by the
// `scheduling.expandPlanWindowHistory` parity suite in scripts/parity/scheduling.parity.ts.

/// Every person's history from the plan window's calls, in window order: the history items
/// each roster row stands for, and the selected plan's rows kept for slot matching
/// (`expandPlanWindowHistory`).
///
/// Window history travels as roster rows plus the plans and plan times they point at, since
/// repeating each plan's title, service type, and times on every item would be about four
/// times the bytes. The first call that lists a plan names it; the last that lists a plan
/// time wins.
///
/// The plan, plan time, and roster dates are ISO strings read the way `new Date` reads them
/// (see `JSDate.parse`). Where the TypeScript would carry an invalid date forward, the port
/// falls back as it would for a missing one (a plan time to the plan's date, the plan's date
/// to the row's `createdAt`), and a row with no readable date at all is left out.
public func expandPlanWindowHistory(
  _ calls: [PlanWindowHistoryBatch], selectedPlanId: String
) -> [String: CandidateHistory] {
  var planById: [String: WindowPlanSummary] = [:]
  var planTimeById: [String: WindowPlanTime] = [:]
  var rowsByPersonId: [String: [WindowRosterRow]] = [:]
  for call in calls {
    for plan in call.plans where planById[plan.id] == nil {
      planById[plan.id] = plan
    }
    for planTime in call.planTimes {
      planTimeById[planTime.id] = planTime
    }
    for person in call.people {
      rowsByPersonId[person.personId, default: []].append(contentsOf: person.rows)
    }
  }
  return rowsByPersonId.mapValues { rows in
    CandidateHistory(
      serviceHistory: rows.flatMap { row in
        WindowRowHistory(
          row,
          plan: JSString.isNonEmpty(row.planId) ? row.planId.flatMap { planById[$0] } : nil,
          planTimeById: planTimeById
        ).items
      },
      selectedPlanAssignments: rows.compactMap { row in
        JSString.equal(row.planId, selectedPlanId) ? selectedPlanAssignment(row) : nil
      })
  }
}

private func selectedPlanAssignment(_ row: WindowRosterRow) -> SelectedPlanAssignment {
  SelectedPlanAssignment(
    source: .planPerson,
    id: row.id,
    planId: row.planId,
    teamId: row.teamId,
    teamName: nil,
    teamPositionName: row.teamPositionName,
    status: row.status,
    planPersonId: nil,
    declineReason: row.declineReason)
}

/// History items for one roster row: one per assigned service or rehearsal time, or a single
/// service item on the plan's date when the row has no usable times. Declined rows have none.
private struct WindowRowHistory {
  private(set) var items: [ServiceHistoryItem] = []

  init(_ row: WindowRosterRow, plan: WindowPlanSummary?, planTimeById: [String: WindowPlanTime]) {
    guard !isDeclinedAssignmentStatus(row.status),
      let fallbackDate = Self.fallbackDate(row, plan: plan)
    else {
      return
    }
    let parts = JSString.split(row.teamPositionName, separator: " - ")
    let teamName = parts.count > 1 ? parts.first : nil
    let positionName =
      parts.count > 1 ? parts.dropFirst().joined(separator: " - ") : (parts.first ?? "")

    func item(_ id: String, _ date: Date, _ timeType: ServiceHistoryItemTimeType?)
      -> ServiceHistoryItem
    {
      ServiceHistoryItem(
        id: id,
        sourceScheduleId: row.id,
        planId: row.planId,
        date: date,
        teamPositionName: positionName,
        teamName: teamName,
        serviceTypeName: plan?.serviceTypeName,
        planTitle: plan?.title,
        status: row.status,
        timeType: timeType)
    }
    func date(of planTimeId: String) -> Date {
      let startsAt = planTimeById[planTimeId]?.startsAt
      guard JSString.isNonEmpty(startsAt), let date = startsAt.flatMap(JSDate.parse) else {
        return fallbackDate
      }
      return date
    }

    let timeIds = JSString.uniqued(row.timeIds)
    let serviceTimeIds = JSString.uniqued(row.serviceTimeIds)
    let fallback = item(row.id, fallbackDate, .service)
    if timeIds.isEmpty, serviceTimeIds.isEmpty {
      items = [fallback]
      return
    }
    let serviceKeys = Set(serviceTimeIds.map(JSString.key))
    let serviceItems = serviceTimeIds.map { planTimeId in
      item("\(row.id):\(planTimeId)", date(of: planTimeId), .service)
    }
    let rehearsalItems = timeIds.compactMap { planTimeId -> ServiceHistoryItem? in
      guard !serviceKeys.contains(JSString.key(planTimeId)) else { return nil }
      let timeType = Self.assignedTimeType(planTimeById[planTimeId]?.timeType)
      return timeType == .other
        ? nil : item("\(row.id):\(planTimeId)", date(of: planTimeId), timeType)
    }
    let kept = serviceItems + rehearsalItems
    items = kept.isEmpty ? [fallback] : kept
  }

  /// The plan's date, or the row's `createdAt` when the plan has none.
  private static func fallbackDate(_ row: WindowRosterRow, plan: WindowPlanSummary?) -> Date? {
    if JSString.isNonEmpty(plan?.sortDate), let date = plan?.sortDate.flatMap(JSDate.parse) {
      return date
    }
    return JSDate.parse(row.createdAt)
  }

  /// Assigned times that are not service times count as rehearsals unless typed otherwise.
  private static func assignedTimeType(_ rawType: String?) -> ServiceHistoryItemTimeType {
    if JSString.equal(rawType, "other") {
      return .other
    }
    if JSString.equal(rawType, "service") {
      return .service
    }
    return .rehearsal
  }
}
