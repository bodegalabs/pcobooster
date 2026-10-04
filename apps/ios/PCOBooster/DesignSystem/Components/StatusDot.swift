import SwiftUI

/// A small schedule status dot. Live dots pulse gently (opacity 1 to 0.72, scale 1 to 0.9 over
/// 2.4 s), and every dot on screen shares one phase because the pulse is computed from the clock,
/// like the web's negative animation delay. Reduce Motion, or `pulses: false`, keeps it still.
///
/// Pulse only dots that stand for live status (a roster's status column), not every avatar badge.
struct StatusDot: View {
  private let color: Color
  private let label: LocalizedStringResource?
  var size: CGFloat = Metrics.statusDot
  var pulses: Bool = true

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// `StatusDot(.confirmed)`.
  init(_ status: ScheduleStatus, size: CGFloat = Metrics.statusDot, pulses: Bool = true) {
    color = status.tone.color
    label = status.label
    self.size = size
    self.pulses = pulses
  }

  /// A dot in any tone, such as `StatusDot(tone: .info, label: "Also scheduled")`.
  init(tone: StatusTone, label: LocalizedStringResource? = nil, size: CGFloat = Metrics.statusDot, pulses: Bool = false) {
    color = tone.color
    self.label = label
    self.size = size
    self.pulses = pulses
  }

  var body: some View {
    Group {
      if pulses, !reduceMotion {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
          dot(phase: Self.phase(at: context.date))
        }
      } else {
        dot(phase: 0)
      }
    }
    .frame(width: size, height: size)
    .accessibilityElement()
    .accessibilityLabel(label.map { Text($0) } ?? Text(verbatim: ""))
    .accessibilityHidden(label == nil)
  }

  private func dot(phase: Double) -> some View {
    Circle()
      .fill(color)
      .scaleEffect(1 - 0.1 * phase)
      .opacity(1 - 0.28 * phase)
  }

  /// 0 at rest, 1 at the middle of the pulse, eased like CSS `ease-in-out` (a cosine is close).
  nonisolated static func phase(at date: Date) -> Double {
    let period = Motion.statusPulsePeriod
    let t = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
    return (1 - cos(t * 2 * .pi)) / 2
  }
}

#Preview("Status dots") {
  VStack(alignment: .leading, spacing: Spacing.md) {
    ForEach(ScheduleStatus.allCases) { status in
      HStack(spacing: Spacing.sm) {
        StatusDot(status)
        Text(status.label).font(.rowDetail)
      }
    }
    HStack(spacing: Spacing.sm) {
      StatusDot(tone: .info, label: "Also scheduled")
      Text("Also scheduled").font(.rowDetail)
    }
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
