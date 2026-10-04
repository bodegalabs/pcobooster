import PCOBoosterCore
import SwiftUI

/// A person found in Search while the People dashboard is off: their name and the upcoming
/// blockouts Planning Center shares (`people.blockouts`, unflagged), with "Open in Planning
/// Center" as the full-width bottom action. A sheet on iPhone, a popover beside the row on iPad.
struct SearchPersonSheet: View {
  let person: SearchPerson
  @ScreenModel private var model: PersonBlockoutsModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL

  init(person: SearchPerson) {
    self.person = person
    _model = ScreenModel { app in PersonBlockoutsModel(queries: app.queries, personId: person.id) }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: Spacing.xl) {
          header
          SearchBlockoutsCard(state: model.blockouts)
        }
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.lg)
      }
      .scrollBounceBehavior(.basedOnSize)
      .background(.surfaceCanvas)
      .refreshable { await model.blockouts.refresh() }
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button(role: .close) { dismiss() }
        }
      }
      .bottomActionBar {
        if let url = planningCenterPersonURL(person.id) {
          Button {
            openURL(url, prefersInApp: true)
          } label: {
            Label("Open in Planning Center", symbol: .openExternal)
          }
          .accessibilityIdentifier("person-open-planning-center")
        }
      }
    }
    .queryLifecycle(model.blockouts)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityIdentifier("search-person-sheet")
  }

  private var header: some View {
    VStack(spacing: Spacing.sm) {
      PersonAvatar(name: person.name, photoURL: person.photo, size: .hero)
      Text(verbatim: person.name)
        .font(.pageTitle)
        .foregroundStyle(.ink)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
    }
    .padding(.top, Spacing.xs)
  }
}

/// `people.blockouts` for one person (five minutes fresh, like the server's cache).
@MainActor
@Observable
final class PersonBlockoutsModel {
  let blockouts: QueryState<[Blockout]>

  init(queries: QueryClient, personId: String) {
    blockouts = queries.query(
      .blockouts(personId: personId), RPC.People.blockouts, PeopleBlockoutsInput(personId: personId))
  }
}

/// "Upcoming blockouts": each one's reason, days (in the zone the person set it in), and note,
/// with "Away now" on one that covers today.
private struct SearchBlockoutsCard: View {
  let state: QueryState<[Blockout]>
  @Environment(\.appClock) private var clock

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader("Upcoming blockouts", count: state.value?.count)
        .padding(.horizontal, Spacing.xs)
      content
    }
  }

  @ViewBuilder private var content: some View {
    if let blockouts = state.value {
      if blockouts.isEmpty {
        Text("No upcoming blockouts.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(Spacing.lg)
          .surfaceCard()
      } else {
        VStack(spacing: 0) {
          let sorted = blockouts.sorted { $0.startsAt < $1.startsAt }
          ForEach(Array(sorted.enumerated()), id: \.element.id) { index, blockout in
            if index > 0 {
              Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg)
            }
            BlockoutRow(blockout: blockout, now: clock.now)
          }
        }
        .surfaceCard()
        .staleWhileRefreshing(state.isRefreshing)
      }
    } else if let message = state.errorMessage {
      InfoBanner(verbatim: message, tone: .destructive) {
        Button("Retry") { state.retry() }
      }
    } else {
      VStack(spacing: 0) {
        SkeletonRow(showsAvatar: false, titleWidth: 120, detailWidth: 170)
        SkeletonRow(showsAvatar: false, titleWidth: 90, detailWidth: 140)
      }
      .padding(.horizontal, Spacing.lg)
      .surfaceCard()
    }
  }
}

private struct BlockoutRow: View {
  let blockout: Blockout
  let now: Date
  @Environment(\.orgTimeZone) private var orgTimeZone

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: blockout.reason.isEmpty ? String(localized: "Blocked out") : blockout.reason)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        Text(verbatim: BlockoutDates.label(blockout, orgTimeZone: orgTimeZone, now: now))
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
        if !blockout.description.isEmpty {
          Text(verbatim: blockout.description)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .padding(.top, Spacing.xxs)
        }
      }
      .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: Spacing.sm)
      if blockout.startsAt <= now, now <= blockout.endsAt {
        StatusBadge("Away now", tone: .pending)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.md)
    .accessibilityElement(children: .combine)
  }
}

/// Blockout day labels, in the zone the blockout was entered in (its Planning Center
/// `time_zone`), falling back to the organization's: "Fri, Oct 30 to Mon, Nov 2", one day
/// alone, or times for a part-day blockout.
enum BlockoutDates {
  static func label(_ blockout: Blockout, orgTimeZone: String, now: Date) -> String {
    let zone = blockout.timeZone.flatMap { OrgCalendar.isValidTimeZone($0) ? $0 : nil } ?? orgTimeZone
    let start = OrgCalendar.wallTime(blockout.startsAt, timeZone: zone)
    let rawEnd = OrgCalendar.wallTime(blockout.endsAt, timeZone: zone)
    let isAllDay = start.timeValue == "00:00" && (rawEnd.timeValue == "23:59" || rawEnd.timeValue == "00:00")
    // An all-day blockout that ends at the next midnight covers the day before it.
    let lastInstant =
      isAllDay && rawEnd.timeValue == "00:00" && blockout.endsAt > blockout.startsAt
      ? blockout.endsAt.addingTimeInterval(-60) : blockout.endsAt
    let end = OrgCalendar.wallTime(lastInstant, timeZone: zone)
    let thisYear = OrgCalendar.dayKey(now, timeZone: zone).prefix(4)
    let showsYear = start.dateKey.prefix(4) != thisYear || end.dateKey.prefix(4) != thisYear
    let style: CalendarDateLabelStyle = showsYear ? .weekdayMonthDayYear : .weekdayMonthDay
    let startDay = OrgCalendar.label(blockout.startsAt, timeZone: zone, style: style)
    let endDay = OrgCalendar.label(lastInstant, timeZone: zone, style: style)
    if isAllDay {
      return start.dateKey == end.dateKey ? startDay : "\(startDay) to \(endDay)"
    }
    let startTime = OrgCalendar.timeOfDay(blockout.startsAt, timeZone: zone)
    let endTime = OrgCalendar.timeOfDay(blockout.endsAt, timeZone: zone)
    if start.dateKey == end.dateKey {
      return "\(startDay), \(startTime) to \(endTime)"
    }
    return "\(startDay), \(startTime) to \(endDay), \(endTime)"
  }
}
