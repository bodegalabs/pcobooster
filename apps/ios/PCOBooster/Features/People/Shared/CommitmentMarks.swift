import PCOBoosterCore
import SwiftUI

extension CommitmentDot {
  /// Confirmed green, pending amber, rehearsal gray (the web's `commitmentDotClassName`).
  var color: Color {
    switch self {
    case .confirmed: .statusConfirmed
    case .pending: .statusPending
    case .rehearsal: .inkTertiary
    }
  }
}

extension PeopleDashboardMonthDay {
  var dot: CommitmentDot { DashboardCalendar.commitmentDot(kind: kind, status: status) }
  var dayNumber: Int { Int(day) }
  /// "Confirmed service", "Pending service", or "Rehearsal".
  var engagement: String { DashboardCalendar.engagementLabel(kind: kind, status: status) }
}

/// A commitment's status dot.
struct CommitmentDotView: View {
  let dot: CommitmentDot
  var size: CGFloat = 8

  var body: some View {
    Circle()
      .fill(dot.color)
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

/// A one-line legend for commitment markers, with optional leading notes (the web's
/// `CommitmentLegend`). Wraps onto more lines when it doesn't fit.
struct CommitmentLegend: View {
  var dots: [CommitmentDot] = CommitmentDot.allCases
  var labels: (CommitmentDot) -> String = { $0.legendLabel }
  var note: String?
  var showsBlockouts = false

  var body: some View {
    FlowLayout(spacing: Spacing.md) {
      if let note {
        Text(verbatim: note)
      }
      ForEach(dots, id: \.self) { dot in
        HStack(spacing: Spacing.xs + 2) {
          CommitmentDotView(dot: dot)
          Text(verbatim: labels(dot))
        }
      }
      if showsBlockouts {
        HStack(spacing: Spacing.xs + 2) {
          BlockoutHatch()
            .frame(width: 12, height: 12)
            .clipShape(.rect(cornerRadius: 3, style: .continuous))
          Text("Blocked out")
        }
      }
    }
    .font(.meta)
    .foregroundStyle(.inkSecondary)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

/// Diagonal stripes marking days someone has blocked out.
struct BlockoutHatch: View {
  var body: some View {
    Canvas { context, size in
      let step: CGFloat = 4
      var path = Path()
      var x: CGFloat = -size.height
      while x < size.width {
        path.move(to: CGPoint(x: x, y: size.height))
        path.addLine(to: CGPoint(x: x + size.height, y: 0))
        x += step
      }
      context.stroke(path, with: .color(.statusDeclined.opacity(0.45)), lineWidth: 1)
    }
    .background(Color.statusDeclined.opacity(0.06))
    .accessibilityHidden(true)
  }
}
