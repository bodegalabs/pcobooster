import Foundation
import PCOBoosterCore

/// Debug launch arguments that start the People tab in a known state, for UI tests and
/// screenshots (Release builds ignore them):
///
/// - `-PCOBPeopleView health|month` picks the dashboard view.
/// - `-PCOBPeopleScope mine|all|team:<id>` picks the scope.
///
/// Each applies once per launch, as if the viewer had chosen it, so later choices in the same
/// launch still stick. They use their own keys rather than the saved ones because a launch
/// argument shadows `UserDefaults` for the whole process.
@MainActor
enum PeopleLaunchOverrides {
  #if DEBUG
    private static var appliedView = false
    private static var appliedScope = false
  #endif

  /// The dashboard view to start in, the first time it is asked.
  static func takeView() -> PeopleDashboardMode? {
    #if DEBUG
      guard !appliedView else { return nil }
      appliedView = true
      return UserDefaults.standard.string(forKey: "PCOBPeopleView").flatMap(
        PeopleDashboardMode.init(rawValue:))
    #else
      return nil
    #endif
  }

  /// The scope to start in, the first time it is asked.
  static func takeScope() -> PeopleDashboardScope? {
    #if DEBUG
      guard !appliedScope else { return nil }
      appliedScope = true
      return UserDefaults.standard.string(forKey: "PCOBPeopleScope").flatMap(
        PeopleDashboardScope.init(rawValue:))
    #else
      return nil
    #endif
  }
}
