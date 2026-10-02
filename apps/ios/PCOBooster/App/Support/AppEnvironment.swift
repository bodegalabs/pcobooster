import Foundation
import PCOBoosterCore
import SwiftUI

/// The app's notion of "now". Use it instead of `Date()` for anything labeled relative to today
/// ("This Sunday", "In 3 days", "2w ago"), so `-PCOBFixedNow YES` screenshots line up with the
/// mock fixtures. Read it from `app.clock` or `@Environment(\.appClock)`.
struct AppClock: Sendable {
  private let fixed: Date?

  nonisolated var now: Date { fixed ?? Date() }

  nonisolated static let live = AppClock(fixed: nil)

  nonisolated static func fixed(_ date: Date) -> AppClock {
    AppClock(fixed: date)
  }

  nonisolated private init(fixed: Date?) {
    self.fixed = fixed
  }
}

extension EnvironmentValues {
  /// The congregation's IANA zone (`catalog.organization`, validated; the saved zone on a cold
  /// launch; `America/Los_Angeles` only before any zone has loaded). Label every congregation
  /// date with it, never the device zone: `OrgCalendar.label(date, timeZone: timeZone, style:)`.
  @Entry var orgTimeZone: String = OrganizationTimeZone.lastResort

  /// See `AppClock`.
  @Entry var appClock: AppClock = .live
}

/// The appearance override from the account sheet, applied to the window.
enum AppAppearance: String, CaseIterable, Identifiable, Sendable {
  case system
  case light
  case dark

  /// `UserDefaults` key; `-PCOBAppearance light|dark` overrides it for one launch.
  static let defaultsKey = "PCOBAppearance"

  var id: String { rawValue }

  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  var title: LocalizedStringResource {
    switch self {
    case .system: "System"
    case .light: "Light"
    case .dark: "Dark"
    }
  }

  var symbol: AppSymbol {
    switch self {
    case .system: .appearanceSystem
    case .light: .appearanceLight
    case .dark: .appearanceDark
    }
  }
}

/// Public pages the app links to. They open in the in-app browser.
enum ExternalLink {
  static let website = URL(string: "https://pcobooster.com")!
  static let privacy = URL(string: "https://pcobooster.com/privacy")!
  static let terms = URL(string: "https://pcobooster.com/terms")!
}
