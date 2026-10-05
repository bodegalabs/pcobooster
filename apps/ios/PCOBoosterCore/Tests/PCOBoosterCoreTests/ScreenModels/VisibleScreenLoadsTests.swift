import Foundation
import PCOBoosterCore
import Testing

@MainActor
private struct ScreenHarness {
  let transport: StubTransport
  let queries: QueryClient
  let clock = TestClock()
  let scope = QueryScope(id: UUID().uuidString)

  init(handler: @escaping StubTransport.RPCHandler) {
    transport = StubTransport(rpc: handler)
    queries = QueryClient(
      rpc: RPCClient(transport: transport, scheduler: RequestScheduler(quietPeriod: .zero)),
      scope: scope, cacheDirectory: nil, now: clock.dateProvider, clock: clock)
  }
}

// Sources/ links the app's Foundation-only screen models so these regressions exercise the
// production lifecycle and request planning through the same macOS Core test command.
@MainActor
struct VisibleScreenLoadsTests {
  private let types = [
    ServiceType(id: "one", name: "One", sequence: 1),
    ServiceType(id: "two", name: "Two", sequence: 2),
  ]
  private let plans = [Plan(id: "anchor", title: "Plan", createdAt: .distantPast, sortDate: .distantFuture)]

  private func services(_ harness: ScreenHarness) -> ServicesHomeModel {
    harness.queries.setValue(types, for: .serviceTypes)
    harness.queries.setValue(MyScheduledPlansData(planIds: []), for: .myScheduledPlans)
    for type in types {
      harness.queries.setValue(plans, for: .plans(serviceTypeId: type.id))
    }
    let defaults = UserDefaults(suiteName: "VisibleScreenLoads-\(UUID().uuidString)")!
    return ServicesHomeModel(queries: harness.queries, scope: harness.scope, defaults: defaults)
  }

  @Test func servicesOnlyRevalidatesSelectedQueriesAndRetainsCachedRows() async throws {
    let plans = plans
    let harness = ScreenHarness { _ in try .ok(encoding: plans) }
    let model = services(harness)
    model.setSelected(types[1], false)
    harness.queries.invalidate(.family(.plans))
    await eventually { model.planStates["one"]?.status == .success && harness.transport.requests.count == 1 }
    #expect(model.planStates["two"]?.value == plans)
    model.disappear()
    harness.queries.invalidate(.family(.plans))
    model.appear()
    await eventually { model.planStates["one"]?.status == .success && harness.transport.requests.count == 2 }
    #expect(model.selectedIds == ["one"])
    #expect(model.upcomingRows.count == 1)
    model.setSelected(types[1], true)
    await eventually { model.planStates["two"]?.status == .success && harness.transport.requests.count == 3 }
    #expect(model.upcomingRows.count == 2)
  }

  @Test func servicesRecentReadsStayHiddenOutsideRecentWindow() async throws {
    let plans = plans
    let harness = ScreenHarness { _ in try .ok(encoding: plans) }
    let model = services(harness)
    model.window = .recent
    await eventually { model.recentStates.count == 2 && model.recentStates.values.allSatisfy { $0.status == .success } }
    #expect(harness.transport.requests.count == 2)
    model.setSelected(types[1], false)
    harness.queries.invalidate(.family(.adjacentPlans))
    await eventually { harness.transport.requests.count == 3 && model.recentStates["one"]?.status == .success }
    #expect(model.recentStates["two"]?.status == .success)
    model.window = .default
    model.disappear()
    harness.queries.invalidate(.family(.adjacentPlans))
    model.appear()
    #expect(harness.transport.requests.count == 3)
    #expect(model.recentStates["one"]?.status == .success)
    #expect(model.recentStates["one"]?.value == plans)
    model.window = .recent
    await eventually { harness.transport.requests.count == 4 && model.recentStates.values.allSatisfy { $0.status == .success } }
  }

  @Test func servicesDoesNotStartNewQueriesWhileHidden() async throws {
    let plans = plans
    let harness = ScreenHarness { _ in try .ok(encoding: plans) }
    let model = services(harness)
    model.disappear()
    model.window = .recent
    model.syncQueries()
    #expect(model.recentStates.isEmpty)
    #expect(harness.transport.requests.isEmpty)
    model.appear()
    await eventually { model.recentStates.count == 2 && model.recentStates.values.allSatisfy { $0.status == .success } }
    #expect(harness.transport.requests.count == 2)
  }

  @Test func peopleFinishesContinuationsButPausesNewBatchesUntilVisible() async throws {
    let gate = Gate()
    let harness = ScreenHarness { request in
      struct Body: Decodable { let json: PeopleDashboardActivityInput }
      let ids = try JSONCoding.makeDecoder().decode(Body.self, from: request.body).json.personIds
      if ids.count == 16 { await gate.wait() }
      return try .ok(encoding: PeopleDashboardActivityBatch(
        generatedAt: "2026-10-01T17:00:00Z",
        people: (ids.count == 16 ? Array(ids.prefix(8)) : ids).map {
          PeopleDashboardActivity(id: $0, rhythm: PeopleScreensTests.rhythm(), roles: ["Role"], monthDays: [])
        },
        deferredPersonIds: ids.count == 16 ? Array(ids.suffix(8)) : [],
        requestBudget: PeopleDashboardActivityBatchRequestBudget(
          limit: 40, planningCenterRequests: 1, scheduleRequests: 1, planTimeRequests: 0)))
    }
    let roster = PeopleDashboardRoster(
      generatedAt: "2026-10-01T17:00:00Z",
      month: PeopleDashboardMonth(year: 2026, monthIndex: 9, label: "October", daysInMonth: 31, startsOnWeekday: 4),
      people: (1...48).map { PeopleDashboardRosterPerson(id: "\($0)", name: "Person \($0)", initials: "P", teams: []) },
      teams: [], ledTeamIds: [])
    harness.queries.setValue(roster, for: .peopleDashboardRoster)
    let model = PeopleDashboardModel(queries: harness.queries, clock: .fixed(.distantPast), timeZone: "UTC")
    await eventually { harness.transport.requests.count == 2 }
    model.disappear()
    gate.open()
    await eventually(timeout: .seconds(1)) { !model.isFetchingActivity }
    #expect(harness.transport.requests.count == 4)
    #expect(model.isLoadingSample)
    #expect(model.dashboard?.scopeRows.count == 48)
    #expect(model.dashboard?.members.count == 32)
    model.appear()
    await eventually { !model.isLoadingSample }
    #expect(harness.transport.requests.count == 6)
    #expect(model.dashboard?.members.count == 48)
    model.disappear()
    model.appear()
    await eventually(timeout: .seconds(1)) { !model.isFetchingActivity }
    #expect(harness.transport.requests.count == 6)
    model.disappear()
    harness.clock.advance(by: .seconds(180))
    model.appear()
    await eventually { !model.isLoadingSample }
    #expect(harness.transport.requests.count == 12)
    model.disappear()
    harness.queries.invalidate(.family(.peopleDashboardActivity), refetchActive: false)
    model.appear()
    await eventually { !model.isLoadingSample }
    #expect(harness.transport.requests.count == 18)
  }
}
