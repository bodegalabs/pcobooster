import Foundation

/// Logic and copy from the web's People components (apps/web/src/components/people/*.tsx and
/// apps/web/src/hooks/use-people-dashboard.ts). These helpers are private to their components
/// in the TypeScript, so no parity suite can call them; `PeopleScreensTests` pins each one to
/// the component's behavior instead. Everything they build on (scopes, signals, coverage,
/// markers) is parity-pinned.
public enum PeopleScreens {
  /// " · ", the separator the People screens put between facts.
  public static let separator = " \u{00B7} "

  /// "1 person" or "3 people".
  public static func peopleCount(_ count: Int) -> String {
    PeopleText.peopleCount(count)
  }

  /// "38%" for a 0 to 1 share (`Math.round(value * 100)`).
  public static func percent(_ value: Double) -> String {
    "\(PeopleText.number(JSParity.round(value * 100)))%"
  }

  // MARK: Scope picker (people-page.tsx)

  /// Services groups same-named teams by service type when one is set: "Band · Sunday".
  public static func teamLabel(_ team: PeopleDashboardTeam) -> String {
    guard let serviceTypeName = team.serviceTypeName else {
      return team.name
    }
    return team.name + separator + serviceTypeName
  }

  /// The heading for a scope: "All teams", the one team's label, or "Teams you lead".
  public static func describeScope(
    _ scope: PeopleDashboardScope, teams: [PeopleDashboardTeam], ledTeamIds: [String]
  ) -> String {
    guard let teamIds = scopeTeamIds(scope, ledTeamIds: ledTeamIds) else {
      return "All teams"
    }
    if teamIds.count == 1, let only = teams.first(where: { $0.id == teamIds[0] }) {
      return teamLabel(only)
    }
    return "Teams you lead"
  }

  /// Teams under one service type in the scope picker.
  public struct TeamGroup: Hashable, Sendable, Identifiable {
    /// The service type's name, or "Other teams" for teams without one.
    public var serviceType: String
    /// In roster order.
    public var teams: [PeopleDashboardTeam]

    public var id: String { serviceType }

    public init(serviceType: String, teams: [PeopleDashboardTeam]) {
      self.serviceType = serviceType
      self.teams = teams
    }
  }

  /// The group for teams without a service type, always last.
  public static let otherTeamsGroup = "Other teams"

  /// Teams grouped by service type, groups by name with "Other teams" last, teams in roster
  /// order within each group (`groupTeams`).
  public static func groupTeams(_ teams: [PeopleDashboardTeam]) -> [TeamGroup] {
    var groups: [TeamGroup] = []
    var indexByKey: [String: Int] = [:]
    for team in teams {
      let key = team.serviceTypeName ?? otherTeamsGroup
      if let index = indexByKey[key] {
        groups[index].teams.append(team)
      } else {
        indexByKey[key] = groups.count
        groups.append(TeamGroup(serviceType: key, teams: [team]))
      }
    }
    return PeopleText.stableSorted(groups) { a, b in
      if a.serviceType == otherTeamsGroup || b.serviceType == otherTeamsGroup {
        return a.serviceType == otherTeamsGroup ? 1 : -1
      }
      return PeopleText.localeCompare(a.serviceType, b.serviceType)
    }
  }

  /// The day of the month of the org day key `todayKey` when it falls in the dashboard's
  /// month; nil otherwise.
  public static func todayInMonth(todayKey: String, month: PeopleDashboardMonth) -> Int? {
    let monthKey = peopleDashboardMonthKey(month)
    guard todayKey.utf16.starts(with: monthKey.utf16),
      let rest = String(todayKey.utf16.dropFirst(8))
    else {
      return nil
    }
    // `Number(todayKey.slice(8))`, for the digits a day key has.
    let dayText = JSParity.trim(rest)
    return dayText.isEmpty ? 0 : Int(dayText)
  }

  // MARK: Progress and coverage (dashboard-progress.tsx, health-view.tsx)

  /// "Based on the first 48 of 230 people" with a closing period unless a "Load more" link
  /// follows; nil once health covers everyone (`CoverageNote`).
  public static func coverageNote(
    _ coverage: PeopleDashboardCoverage, isLoading: Bool, canLoadMore: Bool
  ) -> String? {
    describeCoverage(coverage, isLoading: isLoading).map { canLoadMore ? $0 : $0 + "." }
  }

  /// The activity loading line above the content.
  public enum Progress: Hashable, Sendable {
    /// Some activity batches failed; the line offers a retry.
    case failed
    /// "Loading schedules · 16 of 48 people", or "Loading schedules" past the sample.
    case loading(String)

    /// What the line says.
    public var text: String {
      switch self {
      case .failed: "Some schedules failed to load."
      case .loading(let text): text
      }
    }
  }

  /// What the loading line says; nil when nothing is loading or failed
  /// (`PeopleDashboardProgress`).
  public static func progress(
    coverage: PeopleDashboardCoverage?, isLoadingActivity: Bool, failedBatchCount: Int
  ) -> Progress? {
    guard let coverage, isLoadingActivity || failedBatchCount > 0 else {
      return nil
    }
    if failedBatchCount > 0 {
      return .failed
    }
    guard coverage.loadedPeopleCount < coverage.samplePeopleCount else {
      return .loading("Loading schedules")
    }
    return .loading(
      "Loading schedules\(separator)\(coverage.loadedPeopleCount) of \(peopleCount(coverage.samplePeopleCount))"
    )
  }

  /// Whether a health list's people have loaded: none yet, some, or all.
  public enum ListProgress: String, CaseIterable, Sendable {
    case loading
    case partial
    case complete
  }

  /// The attention lists show placeholders until someone loads, then "No one so far." while
  /// the sample is still loading.
  public static func listProgress(
    isRosterLoading: Bool, coverage: PeopleDashboardCoverage?, isLoadingSample: Bool
  ) -> ListProgress {
    let loadedNobody = (coverage?.loadedPeopleCount ?? 0) == 0
    if isRosterLoading || (loadedNobody && isLoadingSample) {
      return .loading
    }
    return isLoadingSample ? .partial : .complete
  }

  /// "1 match" or "12 matches, 4 not loaded yet" under search results; nil without matches.
  public static func searchFooter(matchCount: Int, unrequestedMatchCount: Int) -> String? {
    guard matchCount > 0 else {
      return nil
    }
    let matches = matchCount == 1 ? "1 match" : "\(matchCount) matches"
    return unrequestedMatchCount > 0
      ? "\(matches), \(unrequestedMatchCount) not loaded yet" : matches
  }

  /// "The first 48 of 230 people, by last name" under a sampled roster; nil when the sample
  /// is the whole scope.
  public static func sampleFooter(_ coverage: PeopleDashboardCoverage?) -> String? {
    guard let coverage, coverage.samplePeopleCount < coverage.scopePeopleCount else {
      return nil
    }
    return
      "The first \(coverage.samplePeopleCount) of \(peopleCount(coverage.scopePeopleCount)), by last name"
  }

  // MARK: Health summary (team-health-summary.tsx)

  /// The summary's verdict: "4 of 5 people served in the last 90 days, but the busiest 1
  /// person covered 75% of serving days."
  public static func describeHealth(_ health: TeamHealth) -> String {
    func people(_ count: Int) -> String { count == 1 ? "person" : "people" }
    let served =
      "\(health.activeCount) of \(health.memberCount) \(people(health.memberCount)) served in the last 90 days"
    switch health.status {
    case .thin:
      return "Only \(served). Consider who could step back in."
    case .stretched:
      if let topShare = health.topShare {
        return
          "\(served), but the busiest \(health.topCount) \(people(health.topCount)) covered \(percent(topShare)) of serving days."
      }
    case .steady:
      return "\(served), and serving is spread across the team."
    case nil:
      break
    }
    return "\(served)."
  }

  /// Declined requests as a share of requests in 180 days; nil without requests.
  public static func declineShare(_ health: TeamHealth) -> Double? {
    health.requests == 0 ? nil : health.declined / health.requests
  }

  // MARK: Attention lists (team-attention.tsx, person-signal.tsx)

  /// How a signal looks: its kind, with due split by whether they served at all.
  public enum SignalLook: String, CaseIterable, Sendable {
    case waiting
    case declining
    case drifting
    case overloaded
    case due
    case notServing = "not-serving"
  }

  public static func signalLook(_ signal: PersonSignal) -> SignalLook {
    switch signal {
    case .waiting: .waiting
    case .checkIn(.declining): .declining
    case .checkIn(.drifting): .drifting
    case .checkIn(.overloaded): .overloaded
    case .due(let due): due.daysSinceServed == nil ? .notServing : .due
    }
  }

  /// A person's roles, or their teams when they have no roles yet.
  public static func rolesOrTeams(_ member: PeopleDashboardPerson) -> String {
    (member.roles.isEmpty ? member.teams : member.roles).joined(separator: ", ")
  }

  /// "Sun, Sep 27 +2": the soonest unanswered request and how many more follow.
  public static func waitingAside(_ entry: WaitingOnReply) -> String {
    let later = entry.pending > 1 ? " +\(PeopleText.number(entry.pending - 1))" : ""
    return TeamHealthText.formatWeekdayDayKey(entry.nextPendingOn) + later
  }

  /// Every reason's sentence, in order.
  public static func checkInDetail(_ checkIn: CheckIn) -> String {
    checkIn.reasons.map { TeamHealthEngine.describe(.checkIn($0)).detail }.joined(separator: " ")
  }

  // MARK: Roster (team-roster.tsx)

  /// Roster columns that sort.
  public enum RosterSort: String, CaseIterable, Sendable {
    case name
    case lastServed
    case served90

    /// The column heading.
    public var label: String {
      switch self {
      case .name: "Person"
      case .lastServed: "Last served"
      case .served90: "90 days"
      }
    }

    /// Names A to Z in roster order (by last name); longest since serving first; busiest
    /// first.
    public var isAscending: Bool {
      self != .served90
    }
  }

  /// Rows in a roster column's order. People still loading keep roster order below everyone
  /// loaded; ties keep roster order.
  public static func sortRosterRows(_ rows: [PeopleDashboardRow], by sort: RosterSort)
    -> [PeopleDashboardRow]
  {
    guard sort != .name else {
      return rows
    }
    return PeopleText.stableSorted(rows) { a, b in
      guard let aMember = a.member, let bMember = b.member else {
        if (a.member == nil) != (b.member == nil) {
          return a.member == nil ? 1 : -1
        }
        return 0
      }
      switch sort {
      case .served90:
        let order = bMember.rhythm.servedDays90 - aMember.rhythm.servedDays90
        return order < 0 ? -1 : (order > 0 ? 1 : 0)
      case .lastServed, .name:
        // People who have not served sort first, then the longest since serving.
        return PeopleText.localeCompare(
          aMember.rhythm.lastServedOn ?? "", bMember.rhythm.lastServedOn ?? "")
      }
    }
  }

  /// The most 90-day serving days in the rows, the scale of their serving bars.
  public static func maxServedDays(_ rows: [PeopleDashboardRow]) -> Double {
    rows.reduce(0) { most, row in max(most, row.member?.rhythm.servedDays90 ?? 0) }
  }

  /// "Band, Vocals · Keys": a person's teams, then their roles once loaded.
  public static func describeRoles(
    person: PeopleDashboardRosterPerson, member: PeopleDashboardPerson?
  ) -> String {
    let teams = person.teams.joined(separator: ", ")
    guard let member, !member.roles.isEmpty else {
      return teams
    }
    let roles = member.roles.joined(separator: ", ")
    return teams.isEmpty ? roles : teams + separator + roles
  }

  /// "2 declined · 1 pending", or "-" with neither.
  public static func responsesLabel(_ member: PeopleDashboardPerson) -> String {
    var parts: [String] = []
    if member.rhythm.declined180 > 0 {
      parts.append("\(PeopleText.number(member.rhythm.declined180)) declined")
    }
    if member.rhythm.pendingUpcoming > 0 {
      parts.append("\(PeopleText.number(member.rhythm.pendingUpcoming)) pending")
    }
    return parts.isEmpty ? "-" : parts.joined(separator: separator)
  }

  /// A person's roster badges: their signals that `TeamHealthEngine.isRosterSignal` keeps.
  public static func rosterSignals(
    _ signalsById: [String: [PersonSignal]], personId: String
  ) -> [PersonSignal] {
    (signalsById[personId] ?? []).filter(TeamHealthEngine.isRosterSignal)
  }

  // MARK: Month (month-view.tsx, detail-body.tsx, shared-components.tsx)

  /// "5 serving · 2 pending · 3 at rehearsal" for a day, or "No one is scheduled."
  public static func describeDay(_ day: PeopleDashboardDay?) -> String {
    guard let day, day.serviceCount != 0 || day.rehearsalCount != 0 else {
      return "No one is scheduled."
    }
    var parts: [String] = []
    if day.serviceCount > 0 {
      parts.append("\(day.serviceCount) serving")
    }
    if day.pendingServiceCount > 0 {
      parts.append("\(day.pendingServiceCount) pending")
    }
    if day.rehearsalCount > 0 {
      parts.append("\(day.rehearsalCount) at rehearsal")
    }
    return parts.joined(separator: separator)
  }

  /// A person scheduled on a day, with the commitment the day shows for them.
  public struct DayPerson: Hashable, Sendable, Identifiable {
    public var person: PeopleDashboardPerson
    public var marker: PeopleDashboardMonthDay

    public var id: String { person.id }

    public init(person: PeopleDashboardPerson, marker: PeopleDashboardMonthDay) {
      self.person = person
      self.marker = marker
    }
  }

  /// Everyone scheduled on a day, services before rehearsals, otherwise in the people's order.
  public static func dayPeople(_ people: [PeopleDashboardPerson], day: Int) -> [DayPerson] {
    let dayValue = Double(day)
    let scheduled = people.compactMap { person -> DayPerson? in
      DashboardCalendar.pickMarker(person.monthDays.filter { $0.day == dayValue })
        .map { DayPerson(person: person, marker: $0) }
    }
    return PeopleText.stableSorted(scheduled) { a, b in
      (a.marker.kind == .rehearsal ? 1 : 0) - (b.marker.kind == .rehearsal ? 1 : 0)
    }
  }

  /// "Keys", "Rehearsal · Keys", or "Scheduled" without a position.
  public static func dayPersonDetail(_ marker: PeopleDashboardMonthDay) -> String {
    let position = marker.positionName ?? "Scheduled"
    return marker.kind == .rehearsal ? "Rehearsal" + separator + position : position
  }

  /// "Keys · Sunday Service": a commitment's position and its service type, whose name links
  /// to the plan (`PlanRoute` from `parsePlanRoute(entry.planUrl)`) in the app.
  public static func commitmentEntryText(_ entry: PeopleDashboardMonthDay) -> String {
    let position = entry.positionName ?? "Scheduled"
    guard let serviceTypeName = entry.serviceTypeName, !serviceTypeName.isEmpty else {
      return position
    }
    return position + separator + serviceTypeName
  }

  /// The day the month view selects until the viewer picks one: the next service day from
  /// today, else the first service day, else today, else the 1st.
  public static func defaultSelectedDay(serviceDays days: [Int], today: Int?) -> Int {
    days.first { day in today.map { day >= $0 } ?? true } ?? days.first ?? today ?? 1
  }

  /// One page of the people-by-day matrix.
  public struct MatrixPage: Hashable, Sendable {
    /// The page's first service day's index among all service days.
    public var start: Int
    /// The page's service days.
    public var days: [Int]
    /// The service day a page back selects; nil on the first page.
    public var previousDay: Int?
    /// The service day a page ahead selects; nil on the last page.
    public var nextDay: Int?
    /// "3 service days this month." or "Service days 6 to 9 of 9."
    public var description: String
    /// More service days than fit one page, so the matrix pages.
    public var isPaged: Bool

    public init(
      start: Int, days: [Int], previousDay: Int?, nextDay: Int?, description: String,
      isPaged: Bool
    ) {
      self.start = start
      self.days = days
      self.previousDay = previousDay
      self.nextDay = nextDay
      self.description = description
      self.isPaged = isPaged
    }
  }

  /// The matrix page holding `selectedDay` (`PeopleMonthMatrix`).
  public static func matrixPage(serviceDays days: [Int], selectedDay: Int) -> MatrixPage {
    let pageSize = PeopleDashboardConstants.matrixDayCount
    let start = matrixPageStart(days, selectedDay: selectedDay)
    let pageDays = Array(days.dropFirst(start).prefix(pageSize))
    func day(at index: Int) -> Int? { days.indices.contains(index) ? days[index] : nil }
    let description =
      days.count <= pageSize
      ? "\(days.count) service \(days.count == 1 ? "day" : "days") this month."
      : "Service days \(start + 1) to \(start + pageDays.count) of \(days.count)."
    return MatrixPage(
      start: start,
      days: pageDays,
      previousDay: day(at: start - pageSize),
      nextDay: day(at: start + pageSize),
      description: description,
      isPaged: days.count > pageSize
    )
  }

  /// "3 service days · 1 rehearsal" for a person's month (distinct days), or
  /// "Nothing scheduled."
  public static func describeMonth(_ monthDays: [PeopleDashboardMonthDay]) -> String {
    let services = Set(monthDays.filter { $0.kind == .service }.map(\.day)).count
    let rehearsals = Set(monthDays.filter { $0.kind == .rehearsal }.map(\.day)).count
    if services == 0 && rehearsals == 0 {
      return "Nothing scheduled."
    }
    var parts = ["\(services) \(services == 1 ? "service day" : "service days")"]
    if rehearsals > 0 {
      parts.append("\(rehearsals) \(rehearsals == 1 ? "rehearsal" : "rehearsals")")
    }
    return parts.joined(separator: separator)
  }

  /// "Nothing scheduled in May." for a person's empty month: the month label's first word.
  public static func emptyMonthText(_ month: PeopleDashboardMonth) -> String {
    let name = JSParity.split(month.label, separator: " ").first ?? ""
    return "Nothing scheduled in \(name)."
  }
}
