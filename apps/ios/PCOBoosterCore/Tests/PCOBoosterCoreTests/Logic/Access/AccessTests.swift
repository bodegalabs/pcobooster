import Foundation
import PCOBoosterCore
import Testing

/// Access behavior the parity fixtures can't pin: values only a newer API can send (an
/// unknown level or Services status), which the TypeScript contract never produces.
struct AccessTests {
  static func granted(
    planLevel: ServicesPermissionLevel? = .viewer,
    songLevel: ServicesPermissionLevel? = .viewer,
    serviceTypes: [ServicesAccessGrantedServiceType] = []
  ) -> AccessSnapshot {
    AccessSnapshot(
      services: .granted(
        ServicesAccessGranted(
          organizationAdministrator: false, planLevel: planLevel, maxPlanLevel: planLevel,
          songLevel: songLevel, canViewAllPeople: false, ledTeamCount: 1,
          serviceTypes: serviceTypes)),
      people: PeopleAccess(status: .granted))
  }

  @Test func unknownLevelsNeverQualify() {
    let owner = ServicesPermissionLevel(rawValue: "Owner")
    #expect(owner.rank == nil)
    #expect(!hasServicesLevel(owner, atLeast: .archived))
    #expect(!hasServicesLevel(nil, atLeast: .archived))
    #expect(!hasServicesLevel(.administrator, atLeast: owner))
    #expect(hasServicesLevel(.editor, atLeast: .scheduler))
  }

  @Test func anUnknownServiceTypeLevelFallsBackLikeAMissingOne() throws {
    let access = Self.granted(
      planLevel: .editor,
      serviceTypes: [
        ServicesAccessGrantedServiceType(
          id: "sunday", name: "Sunday", level: ServicesPermissionLevel(rawValue: "Owner"))
      ])
    guard case .granted(let services) = access.services else {
      Issue.record("Expected granted Services")
      return
    }
    #expect(serviceTypeLevel(services, serviceTypeId: "sunday") == .editor)
    let abilities = try #require(serviceTypeAbilities(access, serviceTypeId: "sunday"))
    #expect(abilities.editPlans)
  }

  @Test func anUnknownSongLevelLeavesChordChartsEditable() {
    let access = Self.granted(songLevel: ServicesPermissionLevel(rawValue: "Owner"))
    #expect(chordChartEditAccess(access, demo: false) == .editable)
    #expect(chordChartEditAccess(Self.granted(songLevel: .viewer), demo: false).canEdit == false)
  }

  @Test func anUnknownServicesStatusReadsAsNotYetKnown() {
    let access = AccessSnapshot(
      services: .unknown("suspended"), people: PeopleAccess(status: .granted))
    #expect(deriveFeatureAccess(access).isEmpty)
    #expect(serviceTypeAbilities(access, serviceTypeId: "sunday") == nil)
    #expect(chordChartEditAccess(access, demo: false) == .editable)
    #expect(!shouldPromptAccessReview(features: [], accountId: "a", dismissals: [:]))
  }

  @Test func anUnknownAbilityLevelReadsAsLimited() {
    let abilities = ServiceTypeAbilities(
      level: ServicesPermissionLevel(rawValue: "Owner"), scheduleAllTeams: false,
      scheduleLedTeams: false, editPlans: false)
    #expect(
      planAccessMessage(view: .plan, abilities: abilities)?.description
        == "Your Planning Center access here is limited. Editing the run sheet needs Editor.")
  }

  @Test func availabilityKeepsTheWebsWireNames() throws {
    #expect(FeatureAvailability.unavailable.rawValue == "none")
    let entry = FeatureAccess(
      feature: .songs, label: "Chord charts", availability: .unavailable, detail: "", ask: nil)
    let json = String(decoding: try JSONEncoder().encode(entry), as: UTF8.self)
    #expect(json.contains("\"availability\":\"none\""))
    #expect(json.contains("\"ask\":null"))
    #expect(try JSONDecoder().decode(FeatureAccess.self, from: Data(json.utf8)) == entry)
  }

  @Test func editAccessEncodesLikeTheWeb() throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    let editable = String(
      decoding: try encoder.encode(ChordChartEditAccess.editable), as: UTF8.self)
    #expect(editable == "{\"canEdit\":true}")
    let viewOnly = ChordChartEditAccess.viewOnly(reason: "No.")
    let data = try encoder.encode(viewOnly)
    #expect(String(decoding: data, as: UTF8.self) == "{\"canEdit\":false,\"reason\":\"No.\"}")
    #expect(try JSONDecoder().decode(ChordChartEditAccess.self, from: data) == viewOnly)
  }

  @Test func dismissalsRecordPerAccount() {
    let features = [
      FeatureAccess(
        feature: .plans, label: "See plans", availability: .limited, detail: "", ask: nil)
    ]
    let fingerprint = accessFingerprint(features)
    #expect(fingerprint == "plans:limited")
    let dismissals = recordAccessReviewDismissal([:], accountId: "a", fingerprint: fingerprint)
    #expect(!shouldPromptAccessReview(features: features, accountId: "a", dismissals: dismissals))
    #expect(shouldPromptAccessReview(features: features, accountId: "b", dismissals: dismissals))
  }

  @Test func flaggedFeaturesNameTheirFlags() {
    #expect(AppFeature.peopleDashboard.featureFlag == .people)
    #expect(AppFeature.songs.featureFlag == .chordCharts)
    #expect(AppFeature.plans.featureFlag == nil)
  }

  @Test func aFlagMissingFromAnOlderAPIHidesItsFeature() {
    let features = deriveFeatureAccess(Self.granted())
    let visible = visibleFeatureAccess(features, enabled: [.people: true])
    #expect(
      visible.map(\.feature) == [
        .plans, .scheduling, .planEditing, .peopleSearch, .peopleDashboard,
      ])
    #expect(visibleFeatureAccess(features, enabled: [:]).count == 4)
  }
}
