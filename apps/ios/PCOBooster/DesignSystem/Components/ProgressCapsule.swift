import SwiftUI

/// A thin capsule bar for progressive loads and meters.
///
/// - Indeterminate (`value: nil`): the web's loading bar. It stays invisible for 200 ms so quick
///   refreshes are silent, then a 40% segment sweeps across every 1.1 s. Reduce Motion fades the
///   full bar in and out instead.
/// - Determinate: a filled track, for "availability for 32 of 120 people" or a fit score meter.
///
/// `ProgressCapsule(value: nil)`, `ProgressCapsule(completed: 32, total: 120, label: "Availability")`,
/// `ProgressCapsule(value: 0.94, tone: .confirmed)`.
struct ProgressCapsule: View {
  private let value: Double?
  private let tone: StatusTone?
  private let label: Text
  private let accessibilityValueText: Text?
  var thickness: CGFloat = Metrics.meterHeight

  @State private var isIndeterminateVisible = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// `value` from 0 to 1, or `nil` while the total is unknown. `tone` colors a meter fill;
  /// without one the fill is ink at 35% like the web's loading bar.
  init(value: Double?, tone: StatusTone? = nil, label: LocalizedStringKey = "Loading", thickness: CGFloat = Metrics.meterHeight) {
    self.value = value.map { min(max($0, 0), 1) }
    self.tone = tone
    self.label = Text(label)
    accessibilityValueText = value.map { Text($0, format: .percent.precision(.fractionLength(0))) }
    self.thickness = thickness
  }

  /// Progress through a known count, such as people whose availability has loaded.
  init(completed: Int, total: Int, label: LocalizedStringKey, thickness: CGFloat = Metrics.meterHeight) {
    let fraction = total > 0 ? Double(completed) / Double(total) : nil
    self.value = fraction.map { min(max($0, 0), 1) }
    tone = nil
    self.label = Text(label)
    accessibilityValueText = total > 0 ? Text("\(completed) of \(total)") : nil
    self.thickness = thickness
  }

  var body: some View {
    GeometryReader { proxy in
      let width = proxy.size.width
      ZStack(alignment: .leading) {
        if let value {
          Capsule().fill(trackColor)
          Capsule()
            .fill(fillColor)
            .frame(width: max(width * value, value > 0 ? thickness : 0))
        } else if isIndeterminateVisible {
          indeterminate(width: width)
        }
      }
      .animation(Motion.snappy(0.3), value: value)
    }
    .frame(height: thickness)
    .clipShape(.capsule)
    .task(id: value == nil) {
      guard value == nil else { return }
      try? await Task.sleep(for: .seconds(Motion.progressDelay))
      withAnimation(.easeOut(duration: Motion.revealDuration)) { isIndeterminateVisible = true }
    }
    .accessibilityElement()
    .accessibilityLabel(label)
    .accessibilityValue(accessibilityValueText ?? Text("In progress"))
    .accessibilityAddTraits(.updatesFrequently)
  }

  private var trackColor: Color {
    tone == nil ? Color.inkFill.opacity(0.08) : .surfaceMuted
  }

  private var fillColor: Color {
    tone?.meterColor ?? Color.inkFill.opacity(0.35)
  }

  @ViewBuilder private func indeterminate(width: CGFloat) -> some View {
    if reduceMotion {
      TimelineView(.animation(minimumInterval: 1.0 / 20)) { context in
        let t = context.date.timeIntervalSinceReferenceDate / Motion.progressSweepPeriod
        Capsule()
          .fill(fillColor)
          .opacity(0.35 + 0.65 * (1 - cos(t * .pi)) / 2)
      }
    } else {
      TimelineView(.animation(minimumInterval: 1.0 / 60)) { context in
        let segment = width * 0.4
        let progress = Self.sweepProgress(at: context.date)
        // From one segment left of the track to 1.5 track widths right (web translateX -100% to 250%).
        Capsule()
          .fill(fillColor)
          .frame(width: segment)
          .offset(x: -segment + progress * segment * 3.5)
      }
    }
  }

  nonisolated static let sweepCurve = UnitCurve.bezier(
    startControlPoint: UnitPoint(x: 0.65, y: 0),
    endControlPoint: UnitPoint(x: 0.35, y: 1)
  )

  nonisolated static func sweepProgress(at date: Date) -> Double {
    let period = Motion.progressSweepPeriod
    let t = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
    return sweepCurve.value(at: t)
  }
}

#Preview("Progress capsules") {
  VStack(alignment: .leading, spacing: Spacing.lg) {
    ProgressCapsule(value: nil, thickness: 2)
    ProgressCapsule(completed: 32, total: 120, label: "Availability")
    ProgressCapsule(value: 0.94, tone: .confirmed)
    ProgressCapsule(value: 0.62, tone: .pending)
    ProgressCapsule(value: 0.06, tone: .declined)
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
