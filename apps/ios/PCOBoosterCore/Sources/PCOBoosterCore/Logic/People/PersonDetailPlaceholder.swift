import Foundation

// Port of apps/web/src/lib/people-dashboard-person-placeholder.ts, plus the pure parts of
// apps/web/src/hooks/use-people-dashboard-person.ts (the placeholder chain and the person
// page's dashboard context). `cachedPersonDetail` is pinned by the
// `people.placeholder.cachedPersonDetail` parity suite.

/// A person detail built from the dashboard's own activity for them, when a dashboard covers
/// `month` ("YYYY-MM"; nil accepts the dashboard's month), so the person page has something
/// to show before `people.dashboardPerson` answers. Its request budget is all zeros
/// (`getCachedPeopleDashboardPersonDetail`).
public func cachedPersonDetail(
  from dashboards: [PeopleDashboardData], personId: String, month: String?
) -> PeopleDashboardPersonDetail? {
  for dashboard in dashboards {
    if let month, month != peopleDashboardMonthKey(dashboard.month) {
      continue
    }
    guard let person = dashboard.members.first(where: { $0.id == personId }) else {
      continue
    }
    return PeopleDashboardPersonDetail(
      generatedAt: dashboard.generatedAt,
      month: dashboard.month,
      previousMonth: shiftedMonthKey(dashboard.month, by: -1),
      nextMonth: shiftedMonthKey(dashboard.month, by: 1),
      person: person,
      requestBudget: PeopleDashboardPersonDetailRequestBudget(
        limit: 0, planningCenterRequests: 0, unresolvedRehearsalTimes: 0)
    )
  }
  return nil
}

/// What the person page shows while `people.dashboardPerson` loads: the dashboard's detail
/// for the requested month, else the detail already on screen when it is the same person (so
/// paging months never blanks the page), else the dashboard's detail for its own month
/// (the web's `placeholderData` in `usePeopleDashboardPerson`).
public func personDetailPlaceholder(
  from dashboards: [PeopleDashboardData], personId: String, month: String?,
  previous: PeopleDashboardPersonDetail?
) -> PeopleDashboardPersonDetail? {
  if let cached = cachedPersonDetail(from: dashboards, personId: personId, month: month) {
    return cached
  }
  if let previous, previous.person.id == personId {
    return previous
  }
  return cachedPersonDetail(from: dashboards, personId: personId, month: nil)
}

/// What the dashboard already knows about a person, so the person page shows the same teams
/// and judges the same heavy load.
public struct PersonDashboardContext: Hashable, Sendable {
  /// The person as the dashboard roster lists them, with their team memberships.
  public var rosterPerson: PeopleDashboardRosterPerson?
  /// Their teams' pace, the same the dashboard judges a heavy load against.
  public var teamPace: Double?

  public init(rosterPerson: PeopleDashboardRosterPerson?, teamPace: Double?) {
    self.rosterPerson = rosterPerson
    self.teamPace = teamPace
  }
}

/// The person page's context from a dashboard (usually `assemblePeopleDashboardFromCache`);
/// empty without one (`usePersonDashboardContext`).
public func personDashboardContext(
  _ dashboard: PeopleDashboardData?, personId: String
) -> PersonDashboardContext {
  guard let dashboard else {
    return PersonDashboardContext(rosterPerson: nil, teamPace: nil)
  }
  return PersonDashboardContext(
    rosterPerson: dashboard.scopeRows.first { $0.person.id == personId }?.person,
    teamPace: TeamHealthEngine.computeMemberPaces(dashboard.members, teams: dashboard.teams)[
      personId]
  )
}

/// "2026-05" for a dashboard month, written from its fields as they are (no rollover), the
/// key `people.dashboardPerson` takes as `month`.
public func peopleDashboardMonthKey(_ month: PeopleDashboardMonth) -> String {
  "\(PeopleText.number(month.year))-\(padded(PeopleText.number(month.monthIndex + 1)))"
}

/// The month `delta` months from `month`, through `Date.UTC`'s rollover.
private func shiftedMonthKey(_ month: PeopleDashboardMonth, by delta: Int) -> String {
  let limit = 100_000_000.0
  guard month.year.isFinite, month.monthIndex.isFinite, abs(month.year) <= limit,
    abs(month.monthIndex) <= limit
  else {
    return "NaN-NaN"
  }
  let time = OrgCalendar.utcTime(
    year: Int(month.year), monthIndex: Int(month.monthIndex) + delta, day: 1, hour: 12)
  let civil = OrgCalendar.civilDate(
    fromDays: JSParity.floorDivide(time, OrgCalendar.millisecondsPerDay))
  return "\(civil.year)-\(JSParity.zeroPadded(civil.month, width: 2))"
}

/// `text.padStart(2, "0")`.
private func padded(_ text: String) -> String {
  String(repeating: "0", count: max(0, 2 - text.utf16.count)) + text
}
