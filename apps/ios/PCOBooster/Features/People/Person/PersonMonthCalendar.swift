import PCOBoosterCore
import SwiftUI

/// A compact month with each commitment day tinted (confirmed, pending, rehearsal) and blocked
/// out days striped. Tapping a commitment day shows its details with a way into the plan (the
/// web's `PersonMonthCalendar`, whose hover and phone sheet become one popover).
struct PersonMonthCalendar: View {
  let month: PeopleDashboardMonth
  let monthDays: [PeopleDashboardMonthDay]
  let blockedDays: Set<Int>
  let today: Int?

  @State private var popoverDay: Int?

  var body: some View {
    let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
    VStack(spacing: Spacing.xs + 2) {
      LazyVGrid(columns: columns, spacing: 4) {
        ForEach(DashboardCalendar.weekDayNames, id: \.self) { name in
          Text(verbatim: String(name.prefix(2)))
            .font(.caption2.weight(.medium))
            .foregroundStyle(.inkSecondary)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
        }
      }
      LazyVGrid(columns: columns, spacing: 4) {
        ForEach(DashboardCalendar.cells(for: month)) { cell in
          if let day = cell.day {
            dayCell(day)
          } else {
            Color.clear.frame(height: 34)
          }
        }
      }
    }
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }

  @ViewBuilder private func dayCell(_ day: Int) -> some View {
    let entries = monthDays.filter { $0.dayNumber == day }
    let marker = DashboardCalendar.pickMarker(entries)
    let tone = marker.map { DashboardCalendar.cellTone(kind: $0.kind, status: $0.status) } ?? .empty
    let label = DashboardCalendar.formatWeekdayMonthDay(month, day: day)
    let cell = PersonDayCell(day: day, tone: tone, isToday: today == day, isBlocked: blockedDays.contains(day))
    if marker != nil {
      Button {
        popoverDay = day
      } label: {
        cell
      }
      .buttonStyle(CellPressStyle())
      .popover(
        isPresented: Binding(get: { popoverDay == day }, set: { if !$0 { popoverDay = nil } }),
        attachmentAnchor: .rect(.bounds), arrowEdge: .top
      ) {
        CommitmentPopover(title: label, entries: entries, onDismiss: { popoverDay = nil })
          .presentationCompactAdaptation(.popover)
      }
      .accessibilityLabel(
        Text(verbatim: "\(label): \(entries.map(\.engagement).joined(separator: ", "))\(blockedDays.contains(day) ? ", blocked out" : "")"))
      .accessibilityHint(Text("Shows the details"))
    } else {
      cell
        .accessibilityElement()
        .accessibilityLabel(Text(verbatim: blockedDays.contains(day) ? "\(label), blocked out" : label))
    }
  }
}

private struct PersonDayCell: View {
  let day: Int
  let tone: MonthGridDayTone
  let isToday: Bool
  let isBlocked: Bool

  @Environment(\.displayScale) private var displayScale

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: Radius.small + 1, style: .continuous)
    Text(verbatim: "\(day)")
      .font(.footnote.weight(isToday || tone != .empty ? .semibold : .regular).monospacedDigit())
      .foregroundStyle(tone.ink)
      .frame(maxWidth: .infinity)
      .frame(height: 34)
      .background {
        if isBlocked {
          BlockoutHatch().clipShape(shape)
        }
      }
      .background(tone.fill, in: shape)
      .overlay(shape.strokeBorder(tone.border, lineWidth: max(1 / max(displayScale, 1), 0.5)))
      .overlay {
        if isToday {
          shape.strokeBorder(Color.ink.opacity(0.7), lineWidth: 1.5)
        }
      }
  }
}

/// The days of a month someone has blocked out, read on each blockout's own calendar (its
/// Planning Center zone, else the congregation's), as the server compares blockouts.
enum BlockoutDays {
  static func days(in month: PeopleDashboardMonth, blockouts: [Blockout], fallbackZone: String) -> Set<Int> {
    guard !blockouts.isEmpty else { return [] }
    let monthKey = peopleDashboardMonthKey(month)
    let daysInMonth = month.daysInMonth.isFinite ? Int(min(max(month.daysInMonth, 0), 31)) : 0
    var days = Set<Int>()
    for blockout in blockouts {
      let range = BlockoutText.dayRange(blockout, fallbackZone: fallbackZone)
      for day in 1...max(1, daysInMonth) {
        let key = "\(monthKey)-\(day < 10 ? "0" : "")\(day)"
        if key >= range.start, key <= range.end {
          days.insert(day)
        }
      }
    }
    return days
  }
}
