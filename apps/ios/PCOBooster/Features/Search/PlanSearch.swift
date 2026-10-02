import Foundation
import PCOBoosterCore

/// Plan matching for Search, the same rule as the Services agenda's search field
/// ("Search plans, series, or dates", `visibleRows` in
/// apps/web/src/hooks/use-service-plan-selection.ts): the trimmed, lowercased query must
/// appear in the service type name, plan title, series title, and plan date
/// ("Sun, Oct 4, 2026", in the org zone) joined with spaces.
enum PlanSearch {
  /// Whether `row` matches `query` (an empty query matches everything).
  static func matches(_ row: ServicePlanRow, query: String, timeZone: String) -> Bool {
    let needle = normalized(query)
    guard !needle.isEmpty else { return true }
    let haystack = [
      row.serviceTypeName,
      row.planTitle,
      row.seriesTitle ?? "",
      formatPlanDate(row.sortDate, timeZone: timeZone),
    ]
    .joined(separator: " ")
    .lowercased()
    return haystack.contains(needle)
  }

  static func normalized(_ query: String) -> String {
    query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  /// Search order: plans from today on (soonest first), then earlier plans (latest first), by
  /// org calendar day. `rows` arrive in agenda order (`servicePlanRows`).
  static func ordered(_ rows: [ServicePlanRow], now: Date, timeZone: String) -> [PlanHit] {
    let today = OrgCalendar.dayKey(now, timeZone: timeZone)
    var upcoming: [PlanHit] = []
    var past: [PlanHit] = []
    for row in rows {
      if OrgCalendar.dayKey(row.sortDate, timeZone: timeZone) >= today {
        upcoming.append(PlanHit(row: row, isUpcoming: true))
      } else {
        past.append(PlanHit(row: row, isUpcoming: false))
      }
    }
    return upcoming + past.reversed()
  }
}

/// A plan in search results or suggestions.
struct PlanHit: Hashable, Identifiable {
  var row: ServicePlanRow
  /// On or after today in the org zone.
  var isUpcoming: Bool

  var id: String { row.planId }

  var route: PlanRoute {
    PlanRoute(serviceTypeId: row.serviceTypeId, planId: row.planId, view: .overview)
  }
}
