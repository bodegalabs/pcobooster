import Foundation
import PCOBoosterCore
import Testing

/// Replays `access.*` from scripts/parity/access.parity.ts: feature availability, service
/// type abilities, the flag filter, the access review prompt, plan view notices, and chord
/// chart edit access.
struct AccessParityTests {
  struct Constants: Decodable, Sendable {
    struct Feature: Decodable, Sendable {
      let feature: AppFeature
      let label: String
    }

    let levels: [ServicesPermissionLevel]
    let features: [Feature]
    let accessReviewDismissalsKey: String
  }

  @Test(arguments: Parity.cases("access.constants", Int?.self, Constants.self))
  func constants(_ c: ParityCase<Int?, Constants>) {
    #expect(ServicesPermissionLevel.allCases == c.output.levels)
    #expect(ServicesPermissionLevel.allCases.map(\.rank) == (0..<6).map { Optional($0) })
    #expect(AppFeature.allCases == c.output.features.map(\.feature))
    #expect(AppFeature.allCases.map(\.label) == c.output.features.map(\.label))
    #expect(accessReviewDismissalsKey == c.output.accessReviewDismissalsKey)
  }

  struct LevelInput: Decodable, Sendable {
    let level: ServicesPermissionLevel?
    let minimum: ServicesPermissionLevel
  }

  @Test(arguments: Parity.cases("access.hasServicesLevel", LevelInput.self, Bool.self))
  func hasServicesLevel(_ c: ParityCase<LevelInput, Bool>) {
    #expect(PCOBoosterCore.hasServicesLevel(c.input.level, atLeast: c.input.minimum) == c.output)
  }

  struct DeriveOutput: Decodable, Sendable {
    struct ServiceType: Decodable, Sendable {
      let serviceTypeId: String
      let abilities: ServiceTypeAbilities
      let level: ServicesPermissionLevel?
    }

    let features: [FeatureAccess]
    let restricted: Bool
    let serviceTypes: [ServiceType]
  }

  @Test(
    arguments: Parity.cases("access.deriveFeatureAccess", AccessSnapshot.self, DeriveOutput.self))
  func deriveFeatureAccess(_ c: ParityCase<AccessSnapshot, DeriveOutput>) {
    let features = PCOBoosterCore.deriveFeatureAccess(c.input)
    #expect(features == c.output.features)
    #expect(hasRestrictedAccess(features) == c.output.restricted)
    for expected in c.output.serviceTypes {
      let id = expected.serviceTypeId
      #expect(serviceTypeAbilities(c.input, serviceTypeId: id) == expected.abilities, "\(id)")
      if case .granted(let services) = c.input.services {
        #expect(serviceTypeLevel(services, serviceTypeId: id) == expected.level, "\(id)")
      }
    }
  }

  struct VisibleInput: Decodable, Sendable {
    let features: [FeatureAccess]
    let enabled: EnabledFeatures?
  }

  @Test(
    arguments: Parity.cases(
      "access.visibleFeatureAccess", VisibleInput.self, [FeatureAccess].self))
  func visibleFeatureAccess(_ c: ParityCase<VisibleInput, [FeatureAccess]>) {
    #expect(
      PCOBoosterCore.visibleFeatureAccess(c.input.features, enabled: c.input.enabled) == c.output)
  }

  struct FingerprintOutput: Decodable, Sendable {
    let fingerprint: String
    let restricted: Bool
  }

  @Test(
    arguments: Parity.cases(
      "access.accessFingerprint", [FeatureAccess].self, FingerprintOutput.self))
  func accessFingerprint(_ c: ParityCase<[FeatureAccess], FingerprintOutput>) {
    #expect(PCOBoosterCore.accessFingerprint(c.input) == c.output.fingerprint)
    #expect(hasRestrictedAccess(c.input) == c.output.restricted)
  }

  struct PromptInput: Decodable, Sendable {
    let features: [FeatureAccess]
    let accountId: String
    let dismissals: [String: String]
  }

  @Test(
    arguments: Parity.cases("access.shouldPromptAccessReview", PromptInput.self, Bool.self))
  func shouldPromptAccessReview(_ c: ParityCase<PromptInput, Bool>) {
    let prompted = PCOBoosterCore.shouldPromptAccessReview(
      features: c.input.features, accountId: c.input.accountId, dismissals: c.input.dismissals)
    #expect(prompted == c.output)
  }

  struct RecordInput: Decodable, Sendable {
    let dismissals: [String: String]
    let accountId: String
    let fingerprint: String
  }

  @Test(
    arguments: Parity.cases(
      "access.recordAccessReviewDismissal", RecordInput.self, [String: String].self))
  func recordAccessReviewDismissal(_ c: ParityCase<RecordInput, [String: String]>) {
    let recorded = PCOBoosterCore.recordAccessReviewDismissal(
      c.input.dismissals, accountId: c.input.accountId, fingerprint: c.input.fingerprint)
    #expect(recorded == c.output)
  }

  struct PlanAccessInput: Decodable, Sendable {
    let view: PlanView
    let abilities: ServiceTypeAbilities
  }

  @Test(
    arguments: Parity.cases(
      "access.planAccessMessage", PlanAccessInput.self, PlanAccessMessage?.self))
  func planAccessMessage(_ c: ParityCase<PlanAccessInput, PlanAccessMessage?>) {
    #expect(
      PCOBoosterCore.planAccessMessage(view: c.input.view, abilities: c.input.abilities)
        == c.output)
  }

  struct EditAccessInput: Decodable, Sendable {
    let snapshot: AccessSnapshot?
    let demo: Bool
  }

  @Test(
    arguments: Parity.cases(
      "access.chordChartEditAccess", EditAccessInput.self, ChordChartEditAccess.self))
  func chordChartEditAccess(_ c: ParityCase<EditAccessInput, ChordChartEditAccess>) {
    let access = PCOBoosterCore.chordChartEditAccess(c.input.snapshot, demo: c.input.demo)
    #expect(access == c.output)
    #expect(access.canEdit == (c.output.reason == nil))
  }
}
