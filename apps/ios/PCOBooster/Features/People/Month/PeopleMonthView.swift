import PCOBoosterCore
import SwiftUI

/// The month at a glance: how many serve each day, who serves when, and who is on a day (the
/// web's `MonthView`). On iPhone a day's people open as a sheet; on iPad they sit beside (or
/// under) the calendar and follow the selected day.
struct PeopleMonthView: View {
  let model: PeopleDashboardModel

  @State private var chosenDay: Int?
  @State private var sheetDay: Int?
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.peopleLayout) private var layout

  var body: some View {
    if let dashboard = model.dashboard,
      !(dashboard.coverage.loadedPeopleCount == 0 && model.isLoadingSample)
    {
      content(month: dashboard.month, coverage: dashboard.coverage)
    } else {
      MonthSkeleton()
    }
  }

  @ViewBuilder
  private func content(month: PeopleDashboardMonth, coverage: PeopleDashboardCoverage) -> some View {
    let people = model.monthPeople
    let monthDays = buildMonthDays(people)
    let days = serviceDays(monthDays)
    // Until the viewer picks a day: the next service day from today, else the first.
    let selectedDay = chosenDay ?? PeopleScreens.defaultSelectedDay(serviceDays: days, today: model.todayInMonth)
    let showsDayPanel = horizontalSizeClass == .regular
    let heatmap = MonthHeatmapCard(
      month: month, monthDays: monthDays, today: model.todayInMonth,
      selectedDay: showsDayPanel ? selectedDay : nil,
      onSelectDay: { day in
        chosenDay = day
        if !showsDayPanel { sheetDay = day }
      }
    ) {
      if !model.isSearching {
        CoverageNoteRow(
          coverage: coverage, isLoading: model.isLoadingSample, canLoadMore: model.canLoadMore,
          onLoadMore: model.loadMore)
      }
    }
    let matrix = WhoServesWhenCard(
      people: people, month: month, serviceDays: days, selectedDay: selectedDay,
      onSelectDay: { chosenDay = $0 })
    let dayPanel = SelectedDayCard(
      month: month, day: selectedDay,
      monthDay: monthDays.indices.contains(selectedDay - 1) ? monthDays[selectedDay - 1] : nil,
      people: people)

    Group {
      if showsDayPanel, layout == .wide {
        HStack(alignment: .top, spacing: Spacing.lg) {
          VStack(spacing: Spacing.lg) {
            heatmap
            matrix
          }
          dayPanel
            .frame(width: 340)
        }
      } else {
        VStack(spacing: Spacing.lg) {
          heatmap
          if showsDayPanel {
            dayPanel
          }
          matrix
        }
      }
    }
    .haptic(.selection, trigger: chosenDay)
    .sheet(item: Binding(get: { sheetDay.map(DaySelection.init) }, set: { sheetDay = $0?.day })) { selection in
      DayPeopleSheet(
        month: month, day: selection.day,
        monthDay: monthDays.indices.contains(selection.day - 1) ? monthDays[selection.day - 1] : nil,
        people: people)
    }
  }
}

private struct DaySelection: Identifiable {
  let day: Int
  var id: Int { day }
}

/// Before any activity loads: the month's shape with placeholders.
struct MonthSkeleton: View {
  var body: some View {
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.md) {
        Skeleton(.text, width: 140, height: 14)
        Skeleton(.text, width: 220, height: 11)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
          ForEach(0..<35, id: \.self) { _ in
            Skeleton(.control)
              .aspectRatio(1, contentMode: .fit)
              .frame(height: nil)
          }
        }
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Text("Loading month view"))
  }
}
