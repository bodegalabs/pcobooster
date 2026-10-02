import Foundation
import PCOBoosterCore
import Testing

/// Replays the `people.constants`, `people.scope.*`, `people.batches.*`, `people.search.*`,
/// `people.assemblePeopleDashboard`, `people.describeCoverage`, `people.buildMonthDays`,
/// `people.serviceDays`, and `people.matrixPageStart` suites from
/// scripts/parity/people.parity.ts.
struct PeopleDashboardParityTests {
  struct Constants: Decodable, Sendable {
    let sampleSize: Int
    let teamScopeLimit: Int
    let batchConcurrency: Int
    let activityBatchSize: Int
    let matrixDayCount: Int
    let dueFloorDays: Int
    let waitingWindowDays: Int
    let weekDayNames: [String]
  }

  @Test(arguments: Parity.cases("people.constants", Int?.self, Constants.self))
  func constants(_ c: ParityCase<Int?, Constants>) {
    #expect(PeopleDashboardConstants.sampleSize == c.output.sampleSize)
    #expect(PeopleDashboardConstants.teamScopeLimit == c.output.teamScopeLimit)
    #expect(PeopleDashboardConstants.batchConcurrency == c.output.batchConcurrency)
    #expect(PeopleDashboardConstants.activityBatchSize == c.output.activityBatchSize)
    #expect(PeopleDashboardConstants.matrixDayCount == c.output.matrixDayCount)
    #expect(TeamHealthEngine.dueFloorDays == c.output.dueFloorDays)
    #expect(TeamHealthEngine.waitingWindowDays == c.output.waitingWindowDays)
    #expect(DashboardCalendar.weekDayNames == c.output.weekDayNames)
  }

  // MARK: Scopes

  struct OptionalValue: Decodable, Sendable {
    let value: String?
  }

  @Test(arguments: Parity.cases("people.scope.parse", OptionalValue.self, String?.self))
  func parseScope(_ c: ParityCase<OptionalValue, String?>) {
    let scope = c.input.value.flatMap(PeopleDashboardScope.init(rawValue:))
    #expect(scope?.rawValue == c.output)
  }

  struct TeamScopeOutput: Decodable, Sendable {
    let scope: String
    let parsed: String?
  }

  @Test(arguments: Parity.cases("people.scope.teamScope", String.self, TeamScopeOutput.self))
  func teamScope(_ c: ParityCase<String, TeamScopeOutput>) {
    let scope = PeopleDashboardScope.team(c.input)
    #expect(scope.rawValue == c.output.scope)
    #expect(PeopleDashboardScope(rawValue: scope.rawValue)?.rawValue == c.output.parsed)
  }

  @Test(arguments: Parity.cases("people.scope.view", OptionalValue.self, String.self))
  func parseView(_ c: ParityCase<OptionalValue, String>) {
    #expect(PeopleDashboardMode(parsing: c.input.value).rawValue == c.output)
  }

  @Test(
    arguments: Parity.cases("people.scope.default", PeopleDashboardRoster.self, String.self))
  func defaultScope(_ c: ParityCase<PeopleDashboardRoster, String>) {
    #expect(defaultPeopleDashboardScope(c.input).rawValue == c.output)
  }

  struct TeamIdsInput: Decodable, Sendable {
    let scope: String
    let ledTeamIds: [String]
  }

  @Test(arguments: Parity.cases("people.scope.teamIds", TeamIdsInput.self, [String]?.self))
  func teamIds(_ c: ParityCase<TeamIdsInput, [String]?>) throws {
    let scope = try #require(PeopleDashboardScope(rawValue: c.input.scope))
    #expect(scopeTeamIds(scope, ledTeamIds: c.input.ledTeamIds) == c.output)
  }

  struct ResolveInput: Decodable, Sendable {
    let roster: PeopleDashboardRoster
    let scopes: [String]
  }

  @Test(
    arguments: Parity.cases(
      "people.scope.resolveScopePersonIds", ResolveInput.self, [[String]].self))
  func resolveScope(_ c: ParityCase<ResolveInput, [[String]]>) throws {
    let resolved = try c.input.scopes.map { value in
      resolveScopePersonIds(
        c.input.roster, scope: try #require(PeopleDashboardScope(rawValue: value)))
    }
    #expect(resolved == c.output)
  }

  struct InitialLoadInput: Decodable, Sendable {
    let scope: String
    let scopePeopleCount: Int
  }

  @Test(
    arguments: Parity.cases(
      "people.scope.initialScopeLoadCount", InitialLoadInput.self, Int.self))
  func initialLoad(_ c: ParityCase<InitialLoadInput, Int>) throws {
    let scope = try #require(PeopleDashboardScope(rawValue: c.input.scope))
    #expect(
      initialScopeLoadCount(scope: scope, scopePeopleCount: c.input.scopePeopleCount) == c.output)
  }

  // MARK: Batches

  struct ChunkInput: Decodable, Sendable {
    let personIds: [String]
    let batchSize: Int
  }

  @Test(arguments: Parity.cases("people.batches.chunkPersonIds", ChunkInput.self, [[String]].self))
  func chunk(_ c: ParityCase<ChunkInput, [[String]]>) {
    #expect(chunkPersonIds(c.input.personIds, batchSize: c.input.batchSize) == c.output)
  }

  struct PlanInput: Decodable, Sendable {
    let personIds: [String]
    let targetPeopleCount: Int
    let batchSize: Int
  }

  @Test(
    arguments: Parity.cases(
      "people.batches.planPeopleDashboardBatches", PlanInput.self, [[String]].self))
  func planBatches(_ c: ParityCase<PlanInput, [[String]]>) {
    let batches = planPeopleDashboardBatches(
      c.input.personIds, targetPeopleCount: c.input.targetPeopleCount,
      batchSize: c.input.batchSize)
    #expect(batches == c.output)
  }

  struct OrderInput: Decodable, Sendable {
    let sample: [[String]]
    let search: [[String]]
    let started: [String]
  }

  @Test(
    arguments: Parity.cases(
      "people.batches.orderActivityBatches", OrderInput.self, [[String]].self))
  func orderBatches(_ c: ParityCase<OrderInput, [[String]]>) {
    let started = Set(c.input.started)
    let ordered = orderActivityBatches(sample: c.input.sample, search: c.input.search) {
      started.contains($0.first ?? "")
    }
    #expect(ordered == c.output)
  }

  // MARK: Search

  @Test(
    arguments: Parity.cases("people.search.normalizePeopleQuery", String.self, String.self))
  func normalize(_ c: ParityCase<String, String>) {
    #expect(normalizePeopleQuery(c.input) == c.output)
  }

  struct SearchRow: Decodable, Sendable {
    let person: PeopleDashboardRosterPerson
    let member: PeopleDashboardPerson?

    var row: PeopleDashboardRow {
      PeopleDashboardRow(person: person, member: member, isLoading: false)
    }
  }

  struct MatchesInput: Decodable, Sendable {
    let row: SearchRow
    let queries: [String]
  }

  @Test(
    arguments: Parity.cases("people.search.matchesPeopleQuery", MatchesInput.self, [Bool].self))
  func matches(_ c: ParityCase<MatchesInput, [Bool]>) {
    let row = c.input.row.row
    let results = c.input.queries.map { matchesPeopleQuery(row, normalizedQuery: $0) }
    #expect(results == c.output)
  }

  struct UnrequestedSearch: Decodable, Sendable {
    let query: String
    let requestedIds: [String]
  }

  struct UnrequestedInput: Decodable, Sendable {
    let rows: [SearchRow]
    let searches: [UnrequestedSearch]
  }

  @Test(
    arguments: Parity.cases(
      "people.search.unrequestedMatchIds", UnrequestedInput.self, [[String]].self))
  func unrequested(_ c: ParityCase<UnrequestedInput, [[String]]>) {
    let rows = c.input.rows.map(\.row)
    let results = c.input.searches.map { search in
      unrequestedMatchIds(
        rows, normalizedQuery: search.query, requestedIds: Set(search.requestedIds))
    }
    #expect(results == c.output)
  }

  // MARK: Assembly

  struct AssembleInput: Decodable, Sendable {
    let roster: PeopleDashboardRoster
    let activities: [PeopleDashboardActivity]
    let scopePersonIds: [String]
    let samplePeopleCount: Int
    let loadingPersonIds: [String]

    var dashboard: PeopleDashboardData {
      assemblePeopleDashboard(
        roster, activities: activities, scopePersonIds: scopePersonIds,
        samplePeopleCount: samplePeopleCount, loadingPersonIds: Set(loadingPersonIds))
    }
  }

  struct RowView: Decodable, Sendable, Equatable {
    let person: PeopleDashboardRosterPerson
    let member: PeopleDashboardPerson?
    let loading: Bool

    init(_ row: PeopleDashboardRow) {
      person = row.person
      member = row.member
      loading = row.isLoading
    }
  }

  struct CoverageView: Decodable, Sendable, Equatable {
    let scopePeopleCount: Int
    let samplePeopleCount: Int
    let loadedPeopleCount: Int

    init(_ coverage: PeopleDashboardCoverage) {
      scopePeopleCount = coverage.scopePeopleCount
      samplePeopleCount = coverage.samplePeopleCount
      loadedPeopleCount = coverage.loadedPeopleCount
    }
  }

  struct DashboardView: Decodable, Sendable, Equatable {
    let generatedAt: String
    let month: PeopleDashboardMonth
    let teams: [PeopleDashboardTeam]
    let ledTeamIds: [String]
    let scopeRows: [RowView]
    let sampleRows: [RowView]
    let members: [PeopleDashboardPerson]
    let coverage: CoverageView

    init(_ data: PeopleDashboardData) {
      generatedAt = data.generatedAt
      month = data.month
      teams = data.teams
      ledTeamIds = data.ledTeamIds
      scopeRows = data.scopeRows.map(RowView.init)
      sampleRows = data.sampleRows.map(RowView.init)
      members = data.members
      coverage = CoverageView(data.coverage)
    }
  }

  @Test(
    arguments: Parity.cases(
      "people.assemblePeopleDashboard", AssembleInput.self, DashboardView.self))
  func assemble(_ c: ParityCase<AssembleInput, DashboardView>) {
    #expect(DashboardView(c.input.dashboard) == c.output)
  }

  struct CoverageInput: Decodable, Sendable {
    let coverage: CoverageView
    let isLoading: Bool
  }

  @Test(arguments: Parity.cases("people.describeCoverage", CoverageInput.self, String?.self))
  func coverage(_ c: ParityCase<CoverageInput, String?>) {
    let coverage = PeopleDashboardCoverage(
      scopePeopleCount: c.input.coverage.scopePeopleCount,
      samplePeopleCount: c.input.coverage.samplePeopleCount,
      loadedPeopleCount: c.input.coverage.loadedPeopleCount)
    #expect(describeCoverage(coverage, isLoading: c.input.isLoading) == c.output)
  }

  // MARK: Month days

  struct MonthDaysOnly: Decodable, Sendable {
    let monthDays: [PeopleDashboardMonthDay]
  }

  struct DayView: Decodable, Sendable, Equatable {
    let day: Int
    let serviceCount: Int
    let confirmedServiceCount: Int
    let pendingServiceCount: Int
    let rehearsalCount: Int

    init(_ day: PeopleDashboardDay) {
      self.day = day.day
      serviceCount = day.serviceCount
      confirmedServiceCount = day.confirmedServiceCount
      pendingServiceCount = day.pendingServiceCount
      rehearsalCount = day.rehearsalCount
    }

    var value: PeopleDashboardDay {
      PeopleDashboardDay(
        day: day, serviceCount: serviceCount, confirmedServiceCount: confirmedServiceCount,
        pendingServiceCount: pendingServiceCount, rehearsalCount: rehearsalCount)
    }
  }

  @Test(arguments: Parity.cases("people.buildMonthDays", [MonthDaysOnly].self, [DayView].self))
  func monthDays(_ c: ParityCase<[MonthDaysOnly], [DayView]>) {
    #expect(buildMonthDays(monthDays: c.input.map(\.monthDays)).map(DayView.init) == c.output)
  }

  @Test(arguments: Parity.cases("people.serviceDays", [DayView].self, [Int].self))
  func serviceDays(_ c: ParityCase<[DayView], [Int]>) {
    #expect(PCOBoosterCore.serviceDays(c.input.map(\.value)) == c.output)
  }

  struct MatrixInput: Decodable, Sendable {
    let days: [Int]
    let selectedDay: Int
  }

  @Test(arguments: Parity.cases("people.matrixPageStart", MatrixInput.self, Int.self))
  func matrixStart(_ c: ParityCase<MatrixInput, Int>) {
    #expect(matrixPageStart(c.input.days, selectedDay: c.input.selectedDay) == c.output)
  }
}
