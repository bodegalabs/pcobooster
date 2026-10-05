import PCOBoosterCore
import SwiftUI

extension PeopleScreens.SignalLook {
  /// The signal's icon (the web's Lucide glyphs mapped to SF Symbols).
  var symbol: AppSymbol {
    switch self {
    case .waiting: .signalWaiting
    case .declining: .signalDeclining
    case .drifting: .signalDrifting
    case .overloaded: .signalOverloaded
    case .due: .signalDue
    case .notServing: .signalNotServing
    }
  }

  /// Waiting reads amber, strain reads red, fading reads blue, the rest stays quiet.
  var tone: StatusTone {
    switch self {
    case .waiting: .pending
    case .declining, .overloaded: .declined
    case .drifting: .info
    case .due, .notServing: .neutral
    }
  }
}

extension PersonSignal {
  var look: PeopleScreens.SignalLook { PeopleScreens.signalLook(self) }
  var text: PersonSignalText { TeamHealthEngine.describe(self) }
}

/// A person's signal as a quiet outlined chip: a tinted icon and a short label. VoiceOver
/// reads the sentence behind it too.
struct SignalChip: View {
  let signal: PersonSignal
  /// "+2" for further signals the row doesn't show.
  var extraCount = 0

  @Environment(\.displayScale) private var displayScale

  var body: some View {
    let look = signal.look
    let text = signal.text
    HStack(spacing: Spacing.xs) {
      look.symbol.image
        .imageScale(.small)
        .foregroundStyle(look.tone.textColor)
      Text(verbatim: text.label)
        .foregroundStyle(.ink)
      if extraCount > 0 {
        Text(verbatim: "+\(extraCount)")
          .foregroundStyle(.inkSecondary)
          .monospacedDigit()
      }
    }
    .font(.badgeLabel)
    .lineLimit(1)
    .fixedSize()
    .padding(.horizontal, Spacing.sm)
    .padding(.vertical, Spacing.xxs + 1)
    .overlay(Capsule().strokeBorder(.hairline, lineWidth: 1 / max(displayScale, 1)))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: text.label))
    .accessibilityValue(Text(verbatim: text.detail))
  }
}

/// Each signal as an icon, a label, and the sentence behind it (the web's `PersonSignalList`).
struct SignalList: View {
  let signals: [PersonSignal]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      ForEach(signals, id: \.kind) { signal in
        let look = signal.look
        let text = signal.text
        HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
          look.symbol.image
            .font(.body)
            .foregroundStyle(look.tone.textColor)
            .frame(width: 22)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(verbatim: text.label)
              .font(.rowTitleEmphasized)
              .foregroundStyle(.ink)
            Text(verbatim: text.detail)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .accessibilityElement(children: .combine)
      }
    }
  }
}
