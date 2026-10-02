import SwiftUI

/// Confirmed, then pending, over an empty track for open slots (the web's `FilledBar`). Shares
/// resize smoothly when counts change; their colors never animate.
struct OverviewStaffingBar: View {
  let confirmed: Int
  let pending: Int
  let total: Int
  var height: CGFloat = 8
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { proxy in
      let width = proxy.size.width
      HStack(spacing: 0) {
        Rectangle()
          .fill(.statusConfirmedBright)
          .frame(width: share(confirmed) * width)
        Rectangle()
          .fill(.statusPendingBright)
          .frame(width: share(pending) * width)
        Spacer(minLength: 0)
      }
      .animation(
        Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.4), instantWhenReduced: true),
        value: [confirmed, pending, total])
    }
    .frame(height: height)
    .background(.surfaceMuted)
    .clipShape(.capsule)
    .accessibilityHidden(true)
  }

  private func share(_ count: Int) -> CGFloat {
    total > 0 ? CGFloat(count) / CGFloat(total) : 0
  }
}

/// One count in the staffing legend: a colored dot, the number (rolling when it changes), and
/// what it counts.
struct OverviewStaffingCount: View {
  let count: Int
  let label: LocalizedStringKey
  let color: Color

  var body: some View {
    HStack(spacing: Spacing.xs + 2) {
      Circle()
        .fill(color)
        .frame(width: 8, height: 8)
      HStack(spacing: Spacing.xs) {
        CountText(count, font: .footnote.weight(.semibold).monospacedDigit())
          .foregroundStyle(.ink)
        Text(label)
          .font(.footnote)
          .foregroundStyle(.inkSecondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}
