import Foundation
import PCOBoosterCore
import Testing

/// The generated `RPC` table mirrors the contract router: router-key paths, and `hasInput`
/// false exactly for the procedures declared without `.input()`.
struct ProcedureDescriptorTests {
  @Test func pathsAreRouterKeys() {
    #expect(RPC.health.path == "health")
    #expect(RPC.People.positionCandidates.path == "people/positionCandidates")
    #expect(RPC.PlanTimes.delete.path == "planTimes/delete")
    #expect(RPC.ChordCharts.lyricsSearch.path == "chordCharts/lyricsSearch")
  }

  @Test func onlyProceduresWithoutAnInputSendAnEmptyBody() {
    #expect(RPC.Features.status.hasInput == false)
    #expect(RPC.People.dashboardRoster.hasInput == false)
    #expect(RPC.Songs.library.hasInput == false)
    #expect(RPC.Access.me.hasInput == true)
    #expect(RPC.Session.status.hasInput == true)
  }

  @Test func listsEveryProcedureOnce() {
    #expect(RPC.allPaths.count == 49)
    #expect(Set(RPC.allPaths).count == RPC.allPaths.count)
  }

  @Test func typesMatchTheContracts() {
    let plan: Procedure<PlanInput, Plan?> = RPC.Catalog.plan
    let delete: Procedure<PlanTimesDeleteInput, EmptyOutput> = RPC.PlanTimes.delete
    let features: Procedure<EmptyInput, EnabledFeatures> = RPC.Features.status
    #expect(plan.path == "catalog/plan")
    #expect(delete.path == "planTimes/delete")
    #expect(features.path == "features/status")
  }

  @Test func errorCodesDecodeTolerantly() throws {
    #expect(try GeneratedModelJSON.decode(ContractErrorCode.self, #""NOT_FOUND""#) == .notFound)
    #expect(
      try GeneratedModelJSON.decode(ContractErrorCode.self, #""METHOD_NOT_SUPPORTED""#)
        == .unknown("METHOD_NOT_SUPPORTED"))
    #expect(ContractErrorCode.tooManyRequests.rawValue == "TOO_MANY_REQUESTS")
  }
}
