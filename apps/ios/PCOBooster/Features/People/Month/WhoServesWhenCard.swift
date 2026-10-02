import PCOBoosterCore
import SwiftUI

/// People against pages of five service days (the web's `PeopleMonthMatrix`). The names stay
/// pinned while the days page sideways with a swipe or the chevrons; paging keeps the selected
/// day on the page, so the heatmap, the matrix, and the day panel agree. Tapping a dot shows
/// the commitment and a way into its plan.
struct WhoServesWhenCard: View {
  let people: [PeopleDashboardPerson]
  let month: PeopleDashboardMonth
  let serviceDays: [Int]
  let selectedDay: Int
  let onSelectDay: (Int) -> Void

  @State private var visiblePage: Int?
  @State private var popover: MatrixCell?
  @Environment(\.peopleLayout) private var layout
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private static var pageSize: Int { PeopleDashboardConstants.matrixDayCount }
  private var rowHeight: CGFloat { dynamicTypeSize.isAccessibilitySize ? 64 : 52 }
  private var headerHeight: CGFloat { layout == .compact ? 44 : 34 }
  private var nameWidth: CGFloat { layout == .compact ? 160 : 220 }

  var body: some View {
    let page = PeopleScreens.matrixPage(serviceDays: serviceDays, selectedDay: selectedDay)
    let scheduled = people.filter { !$0.monthDays.isEmpty }
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        PeopleCardHeader(
          Text("Who serves when"), icon: Image(systemName: PeopleGlyph.matrix),
          description: Text(verbatim: page.description)
        ) {
          if page.isPaged {
            pager(page)
          }
        }
        .padding(Spacing.lg)
        if page.days.isEmpty || scheduled.isEmpty {
          Text("No one is scheduled this month.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.md)
        } else {
          matrix(scheduled: scheduled, currentPage: page.start / Self.pageSize)
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        }
        Hairline(color: .hairlineSubtle)
        CommitmentLegend(note: unscheduledNote(scheduled.count))
          .padding(Spacing.lg)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("people-matrix")
  }

  private func unscheduledNote(_ scheduledCount: Int) -> String? {
    let count = people.count - scheduledCount
    return count > 0 ? "Not shown: \(PeopleScreens.peopleCount(count)) with nothing this month." : nil
  }

  private var pages: [[Int]] {
    stride(from: 0, to: serviceDays.count, by: Self.pageSize).map {
      Array(serviceDays[$0..<min($0 + Self.pageSize, serviceDays.count)])
    }
  }

  private func pager(_ page: PeopleScreens.MatrixPage) -> some View {
    HStack(spacing: Spacing.xs) {
      Button {
        if let day = page.previousDay { onSelectDay(day) }
      } label: {
        Image(symbol: .chevronLeft)
      }
      .disabled(page.previousDay == nil)
      .accessibilityLabel(Text("Earlier service days"))
      Button {
        if let day = page.nextDay { onSelectDay(day) }
      } label: {
        Image(symbol: .chevronRight)
      }
      .disabled(page.nextDay == nil)
      .accessibilityLabel(Text("Later service days"))
    }
    .buttonStyle(.bordered)
    .buttonBorderShape(.circle)
    .controlSize(.small)
    .tint(.ink)
  }

  private func matrix(scheduled: [PeopleDashboardPerson], currentPage: Int) -> some View {
    HStack(alignment: .top, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text("Person")
          .font(.meta.weight(.medium))
          .foregroundStyle(.inkSecondary)
          .padding(.horizontal, Spacing.lg)
          .frame(height: headerHeight, alignment: .leading)
        Hairline(color: .hairlineSubtle)
        ForEach(scheduled) { person in
          MatrixNameCell(person: person)
            .frame(height: rowHeight)
          Hairline(color: .hairlineSubtle)
        }
      }
      .frame(width: nameWidth)
      Hairline(axis: .vertical, color: .hairlineSubtle)
      ScrollView(.horizontal) {
        LazyHStack(spacing: 0) {
          ForEach(Array(pages.enumerated()), id: \.offset) { index, days in
            pageColumns(days: days, scheduled: scheduled)
              .containerRelativeFrame(.horizontal)
              .id(index)
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.paging)
      .scrollPosition(id: $visiblePage)
      .scrollIndicators(.hidden)
      .onAppear { visiblePage = currentPage }
      .onChange(of: currentPage) { _, page in
        guard visiblePage != page else { return }
        withAnimation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.3))) {
          visiblePage = page
        }
      }
      .onChange(of: visiblePage) { _, page in
        // A swipe to another page selects that page's first service day, as the chevrons do.
        guard let page, page != currentPage, pages.indices.contains(page),
          let first = pages[page].first
        else {
          return
        }
        onSelectDay(first)
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }

  private func pageColumns(days: [Int], scheduled: [PeopleDashboardPerson]) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        ForEach(0..<Self.pageSize, id: \.self) { slot in
          Group {
            if days.indices.contains(slot) {
              DayColumnHeading(
                month: month, day: days[slot], isSelected: days[slot] == selectedDay,
                isStacked: layout == .compact)
            } else {
              Color.clear
            }
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: headerHeight)
      Hairline(color: .hairlineSubtle)
      ForEach(scheduled) { person in
        HStack(spacing: 0) {
          ForEach(0..<Self.pageSize, id: \.self) { slot in
            Group {
              if days.indices.contains(slot) {
                dotCell(person: person, day: days[slot])
              } else {
                Color.clear
              }
            }
            .frame(maxWidth: .infinity)
          }
        }
        .frame(height: rowHeight)
        Hairline(color: .hairlineSubtle)
      }
    }
  }

  @ViewBuilder private func dotCell(person: PeopleDashboardPerson, day: Int) -> some View {
    let entries = person.monthDays.filter { $0.dayNumber == day }
    if let marker = DashboardCalendar.pickMarker(entries) {
      let cell = MatrixCell(personId: person.id, day: day)
      Button {
        popover = cell
      } label: {
        CommitmentDotView(dot: marker.dot, size: 10)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .contentShape(.rect)
      }
      .buttonStyle(CellPressStyle())
      .popover(
        isPresented: Binding(get: { popover == cell }, set: { if !$0 { popover = nil } }),
        attachmentAnchor: .rect(.bounds), arrowEdge: .top
      ) {
        CommitmentPopover(
          title: person.name, subtitle: DashboardCalendar.formatWeekdayMonthDay(month, day: day),
          entries: entries, onDismiss: { popover = nil })
          .presentationCompactAdaptation(.popover)
      }
      .accessibilityLabel(
        Text(verbatim: "\(person.name), \(DashboardCalendar.formatMonthDay(month, day: day)): \(marker.engagement)"))
    } else {
      Circle()
        .fill(Color.hairline.opacity(0.8))
        .frame(width: 6, height: 6)
        .accessibilityHidden(true)
    }
  }
}

/// A service day's column heading: "Oct 4" with room, or the weekday over the day number on a
/// phone, where five columns share the width beside the names.
private struct DayColumnHeading: View {
  let month: PeopleDashboardMonth
  let day: Int
  let isSelected: Bool
  let isStacked: Bool

  var body: some View {
    Group {
      if isStacked {
        VStack(spacing: 0) {
          Text(verbatim: DashboardCalendar.formatWeekday(month, day: day))
            .font(.caption2.weight(.medium))
            .textCase(.uppercase)
          Text(verbatim: "\(day)")
            .font(.subheadline.weight(isSelected ? .bold : .medium).monospacedDigit())
        }
      } else {
        Text(verbatim: DashboardCalendar.formatMonthDay(month, day: day))
          .font(.meta.weight(isSelected ? .semibold : .medium).monospacedDigit())
      }
    }
    .foregroundStyle(isSelected ? Color.ink : Color.inkSecondary)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: DashboardCalendar.formatWeekdayMonthDay(month, day: day)))
    .accessibilityAddTraits(isSelected ? [.isHeader, .isSelected] : .isHeader)
  }
}

private struct MatrixCell: Hashable {
  let personId: String
  let day: Int
}

private struct MatrixNameCell: View {
  let person: PeopleDashboardPerson
  @Environment(\.personOpener) private var opener

  var body: some View {
    Button {
      opener.open(person.rosterPerson)
    } label: {
      HStack(spacing: Spacing.sm) {
        PersonAvatar(name: person.name, photoURL: PeopleLinks.photo(person.photoThumbnailUrl), size: .small)
        VStack(alignment: .leading, spacing: 0) {
          Text(verbatim: person.name)
            .font(.rowDetail.weight(.medium))
            .foregroundStyle(.ink)
            .lineLimit(1)
          if !person.roles.isEmpty {
            Text(verbatim: person.roles.joined(separator: ", "))
              .font(.caption)
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.leading, Spacing.lg)
      .padding(.trailing, Spacing.sm)
      .frame(maxHeight: .infinity)
      .contentShape(.rect)
    }
    .buttonStyle(PersonRowButtonStyle(isSelected: opener.selectedPersonId == person.id))
    .personContextMenu(person.rosterPerson)
  }
}
