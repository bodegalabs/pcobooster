#if DEBUG
import Foundation
import PCOBoosterCore

/// Sample Planning Center permissions for previews, the Debug section's access previews, and
/// screenshots of the access review. The mock `access.me` fixture is an organization
/// administrator, so these stand in for the limited states.
///
/// `-PCOBAccessSample limited|viewer|none` replaces the account's permissions in the access
/// review, the account sheet's "Your access" row, and the review's automatic prompt (Debug
/// builds only; the rest of the app still reads the fixture).
enum AccessSample: String, CaseIterable, Identifiable {
  /// A Scheduler who leads two teams, can't search People, and can only open chord charts.
  case limited
  /// A Scheduled Viewer: sees only the plans they're on.
  case viewer
  /// No Services access at all.
  case none

  var id: String { rawValue }

  static let launchArgument = "PCOBAccessSample"

  /// The sample named by `-PCOBAccessSample`, if any.
  static var launchOverride: AccessSample? {
    UserDefaults.standard.string(forKey: launchArgument).flatMap(AccessSample.init(rawValue:))
  }

  var title: String {
    switch self {
    case .limited: "Scheduler who leads teams"
    case .viewer: "Scheduled Viewer"
    case .none: "No Services access"
    }
  }

  var snapshot: AccessSnapshot {
    switch self {
    case .limited:
      AccessSnapshot(
        services: .granted(
          ServicesAccessGranted(
            organizationAdministrator: false,
            planLevel: .scheduler,
            maxPlanLevel: .editor,
            songLevel: .viewer,
            canViewAllPeople: false,
            ledTeamCount: 2,
            serviceTypes: [
              ServicesAccessGrantedServiceType(id: "1101", name: "Sunday Gathering", level: .editor),
              ServicesAccessGrantedServiceType(id: "1102", name: "Youth Night", level: .scheduler),
              ServicesAccessGrantedServiceType(id: "1103", name: "Special Events", level: .viewer),
            ])),
        people: PeopleAccess(status: .none))
    case .viewer:
      AccessSnapshot(
        services: .granted(
          ServicesAccessGranted(
            organizationAdministrator: false,
            planLevel: .scheduledViewer,
            maxPlanLevel: .scheduledViewer,
            songLevel: .scheduledViewer,
            canViewAllPeople: false,
            ledTeamCount: 0,
            serviceTypes: [
              ServicesAccessGrantedServiceType(
                id: "1101", name: "Sunday Gathering", level: .scheduledViewer)
            ])),
        people: PeopleAccess(status: .none))
    case .none:
      AccessSnapshot(services: .none, people: PeopleAccess(status: .none))
    }
  }

  /// A review of this sample for one account, with every flag on.
  func review(accountID: String = "acct_sample") -> AccessReview {
    AccessReview(
      snapshot: snapshot, failed: false, enabled: [.people: true, .chordCharts: true],
      selectedAccountID: accountID, isDemo: false)
  }
}
#endif
