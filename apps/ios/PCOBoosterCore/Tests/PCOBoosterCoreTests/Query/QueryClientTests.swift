import Foundation
import PCOBoosterCore
import Testing

private let serviceTypesJSON = #"[{"id":"1","name":"Sunday Gathering","sequence":1},{"id":"2","name":"Youth","sequence":2}]"#

@MainActor
private struct QueryHarness {
  let transport: StubTransport
  let clock = TestClock()
  let analytics = RecordingAnalytics()
  let queries: QueryClient

  init(
    cacheDirectory: URL? = nil,
    scope: QueryScope = .development,
    scheduler: RequestScheduler = RequestScheduler(quietPeriod: .zero),
    rpc handler: @escaping StubTransport.RPCHandler
  ) {
    transport = StubTransport(rpc: handler)
    let rpc = RPCClient(transport: transport, scheduler: scheduler, clientInfo: testClientInfo)
    queries = QueryClient(
      rpc: rpc, scope: scope, cacheDirectory: cacheDirectory, analytics: analytics,
      now: clock.dateProvider, clock: clock)
  }

  func serviceTypes() -> QueryState<[ServiceType]> {
    queries.query(.serviceTypes, RPC.Catalog.serviceTypes)
  }

  var serviceTypeRequests: Int {
    transport.requests(to: "catalog/serviceTypes").count
  }
}

private func temporaryDirectory() -> URL {
  FileManager.default.temporaryDirectory.appending(
    path: "PCOBoosterQueryTests-\(UUID().uuidString)", directoryHint: .isDirectory)
}

@MainActor
struct QueryClientTests {
  // MARK: - Reads

  @Test func sharesOneRequestBetweenStatesForAKey() async {
    let gate = Gate()
    let harness = QueryHarness { _ in
      await gate.wait()
      return .ok(serviceTypesJSON)
    }
    let first = harness.serviceTypes()
    let second = harness.serviceTypes()
    #expect(first.status == .loading)
    #expect(second.isLoading)
    await eventually { harness.serviceTypeRequests == 1 }
    gate.open()
    await eventually { first.value != nil }
    #expect(second.value?.map(\.name) == ["Sunday Gathering", "Youth"])
    #expect(first.status == .success)
    #expect(harness.serviceTypeRequests == 1)
  }

  @Test func freshValuesAreNotReloadedAndStaleOnesAreOnAppear() async {
    let harness = QueryHarness { _ in .ok(serviceTypesJSON) }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    #expect(state.updatedAt == harness.clock.date)

    // Service types stay fresh for 10 minutes.
    harness.clock.advance(by: .seconds(9 * 60))
    _ = harness.serviceTypes()
    state.appear()
    #expect(harness.serviceTypeRequests == 1)

    harness.clock.advance(by: .seconds(60))
    state.appear()
    #expect(state.status == .refreshing)
    #expect(state.value != nil)
    await eventually { state.status == .success }
    #expect(harness.serviceTypeRequests == 2)
  }

  @Test func refreshReloadsFreshValuesAndWaits() async {
    let harness = QueryHarness { _ in .ok(serviceTypesJSON) }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    await state.refresh()
    #expect(harness.serviceTypeRequests == 2)
    #expect(state.status == .success)
  }

  @Test func foregroundRefetchesOnlyStaleValuesOnScreen() async {
    let harness = QueryHarness { request in
      request.path == "catalog/serviceTypes" ? .ok(serviceTypesJSON) : .ok(#"{"timeZone":"America/Chicago"}"#)
    }
    let types = harness.serviceTypes()
    let zone = harness.queries.organizationTimeZone()
    await eventually { types.status == .success && zone.status == .success }
    #expect(zone.timeZone == "America/Chicago")

    harness.clock.advance(by: .seconds(11 * 60))
    zone.disappear()
    harness.queries.refetchStale()
    await eventually { types.status == .success && harness.serviceTypeRequests == 2 }
    #expect(harness.transport.requests(to: "catalog/organization").count == 1)
  }

  @Test func fetchReturnsAFreshCachedValueWithoutCalling() async throws {
    let harness = QueryHarness { _ in .ok(serviceTypesJSON) }
    let first = try await harness.queries.fetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    let second = try await harness.queries.fetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    #expect(first == second)
    #expect(harness.serviceTypeRequests == 1)
    #expect(harness.queries.value(for: .serviceTypes, as: [ServiceType].self)?.count == 2)
  }

  // MARK: - Retries and failures

  @Test func retriesATransientReadFailureOnce() async {
    let attempts = Recorder<Int>()
    let harness = QueryHarness { _ in
      attempts.append(attempts.count)
      return attempts.count == 1
        ? RPCResponse(status: 502, body: Data("<html></html>".utf8)) : .ok(serviceTypesJSON)
    }
    let state = harness.serviceTypes()
    await harness.clock.waitForSleepers()
    #expect(attempts.count == 1)
    harness.clock.advance(by: QueryClient.retryDelay)
    await eventually { state.status == .success }
    #expect(attempts.count == 2)
    #expect(harness.analytics.events.isEmpty)
  }

  @Test func neverRetriesClientErrorsAndReportsTheFailure() async {
    let harness = QueryHarness { _ in
      .orpcError(
        status: 429, code: "TOO_MANY_REQUESTS", message: "Too Many Requests",
        data: #"{"message":"Planning Center is busy right now.","service":"planning-center"}"#)
    }
    let state = harness.serviceTypes()
    await eventually { state.status == .failure }
    #expect(harness.serviceTypeRequests == 1)
    #expect(state.errorMessage == "Planning Center is busy right now.")
    #expect(harness.analytics.events == [.readFailed(.serviceTypes, errorCode: .tooManyRequests)])
    #expect(
      harness.analytics.events.first?.exception?.message
        == "Failed to load service-types (TOO_MANY_REQUESTS)")
  }

  @Test func doesNotReloadAJustFailedReadOnItsOwn() async {
    let harness = QueryHarness { _ in RPCResponse(status: 404, body: Data(#"{"error":"Not found"}"#.utf8)) }
    let state = harness.serviceTypes()
    await eventually { state.status == .failure }

    _ = harness.serviceTypes()
    state.appear()
    #expect(harness.serviceTypeRequests == 1)

    state.retry()
    await eventually { harness.serviceTypeRequests == 2 }

    await eventually { state.status == .failure }
    harness.clock.advance(by: QueryClient.failureCooldown)
    state.appear()
    await eventually { harness.serviceTypeRequests == 3 }
  }

  @Test func readsAreDisabledForLyricsRetries() {
    #expect(QueryFamily.lyricsSearch.policy.retries == false)
    #expect(QueryFamily.chordChartPdf.policy.staleTime == nil)
    #expect(QueryFamily.peopleSearch.policy.staleTime == .seconds(30))
  }

  // MARK: - Invalidation

  @Test func invalidationReloadsScreensShowingTheValueAndDefersTheRest() async {
    let harness = QueryHarness { _ in .ok(serviceTypesJSON) }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }

    harness.queries.invalidate(.family(.serviceTypes))
    await eventually { harness.serviceTypeRequests == 2 && state.status == .success }

    state.disappear()
    harness.queries.invalidate(.serviceTypes)
    #expect(harness.serviceTypeRequests == 2)
    state.appear()
    await eventually { harness.serviceTypeRequests == 3 }
  }

  @Test func filtersMatchFamiliesAndPrefixes() {
    let key = QueryKey.teamPositions(serviceTypeId: "1101", planId: "881")
    #expect(QueryFilter.family(.teamPositions).matches(key))
    #expect(QueryFilter.prefix(.teamPositions, ["1101"]).matches(key))
    #expect(!QueryFilter.prefix(.teamPositions, ["1102"]).matches(key))
    #expect(!QueryFilter.prefix(.planItems, ["1101"]).matches(key))
    #expect(QueryFilter.family(.teamPositions) { $0.parts.contains("881") }.matches(key))
    #expect(QueryFilter.key(key).matches(QueryKey.teamPositions(serviceTypeId: "1101", planId: "881")))
    #expect(key.description == #"["team-positions","1101","881"]"#)
    #expect(
      QueryKey.candidateDetails(dateKey: "d", historyPlanId: nil, personIds: ["1", "2"]).description
        == #"["people-candidate-details","d",null,"1","2"]"#)
  }

  // MARK: - Writes

  @Test func rollsBackOptimisticChangesWhenAWriteFails() async {
    let harness = QueryHarness { request in
      request.path == "catalog/serviceTypes"
        ? .ok(serviceTypesJSON)
        : .orpcError(
          status: 403, code: "FORBIDDEN", message: "Forbidden", data: #"{"message":"Demo is read-only."}"#)
    }
    let failures = Recorder<String>()
    harness.queries.errorSink = { failures.append($0.message) }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }

    let result = await harness.queries.write(
      RPC.PlanItems.delete, PlanItemsDeleteInput(serviceTypeId: "1", planId: "2", itemId: "3"),
      optimistic: { queries in
        let rollback = queries.mutate(.serviceTypes, as: [ServiceType].self) { $0.removeFirst() }
        #expect(state.value?.map(\.id) == ["2"])
        return rollback
      })
    #expect(result == nil)
    #expect(state.value?.map(\.id) == ["1", "2"])
    #expect(failures.values == ["Demo is read-only."])
  }

  @Test func performThrowsAndSkipsTheSinkForUnauthorized() async {
    let harness = QueryHarness { _ in
      .orpcError(status: 401, code: "UNAUTHORIZED", message: "Unauthorized")
    }
    let failures = Recorder<String>()
    harness.queries.errorSink = { failures.append($0.message) }
    let error = await #expect(throws: APIError.self) {
      _ = try await harness.queries.perform(
        RPC.PlanItems.delete, PlanItemsDeleteInput(serviceTypeId: "1", planId: "2", itemId: "3"))
    }
    #expect(error?.isUnauthorized == true)
    _ = await harness.queries.write(
      RPC.PlanItems.delete, PlanItemsDeleteInput(serviceTypeId: "1", planId: "2", itemId: "3"))
    #expect(failures.values.isEmpty)
  }

  @Test func optimisticPatchWinsOverALoadThatStartedBeforeIt() async {
    let gate = Gate()
    let harness = QueryHarness { _ in
      await gate.wait()
      return .ok(serviceTypesJSON)
    }
    harness.queries.setValue([ServiceType(id: "9", name: "Old", sequence: 1)], for: .serviceTypes)
    let state = harness.serviceTypes()
    #expect(harness.serviceTypeRequests == 0)  // A fresh value: nothing loads.
    harness.queries.invalidate(.serviceTypes)
    await eventually { harness.serviceTypeRequests == 1 }

    _ = harness.queries.mutate(.serviceTypes, as: [ServiceType].self) { $0[0].name = "Patched" }
    gate.open()
    await eventually { state.status == .success }
    try? await Task.sleep(for: .milliseconds(20))
    #expect(state.value?.first?.name == "Patched")
  }

  @Test func settlesWithOneRefetchAfterTheLastWrite() async {
    let harness = QueryHarness { request in
      request.path == "catalog/serviceTypes" ? .ok(serviceTypesJSON) : .ok(#"{"success":true}"#)
    }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    let input = PlanItemsDeleteInput(serviceTypeId: "1", planId: "2", itemId: "3")

    let first = await harness.queries.write(RPC.PlanItems.delete, input, settle: [.key(.serviceTypes)])
    #expect(first?.success == true)
    await harness.clock.waitForSleepers()
    harness.clock.advance(by: .seconds(2))
    _ = await harness.queries.write(RPC.PlanItems.delete, input, settle: [.key(.serviceTypes)])
    await eventually { harness.clock.sleeperCount == 1 }

    // The first write's timer was replaced: 2 s more is not enough.
    harness.clock.advance(by: .seconds(2))
    #expect(harness.serviceTypeRequests == 1)
    harness.clock.advance(by: .milliseconds(500))
    await eventually { harness.serviceTypeRequests == 2 }
  }

  // MARK: - Prefetch

  @Test func prefetchesSpeculativelyAndSkipsFreshValues() async {
    let harness = QueryHarness { _ in .ok(serviceTypesJSON) }
    harness.queries.prefetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    await eventually { harness.queries.value(for: .serviceTypes, as: [ServiceType].self) != nil }
    #expect(harness.transport.requests.first?.headers["x-pcobooster-priority"] == "speculative")

    harness.queries.prefetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    #expect(harness.serviceTypeRequests == 1)
  }

  @Test func aRejectedPrefetchDoesNotBlockTheScreen() async {
    let priorities = Recorder<String>()
    let harness = QueryHarness { request in
      let priority = request.headers["x-pcobooster-priority"] ?? "interactive"
      priorities.append(priority)
      return priority == "speculative"
        ? .orpcError(
          status: 429, code: "TOO_MANY_REQUESTS", message: "Too Many Requests",
          data: #"{"message":"Busy","service":"planning-center"}"#)
        : .ok(serviceTypesJSON)
    }
    harness.queries.prefetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    await eventually { priorities.count == 1 }
    try? await Task.sleep(for: .milliseconds(10))

    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    #expect(priorities.values == ["speculative", "interactive"])
    #expect(state.error == nil)
    #expect(harness.analytics.events.isEmpty)
  }

  @Test func aScreenPromotesAWaitingPrefetch() async {
    let schedulerClock = TestClock()
    let harness = QueryHarness(
      scheduler: RequestScheduler(quietPeriod: .milliseconds(250), clock: schedulerClock)
    ) { _ in .ok(serviceTypesJSON) }
    harness.queries.prefetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    await schedulerClock.waitForSleepers()
    #expect(harness.serviceTypeRequests == 0)

    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    #expect(harness.serviceTypeRequests == 1)
    #expect(harness.transport.requests.first?.headers["x-pcobooster-priority"] == nil)
  }

  @Test func cancellingAPrefetchDropsIt() async {
    let schedulerClock = TestClock()
    let harness = QueryHarness(
      scheduler: RequestScheduler(quietPeriod: .milliseconds(250), clock: schedulerClock)
    ) { _ in .ok(serviceTypesJSON) }
    let handle = harness.queries.prefetch(.serviceTypes, RPC.Catalog.serviceTypes, EmptyInput())
    await schedulerClock.waitForSleepers()
    handle.cancel()
    await eventually { schedulerClock.sleeperCount == 0 }
    schedulerClock.advance(by: .seconds(1))
    try? await Task.sleep(for: .milliseconds(20))
    #expect(harness.serviceTypeRequests == 0)
  }

  // MARK: - Persistence and scope

  @Test func restoresPersistedValuesOnTheNextLaunch() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let first = QueryHarness(cacheDirectory: directory) { _ in .ok(serviceTypesJSON) }
    let state = first.serviceTypes()
    await eventually { state.status == .success }
    await first.queries.flushPersistence()

    let gate = Gate()
    let second = QueryHarness(cacheDirectory: directory) { _ in
      await gate.wait()
      return .ok(serviceTypesJSON)
    }
    second.clock.advance(by: .seconds(30))
    let restored = second.serviceTypes()
    // Painted from disk in the same frame, with its save time, so it is still fresh.
    #expect(restored.value?.map(\.name) == ["Sunday Gathering", "Youth"])
    #expect(restored.updatedAt == first.clock.date)
    #expect(restored.status == .success)
    #expect(second.serviceTypeRequests == 0)
    gate.open()
  }

  @Test func persistedValuesRevalidateWhenStale() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let first = QueryHarness(cacheDirectory: directory) { _ in .ok(serviceTypesJSON) }
    let state = first.serviceTypes()
    await eventually { state.status == .success }
    await first.queries.flushPersistence()

    let second = QueryHarness(cacheDirectory: directory) { _ in .ok(#"[{"id":"3","name":"New","sequence":1}]"#) }
    second.clock.advance(by: .seconds(11 * 60))
    let restored = second.serviceTypes()
    #expect(restored.status == .refreshing)
    #expect(restored.value?.count == 2)
    await eventually { restored.value?.map(\.name) == ["New"] }
  }

  @Test func doesNotPersistFamiliesTheWebKeepsInMemory() async {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let first = QueryHarness(cacheDirectory: directory) { _ in .ok(#"{"status":"ok","version":"1"}"#) }
    let state = first.queries.query(.planTimes(serviceTypeId: "1", planId: "2"), RPC.health)
    await eventually { state.status == .success }
    await first.queries.flushPersistence()

    let second = QueryHarness(cacheDirectory: directory) { _ in .ok(#"{"status":"ok","version":"1"}"#) }
    #expect(second.queries.value(for: .planTimes(serviceTypeId: "1", planId: "2"), as: HealthOutput.self) == nil)
  }

  @Test func switchingScopeClearsMemoryAndDisk() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let scopeA = QueryScope.account(userID: "u1", planningCenterAccountID: "a1")
    let harness = QueryHarness(cacheDirectory: directory, scope: scopeA) { _ in .ok(serviceTypesJSON) }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    await harness.queries.flushPersistence()

    harness.queries.switchScope(.account(userID: "u1", planningCenterAccountID: "a2"))
    #expect(state.value == nil)
    #expect(state.status == .idle)
    await harness.queries.flushPersistence()

    let relaunched = QueryHarness(cacheDirectory: directory, scope: scopeA) { _ in .ok(serviceTypesJSON) }
    #expect(relaunched.queries.value(for: .serviceTypes, as: [ServiceType].self) == nil)
  }

  @Test func dropsAnswersForThePreviousScope() async {
    let gate = Gate()
    let harness = QueryHarness { _ in
      await gate.wait()
      return .ok(serviceTypesJSON)
    }
    let state = harness.serviceTypes()
    await eventually { harness.serviceTypeRequests == 1 }
    harness.queries.switchScope(.demo)
    gate.open()
    try? await Task.sleep(for: .milliseconds(20))
    #expect(state.value == nil)
    #expect(harness.queries.value(for: .serviceTypes, as: [ServiceType].self) == nil)
  }

  @Test func removeForgetsValuesAndReloadsScreens() async {
    let harness = QueryHarness { _ in .ok(serviceTypesJSON) }
    let state = harness.serviceTypes()
    await eventually { state.status == .success }
    harness.queries.remove(.family(.serviceTypes))
    #expect(state.status == .loading)
    await eventually { state.status == .success }
    #expect(harness.serviceTypeRequests == 2)
  }
}

struct OrganizationTimeZoneTests {
  @Test func prefersTheFirstValidZone() {
    #expect(OrganizationTimeZone.resolve("America/Chicago") == "America/Chicago")
    #expect(OrganizationTimeZone.resolve("Not/AZone", "Europe/London") == "Europe/London")
    #expect(OrganizationTimeZone.resolve("", nil) == "America/Los_Angeles")
    #expect(OrganizationTimeZone.resolve(nil) == OrganizationTimeZone.lastResort)
  }

  @Test @MainActor func resolvesFromTheAPIAndFallsBackToTheSavedZone() async {
    let ok = QueryHarness { _ in .ok(#"{"timeZone":"America/New_York"}"#) }
    #expect(await ok.queries.resolveOrganizationTimeZone() == "America/New_York")

    let failing = QueryHarness { _ in RPCResponse(status: 403, body: Data()) }
    failing.queries.setValue(OrganizationOutput(timeZone: "Pacific/Auckland"), for: .organizationTimeZone)
    failing.queries.invalidate(.organizationTimeZone)
    #expect(await failing.queries.resolveOrganizationTimeZone() == "Pacific/Auckland")

    let invalid = QueryHarness { _ in .ok(#"{"timeZone":"Mars/Olympus"}"#) }
    let state = invalid.queries.organizationTimeZone()
    await eventually { state.status == .success }
    #expect(state.timeZone == "America/Los_Angeles")
    #expect(state.loadedTimeZone == nil)
  }
}
