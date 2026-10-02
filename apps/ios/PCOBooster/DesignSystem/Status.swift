import SwiftUI

/// A semantic color family for badges, meters, and icons. Each tone has a dot or fill color,
/// a text-safe color, a bright meter color, and a soft chip fill, all from the token catalog.
enum StatusTone: Hashable, Sendable, CaseIterable {
  /// Good: confirmed, "You're on", fit 80 and up.
  case confirmed
  /// Needs attention: pending replies, "Limited" access, "Presenting", fit 50 to 79.
  case pending
  /// Bad: declined, open slots, strain, fit under 50.
  case declined
  /// Informational blue: also scheduled elsewhere on the plan, drifting.
  case info
  /// Quiet gray: not notified yet, not serving, due for a slot.
  case neutral

  /// Dots, icons, and outlines.
  nonisolated var color: Color {
    switch self {
    case .confirmed: .statusConfirmed
    case .pending: .statusPending
    case .declined: .statusDeclined
    case .info: .statusInfo
    case .neutral: .inkSecondary
    }
  }

  /// Text that meets 4.5:1 on the canvas and on cards in both appearances.
  nonisolated var textColor: Color {
    switch self {
    case .confirmed: .statusConfirmedText
    case .pending: .statusPendingText
    case .declined: .statusDeclinedText
    case .info: .statusInfoText
    case .neutral: .inkSecondary
    }
  }

  /// Meter and score-bar fills.
  nonisolated var meterColor: Color {
    switch self {
    case .confirmed: .statusConfirmedBright
    case .pending: .statusPendingBright
    case .declined: .statusDeclinedBright
    case .info: .statusInfo
    case .neutral: Color.inkFill.opacity(0.7)
    }
  }

  /// The soft chip fill behind `textColor` (the web's `/12` tint).
  nonisolated var fillColor: Color {
    switch self {
    case .neutral: .surfaceMuted
    default: color.opacity(0.13)
    }
  }
}

/// A person's schedule status on a plan, as the product names it. Planning Center codes:
/// `C` confirmed, `U` unconfirmed (shown as "Pending"; the web token calls it "scheduled"),
/// `D` declined (also "removed"). Map API models to this in feature code.
enum ScheduleStatus: String, Hashable, Sendable, CaseIterable, Identifiable {
  case confirmed
  case pending
  case declined

  nonisolated var id: String { rawValue }

  nonisolated var label: LocalizedStringResource {
    switch self {
    case .confirmed: "Confirmed"
    case .pending: "Pending"
    case .declined: "Declined"
    }
  }

  nonisolated var tone: StatusTone {
    switch self {
    case .confirmed: .confirmed
    case .pending: .pending
    case .declined: .declined
    }
  }

  /// Menu and swipe-action symbol for setting this status.
  nonisolated var symbol: AppSymbol {
    switch self {
    case .confirmed: .statusConfirmed
    case .pending: .statusPending
    case .declined: .statusDeclined
    }
  }
}
