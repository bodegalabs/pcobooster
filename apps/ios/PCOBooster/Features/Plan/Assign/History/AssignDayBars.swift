import PCOBoosterCore
import SwiftUI

/// Someone's days around this plan as thin bars sharing the row's width (`AssignDayBars`): a
/// tall colored bar for a service (green confirmed, amber pending), a short darker bar for a
/// rehearsal only, a short quiet bar for a free day. The plan's day sits in the middle in a
/// dashed frame, with dates every week (every other week when narrow). Bars grow in from the
/// plan day outward. Tapping near a busy day shows what's on it.
struct AssignDayBars: View {
  let days: [ScheduleDay]
  /// Taller bars for the detail view.
  var isLarge = false
  /// Remembers which rows already played the grow-in wave; nil plays it on every appearance.
  var revealTracker: AssignDayBarReveals?
  /// This row's key in `revealTracker`.
  var revealKey = ""
  /// The busy day being inspected; nil hides the popover.
  @Binding var inspectedDay: ScheduleDay?

  @State private var grown = false
  @State private var animatesIn = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.horizontalSizeClass) private var sizeClass

  private var barAreaHeight: CGFloat { isLarge ? 44 : 32 }
  private var serviceHeight: CGFloat { isLarge ? 34 : 24 }
  private var quietHeight: CGFloat { isLarge ? 20 : 14 }
  private var barWidth: CGFloat { isLarge ? 5 : 4 }
  private var dateSpacingDays: Int {
    sizeClass == .regular || isLarge ? 7 : 14
  }

  var body: some View {
    VStack(spacing: Spacing.xs) {
      bars
      dates
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Schedule around this plan"))
    .accessibilityValue(Text(verbatim: AssignDayText.summary(days)))
    .onAppear {
      guard !grown else { return }
      let firstTime = revealTracker?.claim(revealKey) ?? true
      if firstTime, !reduceMotion {
        animatesIn = true
        grown = true
      } else {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { grown = true }
      }
    }
  }

  private var bars: some View {
    HStack(alignment: .bottom, spacing: 0) {
      ForEach(days) { day in
        AssignDayBarColumn(
          day: day,
          isInspected: inspectedDay?.dayKey == day.dayKey,
          barAreaHeight: barAreaHeight,
          serviceHeight: serviceHeight,
          quietHeight: quietHeight,
          barWidth: barWidth,
          grown: grown,
          animatesIn: animatesIn && !reduceMotion
        )
      }
    }
    .frame(height: barAreaHeight)
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { barsWidth = $0 }
    .contentShape(.rect)
    .onTapGesture(coordinateSpace: .local) { location in
      inspect(at: location.x)
    }
    .popover(
      item: $inspectedDay,
      attachmentAnchor: .point(UnitPoint(x: anchorFraction, y: 0)),
      arrowEdge: .bottom
    ) { day in
      AssignDayDetailPanel(day: day)
        .padding(Spacing.lg)
        .frame(idealWidth: 320, maxWidth: 360)
        .presentationCompactAdaptation(.popover)
    }
  }

  private var dates: some View {
    GeometryReader { proxy in
      let count = max(days.count, 1)
      ForEach(Array(days.enumerated()), id: \.element.dayKey) { index, day in
        if day.offset % dateSpacingDays == 0 {
          Text(verbatim: AssignDayText.label(day.dayKey, style: .monthDay))
            .font(.caption2.monospacedDigit())
            .fontWeight(day.offset == 0 ? .semibold : .regular)
            .foregroundStyle(day.offset == 0 ? Color.statusInfoText : Color.inkTertiary)
            .fixedSize()
            .position(
              x: labelX(index: index, count: count, width: proxy.size.width),
              y: proxy.size.height / 2)
        }
      }
    }
    .frame(height: 14)
    .accessibilityHidden(true)
  }

  /// A date centered under its day; the ends lean inward to stay in the row.
  private func labelX(index: Int, count: Int, width: CGFloat) -> CGFloat {
    let center = (CGFloat(index) + 0.5) / CGFloat(count) * width
    return min(max(center, 18), width - 18)
  }

  private var anchorFraction: CGFloat {
    guard let inspectedDay, let index = days.firstIndex(where: { $0.dayKey == inspectedDay.dayKey })
    else { return 0.5 }
    return (CGFloat(index) + 0.5) / CGFloat(max(days.count, 1))
  }

  /// Picks the busy day nearest the tap, within a few days of it.
  private func inspect(at x: CGFloat) {
    guard !days.isEmpty else { return }
    let width = max(barsWidth, 1)
    let index = Int((x / width) * CGFloat(days.count))
    let clamped = min(max(index, 0), days.count - 1)
    let busy = days.indices.filter { days[$0].kind != .free }
    guard let nearest = busy.min(by: { abs($0 - clamped) < abs($1 - clamped) }),
      abs(nearest - clamped) <= 3
    else { return }
    inspectedDay = days[nearest]
  }

  @State private var barsWidth: CGFloat = 1
}

/// One day: its bar, and the dashed frame on the plan's day.
private struct AssignDayBarColumn: View {
  let day: ScheduleDay
  let isInspected: Bool
  let barAreaHeight: CGFloat
  let serviceHeight: CGFloat
  let quietHeight: CGFloat
  let barWidth: CGFloat
  let grown: Bool
  let animatesIn: Bool

  var body: some View {
    ZStack(alignment: .bottom) {
      if day.offset == 0 {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
          .strokeBorder(Color.statusInfo.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [2.5, 2]))
          .frame(width: barWidth + 8, height: barAreaHeight)
      }
      if day.offset != 0 || day.kind != .free {
        Capsule()
          .fill(fill)
          .frame(width: barWidth, height: height)
          .padding(.bottom, day.offset == 0 ? 3 : 0)
          .scaleEffect(x: 1, y: grown ? 1 : 0.25, anchor: .bottom)
          .opacity(grown ? 1 : 0)
          .animation(animatesIn ? Motion.dayBar(distance: day.offset) : nil, value: grown)
      }
    }
    .frame(maxWidth: .infinity, alignment: .bottom)
    .frame(height: barAreaHeight, alignment: .bottom)
  }

  private var height: CGFloat {
    let base = day.kind == .service ? serviceHeight : quietHeight
    return day.offset == 0 ? min(base, barAreaHeight - 6) : base
  }

  private var fill: Color {
    switch day.kind {
    case .service: day.status == .confirmed ? .statusConfirmed : .statusPending
    case .rehearsal: Color.inkSecondary.opacity(isInspected ? 1 : 0.75)
    case .free: .surfaceMuted
    }
  }
}
