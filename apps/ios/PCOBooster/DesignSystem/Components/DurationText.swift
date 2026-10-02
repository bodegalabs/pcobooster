import SwiftUI

/// A length of time in tabular digits, formatted like the web, with a spoken VoiceOver label.
/// Durations are elapsed time, so no time zone is involved.
///
/// - `.itemLength`: plan item lengths, "45s" under a minute, then "4:30" (web `formatLength`).
/// - `.total`: totals, "4:30" or "1:05:30" (web `formatDuration`).
///
/// Zero or negative values render nothing, as on the web. `DurationText(seconds: 270)`.
struct DurationText: View {
  enum Style: Hashable, Sendable {
    case itemLength
    case total
  }

  let seconds: Int
  var style: Style = .itemLength

  init(seconds: Int, style: Style = .itemLength) {
    self.seconds = seconds
    self.style = style
  }

  var body: some View {
    if let text = Self.format(seconds: seconds, style: style) {
      Text(verbatim: text)
        .monospacedDigit()
        .accessibilityLabel(Text(Duration.seconds(seconds), format: .units(allowed: [.hours, .minutes, .seconds], width: .wide)))
    }
  }

  nonisolated static func format(seconds: Int, style: Style) -> String? {
    guard seconds > 0 else { return nil }
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    let rest = seconds % 60
    let paddedSeconds = rest < 10 ? "0\(rest)" : "\(rest)"
    switch style {
    case .itemLength:
      let totalMinutes = seconds / 60
      return totalMinutes == 0 ? "\(rest)s" : "\(totalMinutes):\(paddedSeconds)"
    case .total:
      guard hours > 0 else { return "\(minutes):\(paddedSeconds)" }
      let paddedMinutes = minutes < 10 ? "0\(minutes)" : "\(minutes)"
      return "\(hours):\(paddedMinutes):\(paddedSeconds)"
    }
  }
}

#Preview("Durations") {
  VStack(alignment: .leading, spacing: Spacing.sm) {
    DurationText(seconds: 45)
    DurationText(seconds: 270)
    DurationText(seconds: 3930, style: .total)
  }
  .font(.rowDetail)
  .foregroundStyle(.inkSecondary)
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
