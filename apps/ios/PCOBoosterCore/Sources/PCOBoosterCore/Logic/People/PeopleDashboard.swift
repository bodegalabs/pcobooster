import Foundation

// Port of apps/web/src/lib/people-dashboard.ts: People dashboard scopes, sampling, activity
// batching, search, month-day counts, matrix paging, and assembly from the roster and
// activity batches. Pinned by the `people.scope.*`, `people.batches.*`, `people.search.*`,
// `people.assemblePeopleDashboard`, `people.describeCoverage`, `people.buildMonthDays`,
// `people.serviceDays`, and `people.matrixPageStart` parity suites.

/// Loading limits of the People dashboard, shared with the web.
public enum PeopleDashboardConstants {
  /// People whose schedules load without asking in the all-teams scope; more load on
  /// request (`PEOPLE_DASHBOARD_SAMPLE_SIZE`).
  public static let sampleSize = 48
  /// A team scope loads whole up to this many people, so its health covers everyone; larger
  /// scopes load in samples like the all-teams scope (`PEOPLE_DASHBOARD_TEAM_SCOPE_LIMIT`).
  public static let teamScopeLimit = 160
  /// Activity calls in flight at once. Each costs about 20 Planning Center requests cold,
  /// and the user's budget is 100 per 20 seconds (`PEOPLE_DASHBOARD_BATCH_CONCURRENCY`).
  public static let batchConcurrency = 2
  /// People per `people.dashboardActivity` call (`PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE` in
  /// `packages/contracts/src/people.ts`).
  public static let activityBatchSize = 16
  /// Service days the month matrix shows at once (`MATRIX_DAY_COUNT`).
  public static let matrixDayCount = 5
  /// Day slots `buildMonthDays` counts, one per day of the longest month.
  static let daysInLongestMonth = 31
}

/// The teams the viewer leads, every team, or one team by id. The raw value is the web's
/// select value and `scope` search param: "mine", "all", or "team:<id>".
public enum PeopleDashboardScope: Hashable, Sendable, RawRepresentable, Codable {
  case mine
  case all
  case team(String)

  private static let teamPrefix = "team:"

  /// A select value or search param as a scope; nil for anything unrecognized, including a
  /// "team:" with no id (`parsePeopleDashboardScope`).
  public init?(rawValue: String) {
    switch rawValue {
    case "mine":
      self = .mine
    case "all":
      self = .all
    default:
      // `startsWith` and `slice` work on code units: "team:" followed by a combining mark
      // still names a team, which `hasPrefix` (by character) would refuse.
      let prefix = Self.teamPrefix.unicodeScalars
      guard rawValue.unicodeScalars.starts(with: prefix),
        rawValue.utf16.count > Self.teamPrefix.utf16.count
      else {
        return nil
      }
      self = .team(String(Substring(rawValue.unicodeScalars.dropFirst(prefix.count))))
    }
  }

  /// "mine", "all", or "team:<id>" (`teamScope` for a team).
  public var rawValue: String {
    switch self {
    case .mine: "mine"
    case .all: "all"
    case .team(let teamId): Self.teamPrefix + teamId
    }
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    let value = try container.decode(String.self)
    guard let scope = Self(rawValue: value) else {
      throw DecodingError.dataCorruptedError(
        in: container, debugDescription: "Unknown People dashboard scope \(value)")
    }
    self = scope
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

/// The People dashboard's two views: Health and Month (the web's `PeopleDashboardView`;
/// renamed so it does not read as a SwiftUI view).
public enum PeopleDashboardMode: String, CaseIterable, Codable, Sendable {
  case health
  case month

  /// A search param as a view: Month only when it says "month", otherwise Health
  /// (`parsePeopleDashboardView`).
  public init(parsing value: String?) {
    self = value == "month" ? .month : .health
  }
}

/// How many people serve on one day of the month.
public struct PeopleDashboardDay: Hashable, Sendable, Identifiable {
  /// 1 to 31.
  public var day: Int
  /// People serving at a service that day.
  public var serviceCount: Int
  public var confirmedServiceCount: Int
  public var pendingServiceCount: Int
  /// People at a rehearsal that day.
  public var rehearsalCount: Int

  public var id: Int { day }

  public init(
    day: Int, serviceCount: Int, confirmedServiceCount: Int, pendingServiceCount: Int,
    rehearsalCount: Int
  ) {
    self.day = day
    self.serviceCount = serviceCount
    self.confirmedServiceCount = confirmedServiceCount
    self.pendingServiceCount = pendingServiceCount
    self.rehearsalCount = rehearsalCount
  }
}

/// One scope person, with their activity once it has loaded.
public struct PeopleDashboardRow: Hashable, Sendable, Identifiable {
  public var person: PeopleDashboardRosterPerson
  /// Nil until their activity loads.
  public var member: PeopleDashboardPerson?
  /// Their activity is on its way (the web's `loading`).
  public var isLoading: Bool

  public var id: String { person.id }

  public init(person: PeopleDashboardRosterPerson, member: PeopleDashboardPerson?, isLoading: Bool)
  {
    self.person = person
    self.member = member
    self.isLoading = isLoading
  }
}

/// How much of the scope health covers.
public struct PeopleDashboardCoverage: Hashable, Sendable {
  /// People in the selected scope.
  public var scopePeopleCount: Int
  /// The first people of the scope, in roster order, that health covers.
  public var samplePeopleCount: Int
  /// Sample people whose activity has loaded.
  public var loadedPeopleCount: Int

  public init(scopePeopleCount: Int, samplePeopleCount: Int, loadedPeopleCount: Int) {
    self.scopePeopleCount = scopePeopleCount
    self.samplePeopleCount = samplePeopleCount
    self.loadedPeopleCount = loadedPeopleCount
  }
}

/// The dashboard as the app assembles it from the roster and activity batches.
public struct PeopleDashboardData: Hashable, Sendable {
  public var generatedAt: String
  public var month: PeopleDashboardMonth
  /// Roster teams, available before any activity arrives.
  public var teams: [PeopleDashboardTeam]
  /// Teams the viewer leads.
  public var ledTeamIds: [String]
  /// Every scope person, in roster order (by last name).
  public var scopeRows: [PeopleDashboardRow]
  /// The first `coverage.samplePeopleCount` scope rows.
  public var sampleRows: [PeopleDashboardRow]
  /// Sample people with activity loaded, in roster order: what health covers.
  public var members: [PeopleDashboardPerson]
  public var coverage: PeopleDashboardCoverage

  public init(
    generatedAt: String, month: PeopleDashboardMonth, teams: [PeopleDashboardTeam],
    ledTeamIds: [String], scopeRows: [PeopleDashboardRow], sampleRows: [PeopleDashboardRow],
    members: [PeopleDashboardPerson], coverage: PeopleDashboardCoverage
  ) {
    self.generatedAt = generatedAt
    self.month = month
    self.teams = teams
    self.ledTeamIds = ledTeamIds
    self.scopeRows = scopeRows
    self.sampleRows = sampleRows
    self.members = members
    self.coverage = coverage
  }
}

/// "Based on 16 of 40 people so far" while health covers part of the scope; nil once it
/// covers everyone. "The first" means the sample, in roster order, has all loaded.
public func describeCoverage(_ coverage: PeopleDashboardCoverage, isLoading: Bool) -> String? {
  let loaded = coverage.loadedPeopleCount
  if loaded >= coverage.scopePeopleCount {
    return nil
  }
  let scope = PeopleText.peopleCount(coverage.scopePeopleCount)
  if isLoading {
    return "Based on \(loaded) of \(scope) so far"
  }
  if loaded == coverage.samplePeopleCount {
    return "Based on the first \(loaded) of \(scope)"
  }
  return "Based on \(loaded) of \(scope)"
}

/// People serving and rehearsing on each day of the month: 31 days, whatever the month's
/// length. Someone with two services on one day counts once.
public func buildMonthDays(_ people: [PeopleDashboardPerson]) -> [PeopleDashboardDay] {
  buildMonthDays(monthDays: people.map(\.monthDays))
}

/// `buildMonthDays` over each person's month days.
public func buildMonthDays(monthDays people: [[PeopleDashboardMonthDay]]) -> [PeopleDashboardDay] {
  (1...PeopleDashboardConstants.daysInLongestMonth).map { day in
    let dayValue = Double(day)
    func peopleWith(_ matches: (PeopleDashboardMonthDay) -> Bool) -> Int {
      people.filter { entries in entries.contains { $0.day == dayValue && matches($0) } }.count
    }
    let confirmedServiceCount = peopleWith {
      $0.kind == .service && DashboardCalendar.isConfirmedStatus($0.status)
    }
    let serviceCount = peopleWith { $0.kind == .service }
    return PeopleDashboardDay(
      day: day,
      serviceCount: serviceCount,
      confirmedServiceCount: confirmedServiceCount,
      pendingServiceCount: serviceCount - confirmedServiceCount,
      rehearsalCount: peopleWith { $0.kind == .rehearsal }
    )
  }
}

/// Days someone serves at a service, in order.
public func serviceDays(_ monthDays: [PeopleDashboardDay]) -> [Int] {
  monthDays.compactMap { $0.serviceCount > 0 ? $0.day : nil }
}

/// Where the page of `PeopleDashboardConstants.matrixDayCount` service days starts that holds
/// `selectedDay`, or the next service day after it; the last page when no service day follows.
public func matrixPageStart(_ days: [Int], selectedDay: Int) -> Int {
  let pageSize = PeopleDashboardConstants.matrixDayCount
  let pageIndex = days.firstIndex { $0 >= selectedDay } ?? max(0, days.count - 1)
  return pageIndex / pageSize * pageSize
}

/// The scope a leader lands on: their own teams when they lead any.
public func defaultPeopleDashboardScope(_ roster: PeopleDashboardRoster) -> PeopleDashboardScope {
  roster.ledTeamIds.isEmpty ? .all : .mine
}

/// The teams a scope covers; nil for all teams.
public func scopeTeamIds(_ scope: PeopleDashboardScope, ledTeamIds: [String]) -> [String]? {
  switch scope {
  case .all: nil
  case .mine: ledTeamIds
  case .team(let teamId): [teamId]
  }
}

/// The scope's people, in roster order (by last name).
public func resolveScopePersonIds(
  _ roster: PeopleDashboardRoster, scope: PeopleDashboardScope
) -> [String] {
  guard let scopedTeamIds = scopeTeamIds(scope, ledTeamIds: roster.ledTeamIds) else {
    return roster.people.map(\.id)
  }
  let teamIds = Set(scopedTeamIds)
  let inScope = Set(roster.teams.filter { teamIds.contains($0.id) }.flatMap(\.personIds))
  return roster.people.map(\.id).filter(inScope.contains)
}

/// How many of a scope's people load before the viewer asks for more: a team scope loads
/// whole up to the team limit; anything bigger, and all teams, load a sample.
public func initialScopeLoadCount(scope: PeopleDashboardScope, scopePeopleCount: Int) -> Int {
  scope != .all && scopePeopleCount <= PeopleDashboardConstants.teamScopeLimit
    ? scopePeopleCount
    : PeopleDashboardConstants.sampleSize
}

/// The sample health covers once the viewer has asked for `extraPeopleCount` more people
/// ("Load more" adds `PeopleDashboardConstants.sampleSize`), never more than the scope
/// (the web's `samplePeopleCount` in `usePeopleDashboard`).
public func peopleDashboardSampleCount(
  scope: PeopleDashboardScope, scopePeopleCount: Int, extraPeopleCount: Int
) -> Int {
  min(
    scopePeopleCount,
    initialScopeLoadCount(scope: scope, scopePeopleCount: scopePeopleCount) + extraPeopleCount)
}

/// `personIds` split into activity calls of `batchSize` (at least 1; the TypeScript never
/// finishes for a smaller size).
public func chunkPersonIds(_ personIds: [String], batchSize: Int) -> [[String]] {
  let size = max(1, batchSize)
  return stride(from: 0, to: personIds.count, by: size).map { start in
    Array(personIds[start..<min(start + size, personIds.count)])
  }
}

/// The first `targetPeopleCount` scope people, split into activity calls.
public func planPeopleDashboardBatches(
  _ personIds: [String], targetPeopleCount: Int, batchSize: Int
) -> [[String]] {
  chunkPersonIds(Array(personIds.prefix(max(0, targetPeopleCount))), batchSize: batchSize)
}

/// The order activity calls start in, `PeopleDashboardConstants.batchConcurrency` at a time:
/// calls already under way keep their place, then search matches the viewer is waiting on,
/// then the rest of the sample.
public func orderActivityBatches(
  sample: [[String]], search: [[String]], hasStarted: ([String]) -> Bool
) -> [[String]] {
  sample.filter(hasStarted) + search + sample.filter { !hasStarted($0) }
}

/// Trimmed and lowercased the way JavaScript does it; empty means no search.
public func normalizePeopleQuery(_ query: String) -> String {
  PeopleText.lowercased(JSParity.trim(query))
}

/// Whether a scope row matches a normalized search by name, team, or role (roles only once
/// the person's activity has loaded).
public func matchesPeopleQuery(_ row: PeopleDashboardRow, normalizedQuery: String) -> Bool {
  if normalizedQuery.isEmpty {
    return true
  }
  let haystack = ([row.person.name] + row.person.teams + (row.member?.roles ?? []))
    .joined(separator: " ")
  return PeopleText.includes(PeopleText.lowercased(haystack), normalizedQuery)
}

/// Search matches whose activity nobody has asked for yet, in roster order.
public func unrequestedMatchIds(
  _ rows: [PeopleDashboardRow], normalizedQuery: String, requestedIds: Set<String>
) -> [String] {
  guard !normalizedQuery.isEmpty else {
    return []
  }
  return rows.compactMap { row in
    row.member == nil && !requestedIds.contains(row.person.id)
      && matchesPeopleQuery(row, normalizedQuery: normalizedQuery)
      ? row.person.id : nil
  }
}

/// A roster person merged with their activity.
public func toDashboardPerson(
  _ person: PeopleDashboardRosterPerson, activity: PeopleDashboardActivity
) -> PeopleDashboardPerson {
  PeopleDashboardPerson(
    id: person.id,
    name: person.name,
    initials: person.initials,
    photoThumbnailUrl: person.photoThumbnailUrl,
    teams: person.teams,
    rhythm: activity.rhythm,
    roles: activity.roles,
    monthDays: activity.monthDays
  )
}

/// The scope's rows as far as activity has loaded. Health covers the first
/// `samplePeopleCount` scope people; it grows as their batches answer. `loadingPersonIds` are
/// the people whose activity was asked for and has neither answered nor failed. A person
/// listed twice in the roster or activities takes their last entry, as the web's maps do.
public func assemblePeopleDashboard(
  _ roster: PeopleDashboardRoster,
  activities: [PeopleDashboardActivity],
  scopePersonIds: [String],
  samplePeopleCount: Int,
  loadingPersonIds: Set<String>
) -> PeopleDashboardData {
  let activityById = Dictionary(activities.map { ($0.id, $0) }) { _, last in last }
  let personById = Dictionary(roster.people.map { ($0.id, $0) }) { _, last in last }
  let scopeRows = scopePersonIds.compactMap { personId -> PeopleDashboardRow? in
    guard let person = personById[personId] else {
      return nil
    }
    let activity = activityById[personId]
    return PeopleDashboardRow(
      person: person,
      member: activity.map { toDashboardPerson(person, activity: $0) },
      isLoading: activity == nil && loadingPersonIds.contains(personId)
    )
  }
  let sampleRows = Array(scopeRows.prefix(max(0, samplePeopleCount)))
  let members = sampleRows.compactMap(\.member)
  return PeopleDashboardData(
    generatedAt: roster.generatedAt,
    month: roster.month,
    teams: roster.teams,
    ledTeamIds: roster.ledTeamIds,
    scopeRows: scopeRows,
    sampleRows: sampleRows,
    members: members,
    coverage: PeopleDashboardCoverage(
      scopePeopleCount: scopeRows.count,
      samplePeopleCount: sampleRows.count,
      loadedPeopleCount: members.count
    )
  )
}

/// The dashboard over the whole roster from whatever activity is already cached: every
/// person in scope and sample, nobody loading. The person page reads its roster teams and
/// team pace from it (the web's `readPeopleDashboardFromQueryCache`).
public func assemblePeopleDashboardFromCache(
  _ roster: PeopleDashboardRoster, activities: [PeopleDashboardActivity]
) -> PeopleDashboardData {
  assemblePeopleDashboard(
    roster,
    activities: activities,
    scopePersonIds: roster.people.map(\.id),
    samplePeopleCount: roster.people.count,
    loadingPersonIds: []
  )
}
