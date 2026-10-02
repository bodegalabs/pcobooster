import SwiftUI

/// A compact status chip: "Confirmed", "You're on", "Limited", "Presenting", "Declined".
/// `.tinted` is text-safe tone on a soft tone fill (the web's `/12` chips); `.plain` is small
/// caps tone text with no fill, for row trailing labels such as "DECLINED"; `.dot` leads with a
/// status dot on a quiet fill. Keep badges rare: one per row at most (low-noise rule).
struct StatusBadge: View {
  enum Style: Hashable, Sendable {
    case tinted
    case plain
    case dot
  }

  private let title: Text
  private let tone: StatusTone
  private let symbol: AppSymbol?
  private let style: Style

  /// `StatusBadge("You're on", tone: .confirmed)`.
  init(_ title: LocalizedStringKey, tone: StatusTone, symbol: AppSymbol? = nil, style: Style = .tinted) {
    self.title = Text(title)
    self.tone = tone
    self.symbol = symbol
    self.style = style
  }

  /// `StatusBadge(status: .declined, style: .plain)`.
  init(status: ScheduleStatus, style: Style = .tinted) {
    title = Text(status.label)
    tone = status.tone
    symbol = nil
    self.style = style
  }

  var body: some View {
    switch style {
    case .tinted:
      label
        .foregroundStyle(tone.textColor)
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xxs + 1)
        .background(tone.fillColor, in: .capsule)
    case .plain:
      label
        .textCase(.uppercase)
        .tracking(0.6)
        .font(.capsLabel)
        .foregroundStyle(tone.textColor)
    case .dot:
      HStack(spacing: Spacing.xs + 1) {
        StatusDot(tone: tone, size: 7)
        title
      }
      .font(.badgeLabel)
      .foregroundStyle(.ink)
      .padding(.horizontal, Spacing.sm)
      .padding(.vertical, Spacing.xxs + 1)
      .background(.surfaceMuted, in: .capsule)
    }
  }

  private var label: some View {
    HStack(spacing: Spacing.xs) {
      if let symbol {
        symbol.image.imageScale(.small)
      }
      title
    }
    .font(.badgeLabel)
    .lineLimit(1)
  }
}

#Preview("Status badges") {
  VStack(alignment: .leading, spacing: Spacing.md) {
    HStack {
      ForEach(ScheduleStatus.allCases) { StatusBadge(status: $0) }
    }
    HStack {
      StatusBadge("You're on", tone: .confirmed)
      StatusBadge("Limited", tone: .pending, symbol: .accessLimited)
      StatusBadge("Not notified", tone: .neutral, symbol: .mail)
    }
    HStack {
      StatusBadge(status: .declined, style: .plain)
      StatusBadge("Presenting", tone: .pending, style: .dot)
    }
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
