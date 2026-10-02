import PCOBoosterCore
import SwiftUI

/// Everyone scheduled on a day, services before rehearsals, with their position and status
/// (the web's `DayPeople`).
struct DayPeopleList: View {
  let people: [PeopleDashboardPerson]
  let day: Int

  var body: some View {
    let scheduled = PeopleScreens.dayPeople(people, day: day)
    if scheduled.isEmpty {
      Text("No one is scheduled on this day.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      PeopleRowStack(items: scheduled) { entry in
        PersonRow(person: entry.person.rosterPerson) {
          Text(verbatim: PeopleScreens.dayPersonDetail(entry.marker))
        } accessory: {
          HStack(spacing: Spacing.xs + 2) {
            CommitmentDotView(dot: entry.marker.dot)
            if entry.marker.kind != .rehearsal {
              Text(verbatim: DashboardCalendar.statusLabel(entry.marker.status))
                .font(.meta)
                .foregroundStyle(.inkSecondary)
            }
          }
          .fixedSize()
        }
      }
    }
  }
}

/// The selected day beside the calendar on iPad (the web's `SelectedDayPanel`).
struct SelectedDayCard: View {
  let month: PeopleDashboardMonth
  let day: Int
  let monthDay: PeopleDashboardDay?
  let people: [PeopleDashboardPerson]

  var body: some View {
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        PeopleCardHeader(
          Text(verbatim: DashboardCalendar.formatWeekdayMonthDay(month, day: day)),
          description: Text(verbatim: PeopleScreens.describeDay(monthDay)))
          .padding(Spacing.lg)
          .contentTransition(.opacity)
        DayPeopleList(people: people, day: day)
          .padding(.bottom, Spacing.xs)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("people-selected-day")
  }
}

/// A day's people as a sheet on iPhone, where the calendar has no room beside it. Opening a
/// person closes the sheet first.
struct DayPeopleSheet: View {
  let month: PeopleDashboardMonth
  let day: Int
  let monthDay: PeopleDashboardDay?
  let people: [PeopleDashboardPerson]

  @Environment(\.dismiss) private var dismiss
  @Environment(\.personOpener) private var opener

  var body: some View {
    NavigationStack {
      ScrollView {
        SurfaceCard(padding: .none) {
          DayPeopleList(people: people, day: day)
            .padding(.vertical, Spacing.xs)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.lg)
      }
      .scrollBounceBehavior(.basedOnSize)
      .background(.surfaceCanvas)
      .navigationTitle(Text(verbatim: DashboardCalendar.formatWeekdayMonthDay(month, day: day)))
      .navigationSubtitle(Text(verbatim: PeopleScreens.describeDay(monthDay)))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) {
            dismiss()
          }
        }
      }
    }
    .environment(
      \.personOpener,
      PersonOpener(
        open: { person in
          dismiss()
          opener.open(person)
        },
        prefetch: opener.prefetch,
        selectedPersonId: nil))
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }
}
