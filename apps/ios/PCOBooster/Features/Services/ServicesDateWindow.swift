import Foundation
import PCOBoosterCore

/// Which plans the agenda lists: the web's upcoming windows (`DateRangeFilter`), plus recent
/// past plans, which the web reaches only by stepping back from a plan.
enum ServicesDateWindow: String, CaseIterable, Identifiable, Codable, Sendable {
  case next14Days
  case next30Days
  case next60Days
  case allUpcoming
  case recent

  /// The web's default window.
  static let `default`: Self = .next60Days

  static let upcoming: [Self] = [.next14Days, .next30Days, .next60Days, .allUpcoming]

  var id: String { rawValue }

  /// The upcoming filter this window applies; nil for recent plans.
  var range: DateRangeFilter? {
    switch self {
    case .next14Days: .next14Days
    case .next30Days: .next30Days
    case .next60Days: .next60Days
    case .allUpcoming: .all
    case .recent: nil
    }
  }

  var title: LocalizedStringResource {
    switch self {
    case .next14Days: "Next 14 days"
    case .next30Days: "Next 30 days"
    case .next60Days: "Next 60 days"
    case .allUpcoming: "All upcoming"
    case .recent: "Recent"
    }
  }
}
