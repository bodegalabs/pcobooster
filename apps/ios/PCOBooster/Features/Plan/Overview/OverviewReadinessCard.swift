import PCOBoosterCore
import SwiftUI

/// What is ready and what isn't, from whichever parts have loaded (`buildReadinessChecks`).
/// Each check opens the place that resolves it: a segment, Assign for open positions, or
/// Planning Center for unsent scheduling emails (its public API can't send them).
struct OverviewReadinessCard: View {
  let checks: [ReadinessCheck]
  let isLoading: Bool
  let isIncomplete: Bool
  /// Whether the notifications check hands off to Planning Center (the plan has a link there).
  let opensPlanningCenter: Bool
  let onSelect: (ReadinessCheck) -> Void
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  var body: some View {
    OverviewCard(
      "Readiness", systemImage: "checkmark.seal", summary: summary,
      isSummaryLoading: summary == nil
    ) {
      if !checks.isEmpty {
        ReadinessRing(done: doneCount, total: checks.count)
      }
    } content: {
      LazyVGrid(columns: columns, alignment: .leading, spacing: Spacing.xs) {
        ForEach(checks) { check in
          ReadinessRow(check: check, isExternal: isExternal(check)) {
            onSelect(check)
          }
        }
        if isLoading {
          ForEach(0..<2, id: \.self) { _ in
            Skeleton(.control, height: 32)
          }
        }
      }
    }
  }

  private var columns: [GridItem] {
    let count = horizontalSizeClass == .regular ? 2 : 1
    return Array(repeating: GridItem(.flexible(), spacing: Spacing.xl, alignment: .leading), count: count)
  }

  private var doneCount: Int {
    checks.count(where: { $0.state == .done })
  }

  private var summary: Text? {
    if isIncomplete {
      return Text("Readiness could not be fully checked.")
    }
    if checks.isEmpty, isLoading {
      return nil
    }
    let todo = checks.count - doneCount
    if todo == 0 {
      return Text("Everything we can check looks ready.")
    }
    return todo == 1 ? Text("1 thing left to do.") : Text("\(todo) things left to do.")
  }

  private func isExternal(_ check: ReadinessCheck) -> Bool {
    check.id == .notifications && opensPlanningCenter
  }
}

private struct ReadinessRow: View {
  let check: ReadinessCheck
  let isExternal: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        Image(systemName: isDone ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
          .font(.body)
          .foregroundStyle(isDone ? Color.statusConfirmed : Color.statusPending)
          .contentTransition(.symbolEffect(.replace))
          .accessibilityHidden(true)
        Text(verbatim: check.label)
          .font(.rowTitle)
          .foregroundStyle(isDone ? .inkSecondary : .ink)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: isExternal ? "arrow.up.right" : "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
          .accessibilityHidden(true)
      }
      .frame(minHeight: Metrics.minimumTapTarget - 4)
      .contentShape(.rect)
    }
    .buttonStyle(OverviewRowButtonStyle())
    .accessibilityLabel(Text(verbatim: check.label))
    .accessibilityValue(Text(isDone ? "Done" : "To do"))
    .accessibilityHint(Text(hint))
  }

  private var isDone: Bool { check.state == .done }

  private var hint: LocalizedStringKey {
    if isExternal { return "Send scheduling emails in Planning Center" }
    if check.id == .positions, check.state == .todo { return "Opens Assign" }
    return "Opens \(PlanSegment(check.view).title)"
  }
}

/// Checks done out of checks shown, as a small ring. The ring's sweep animates; its color only
/// says whether everything is done.
private struct ReadinessRing: View {
  let done: Int
  let total: Int
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let fraction = total > 0 ? Double(done) / Double(total) : 0
    ZStack {
      Circle()
        .stroke(.surfaceMuted, lineWidth: 4)
      // Only the mask's sweep animates, so the ring's color changes instantly.
      Circle()
        .stroke(done == total ? Color.statusConfirmed : Color.statusPending, lineWidth: 4)
        .mask {
          Circle()
            .trim(from: 0, to: fraction)
            .stroke(style: StrokeStyle(lineWidth: 4, lineCap: .round))
            .rotationEffect(.degrees(-90))
            .animation(
              Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.4), instantWhenReduced: true),
              value: fraction)
        }
      Text(verbatim: "\(done)/\(total)")
        .font(.caption2.weight(.semibold).monospacedDigit())
        .foregroundStyle(.inkSecondary)
        .contentTransition(.numericText(value: Double(done)))
        .minimumScaleFactor(0.7)
    }
    .frame(width: 40, height: 40)
    .accessibilityElement()
    .accessibilityLabel(Text("\(done) of \(total) checks done"))
  }
}
