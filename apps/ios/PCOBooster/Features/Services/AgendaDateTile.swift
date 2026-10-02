import PCOBoosterCore
import SwiftUI

/// A plan's date as a small tile: month, day, and weekday on the organization calendar
/// (`formatPlanDateTile`). Today's tile is inverted. Decorative: rows speak the full date.
struct AgendaDateTile: View {
  let date: Date
  var isToday = false
  @Environment(\.orgTimeZone) private var timeZone
  @ScaledMetric(relativeTo: .body) private var width: CGFloat = 48

  var body: some View {
    let tile = formatPlanDateTile(date, timeZone: timeZone)
    VStack(spacing: 1) {
      Text(verbatim: tile.month)
        .font(.caption2.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.4)
        .opacity(0.72)
      Text(verbatim: tile.day)
        .font(.title3.weight(.semibold))
        .monospacedDigit()
      Text(verbatim: tile.weekday)
        .font(.caption2.weight(.medium))
        .opacity(0.62)
    }
    .lineLimit(1)
    .minimumScaleFactor(0.8)
    .foregroundStyle(isToday ? Color.onInkFill : Color.ink)
    .frame(width: min(width, 72))
    .padding(.vertical, Spacing.xs + 2)
    .background(isToday ? Color.inkFill : Color.surfaceMuted, in: .rect(cornerRadius: Radius.tile, style: .continuous))
    .accessibilityHidden(true)
  }
}
