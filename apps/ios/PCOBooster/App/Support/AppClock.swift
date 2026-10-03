import Foundation

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

