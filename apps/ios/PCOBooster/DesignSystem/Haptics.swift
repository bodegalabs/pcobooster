import SwiftUI

/// The product's haptic vocabulary (the web has none). Success feedback replaces success toasts.
enum Haptic: Hashable, Sendable {
  /// An assignment was added or confirmed; a write finished.
  case success
  /// A status changed or a segment or plan view was switched.
  case selection
  /// A reorder drop, a rocket tap, a small physical moment.
  case tap
  /// A decline, or an action that needs a second look.
  case warning
  /// A write failed (error toasts play this themselves).
  case error

  nonisolated var feedback: SensoryFeedback {
    switch self {
    case .success: .success
    case .selection: .selection
    case .tap: .impact(weight: .light)
    case .warning: .warning
    case .error: .error
    }
  }
}

extension View {
  /// Plays `haptic` whenever `trigger` changes. `.haptic(.success, trigger: assignedCount)`.
  func haptic(_ haptic: Haptic, trigger: some Equatable) -> some View {
    sensoryFeedback(haptic.feedback, trigger: trigger)
  }

  /// Plays `haptic` when `trigger` changes and `condition(old, new)` holds.
  /// `.haptic(.success, trigger: isSaved) { _, saved in saved }`.
  func haptic<T: Equatable>(
    _ haptic: Haptic,
    trigger: T,
    condition: @escaping (T, T) -> Bool
  ) -> some View {
    sensoryFeedback(haptic.feedback, trigger: trigger, condition: condition)
  }
}
