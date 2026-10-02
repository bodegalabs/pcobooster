import PCOBoosterCore
import SwiftUI

extension MonthGridDayTone {
  /// The day's fill (the web's `month-grid-day.tsx` tones).
  var fill: Color {
    switch self {
    case .empty: .clear
    case .light, .rehearsal: .surfaceMuted
    case .busy: Color.statusConfirmedBright.opacity(0.12)
    case .peak: Color.statusConfirmedBright.opacity(0.24)
    case .confirmed: Color.statusConfirmed.opacity(0.15)
    case .scheduled: Color.statusPending.opacity(0.16)
    }
  }

  /// The day's outline.
  var border: Color {
    switch self {
    case .empty: Color.hairline.opacity(0.7)
    case .light, .busy, .peak: .hairlineSubtle
    case .confirmed: Color.statusConfirmed.opacity(0.35)
    case .scheduled: Color.statusPending.opacity(0.45)
    case .rehearsal: Color.inkSecondary.opacity(0.25)
    }
  }

  /// The day number's color.
  var ink: Color {
    switch self {
    case .empty: .inkSecondary
    case .light, .busy, .peak, .rehearsal: .ink
    case .confirmed: .statusConfirmedText
    case .scheduled: .statusPendingText
    }
  }
}

/// How many people serve each day of the month, as a calendar (the web's `MonthHeatmap`). A
/// day shows its count, an amber dot when someone hasn't confirmed, and a gray dot on
/// rehearsal-only days. Tapping a day shows who serves.
struct MonthHeatmapCard<Note: View>: View {
  let month: PeopleDashboardMonth
  let monthDays: [PeopleDashboardDay]
  let today: Int?
  /// The highlighted day, on iPad where its people show beside the calendar.
  let selectedDay: Int?
  let onSelectDay: (Int) -> Void
  @ViewBuilder let note: Note

  @Environment(\.peopleLayout) private var layout

  var body: some View {
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.md) {
        PeopleCardHeader(
          Text(verbatim: month.label), icon: Image(systemName: PeopleGlyph.month),
          description: Text("How many people serve each day."))
        note
        calendar
          .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        CommitmentLegend(
          dots: [.pending, .rehearsal], labels: { $0.heatmapLegendLabel },
          note: "Numbers count people serving.")
      }
    }
  }

  private var calendar: some View {
    let spacing: CGFloat = layout == .compact ? 5 : Spacing.sm
    let columns = Array(repeating: GridItem(.flexible(), spacing: spacing), count: 7)
    return VStack(spacing: Spacing.sm) {
      LazyVGrid(columns: columns, spacing: spacing) {
        ForEach(DashboardCalendar.weekDayNames, id: \.self) { name in
          Text(verbatim: layout == .compact ? String(name.prefix(1)) : name)
            .font(.caption.weight(.medium))
            .foregroundStyle(.inkSecondary)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
        }
      }
      LazyVGrid(columns: columns, spacing: spacing) {
        ForEach(DashboardCalendar.cells(for: month)) { cell in
          if let day = cell.day {
            HeatmapDayCell(
              month: month, day: day,
              monthDay: monthDays.indices.contains(day - 1) ? monthDays[day - 1] : nil,
              isToday: today == day, isSelected: selectedDay == day
            ) {
              onSelectDay(day)
            }
          } else {
            Color.clear.aspectRatio(1, contentMode: .fit)
          }
        }
      }
    }
  }
}

private struct HeatmapDayCell: View {
  let month: PeopleDashboardMonth
  let day: Int
  let monthDay: PeopleDashboardDay?
  let isToday: Bool
  let isSelected: Bool
  let action: () -> Void

  @Environment(\.peopleLayout) private var layout
  @Environment(\.displayScale) private var displayScale

  var body: some View {
    let serviceCount = monthDay?.serviceCount ?? 0
    let rehearsalCount = monthDay?.rehearsalCount ?? 0
    let tone = DashboardCalendar.heatLevel(serviceCount: serviceCount, rehearsalCount: rehearsalCount)
    let shape = RoundedRectangle(cornerRadius: layout == .compact ? Radius.small + 2 : Radius.control, style: .continuous)
    Button(action: action) {
      VStack(alignment: .leading, spacing: 0) {
        Text(verbatim: "\(day)")
          .font(isToday ? .caption2.weight(.bold) : .caption2)
          .foregroundStyle(isToday ? Color.ink : Color.inkSecondary)
          .monospacedDigit()
        Spacer(minLength: 0)
        HStack(spacing: 3) {
          if serviceCount > 0 {
            Text(verbatim: "\(serviceCount)")
              .font((layout == .compact ? Font.subheadline : .title3).weight(.semibold).monospacedDigit())
              .foregroundStyle(.ink)
          }
          if (monthDay?.pendingServiceCount ?? 0) > 0 {
            Circle().fill(CommitmentDot.pending.color).frame(width: 6, height: 6)
          }
          if serviceCount == 0, rehearsalCount > 0 {
            Circle().fill(CommitmentDot.rehearsal.color).frame(width: 6, height: 6)
          }
        }
        .frame(minHeight: 14)
      }
      .padding(layout == .compact ? 4 : Spacing.sm)
      .frame(maxWidth: .infinity, alignment: .leading)
      .aspectRatio(1, contentMode: .fit)
      .background(tone.fill, in: shape)
      .overlay(shape.strokeBorder(tone.border, lineWidth: max(1 / max(displayScale, 1), 0.5)))
      .overlay {
        if isSelected {
          shape.strokeBorder(Color.ink.opacity(0.55), lineWidth: 2)
        }
      }
      .overlay(alignment: .topTrailing) {
        if isToday {
          Circle().fill(Color.ink).frame(width: 4, height: 4).padding(5)
        }
      }
      .contentShape(shape)
    }
    .buttonStyle(CellPressStyle())
    .accessibilityLabel(Text(verbatim: "\(DashboardCalendar.formatWeekdayMonthDay(month, day: day)): \(PeopleScreens.describeDay(monthDay))"))
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityHint(Text("Shows who serves"))
    .accessibilityIdentifier("heatmap-day-\(day)")
  }
}

/// A calendar cell's press: it dips slightly; its colors stay put.
struct CellPressStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.94 : 1)
      .opacity(configuration.isPressed ? 0.8 : 1)
      .animation(reduceMotion ? nil : Motion.snappy(0.15), value: configuration.isPressed)
  }
}
