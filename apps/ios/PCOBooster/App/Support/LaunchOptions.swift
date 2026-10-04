import Foundation
import PCOBoosterCore

/// Debug launch arguments for simulator screenshots, UI tests, and quick checks. Release builds
/// ignore every one of them. They arrive through `UserDefaults`' argument domain, so each is
/// passed as `-Key value`:
///
/// | Argument | Effect |
/// | --- | --- |
/// | `-PCOBMock YES` | Fixtures through `MockTransport`, signed in as the fixture worship pastor. |
/// | `-PCOBMockSession signedIn\|signedOut\|expired\|demo` | The mock session to start in (default `signedIn`). |
/// | `-PCOBMockLatency <ms>` | Mock reply delay (default 250). |
/// | `-PCOBFeatures all\|none\|people\|songs` | Overrides `features.status` in mock mode. |
/// | `-PCOBFixedNow YES` | Pins the mock data and the app clock to `MockFixtures.anchorNow`. |
/// | `-PCOBRoute <path>` | Opens an `AppLink` path at launch (`/services/1101/plans/881261004/lineup`). |
/// | `-PCOBTab services\|people\|songs\|search` | Selects a tab at launch. |
/// | `-PCOBAppearance light\|dark` | Forces the appearance for this launch. |
/// | `-PCOBGallery YES` | Shows the design system gallery instead of the app. |
/// | `-PCOBOffline YES` | Shows the offline banner (requests still go out). |
struct LaunchOptions: Sendable, Equatable {
  enum MockSession: String, Sendable {
    case signedIn
    case signedOut
    case expired
    case demo
  }

  enum FeatureOverride: String, Sendable {
    case all
    case none
    case people
    case songs

    var features: EnabledFeatures {
      switch self {
      case .all: [.people: true, .chordCharts: true]
      case .none: [.people: false, .chordCharts: false]
      case .people: [.people: true, .chordCharts: false]
      case .songs: [.people: false, .chordCharts: true]
      }
    }
  }

  var mockSession: MockSession = .signedIn
  var mockLatency: Duration = .milliseconds(250)
  var features: FeatureOverride?
  var fixedNow = false
  var route: String?
  var tab: AppTab?
  var appearance: AppAppearance?
  var showsGallery = false
  var simulatesOffline = false

  static let none = LaunchOptions()

  /// The options for this process; `.none` in Release.
  static func current(defaults: UserDefaults = .standard) -> LaunchOptions {
    #if DEBUG
    var options = LaunchOptions()
    if let session = defaults.string(forKey: "PCOBMockSession").flatMap(MockSession.init) {
      options.mockSession = session
    }
    if defaults.object(forKey: "PCOBMockLatency") != nil {
      options.mockLatency = .milliseconds(max(0, defaults.integer(forKey: "PCOBMockLatency")))
    }
    options.features = defaults.string(forKey: "PCOBFeatures").flatMap(FeatureOverride.init)
    options.fixedNow = defaults.bool(forKey: "PCOBFixedNow")
    options.route = defaults.string(forKey: "PCOBRoute").flatMap { $0.isEmpty ? nil : $0 }
    options.tab = defaults.string(forKey: "PCOBTab").flatMap(AppTab.init)
    // Read from the argument domain only, so the stored appearance choice is not mistaken for a
    // launch override.
    let arguments = defaults.volatileDomain(forName: UserDefaults.argumentDomain)
    options.appearance = (arguments[AppAppearance.defaultsKey] as? String).flatMap(AppAppearance.init)
    options.showsGallery = defaults.bool(forKey: "PCOBGallery")
    options.simulatesOffline = defaults.bool(forKey: "PCOBOffline")
    return options
    #else
    return .none
    #endif
  }
}
