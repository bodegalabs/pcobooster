import PCOBoosterCore
import SwiftUI

/// The person screen's body, shared by the pushed page and the iPad inspector: who they are,
/// their serving numbers, the month with its schedule, signals, rotation, and blockouts.
struct PersonDetailContent: View {
  let model: PersonDetailModel
  /// The narrow iPad inspector column: one column, and the name in the content (the inspector
  /// has no navigation title).
  var isInspector = false

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock
  @Environment(\.peopleLayout) private var layout

  var body: some View {
    let todayKey = OrgCalendar.dayKey(clock.now, timeZone: timeZone)
    Group {
      if let detail = model.detail {
        loaded(detail, todayKey: todayKey)
      } else if let message = model.errorMessage {
        EmptyState(
          "Person details failed to load.", artwork: .symbol(.alert),
          description: Text(verbatim: message)
        ) {
          Button("Retry") { model.retry() }
            .buttonStyle(.pill(.secondary))
        }
        .padding(.top, Spacing.huge)
      } else {
        PersonDetailSkeleton(showsName: isInspector)
      }
    }
  }

  @ViewBuilder
  private func loaded(_ detail: PeopleDashboardPersonDetail, todayKey: String) -> some View {
    let signals = model.signals(todayKey: todayKey)
    VStack(alignment: .leading, spacing: Spacing.lg) {
      PersonHeaderBlock(
        person: detail.person, name: model.name ?? detail.person.name, subtitle: model.subtitle,
        signals: signals, showsName: isInspector)
      if model.errorMessage != nil {
        InfoBanner("Person details failed to load.", tone: .destructive) {
          Button("Retry") { model.retry() }
        }
      }
      if layout >= .medium, !isInspector {
        HStack(alignment: .top, spacing: Spacing.lg) {
          VStack(spacing: Spacing.lg) {
            numbers(detail.person.rhythm)
            month(detail, todayKey: todayKey)
          }
          VStack(spacing: Spacing.lg) {
            aside(detail, signals: signals, todayKey: todayKey)
          }
          .frame(width: layout == .wide ? 340 : 300)
        }
      } else {
        numbers(detail.person.rhythm)
        month(detail, todayKey: todayKey)
        aside(detail, signals: signals, todayKey: todayKey)
      }
    }
  }

  private func numbers(_ rhythm: ServingRhythm) -> some View {
    PersonServingNumbers(rhythm: rhythm)
      .environment(\.peopleLayout, isInspector ? .compact : layout)
  }

  private func month(_ detail: PeopleDashboardPersonDetail, todayKey: String) -> some View {
    PersonMonthCard(
      detail: detail, todayKey: todayKey, blockouts: model.blockouts.value ?? [],
      isLoading: model.isLoadingMonth, direction: model.pagingDirection,
      onPrevious: model.showPreviousMonth, onNext: model.showNextMonth)
  }

  @ViewBuilder
  private func aside(
    _ detail: PeopleDashboardPersonDetail, signals: [PersonSignal], todayKey: String
  ) -> some View {
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.md) {
        PeopleCardHeader(Text("Signals"), icon: AppSymbol.checkIn.image)
        if signals.isEmpty {
          Text("Nothing needs attention.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        } else {
          SignalList(signals: signals)
        }
      }
    }
    .accessibilityElement(children: .contain)
    RotationCard(rhythm: detail.person.rhythm, todayKey: todayKey, monthDays: detail.person.monthDays, month: detail.month)
    BlockoutsCard(state: model.blockouts)
  }
}

/// Avatar, teams and roles, and signal chips. The pushed page's name is its navigation title;
/// the inspector shows it here.
private struct PersonHeaderBlock: View {
  let person: PeopleDashboardPerson
  let name: String
  let subtitle: String
  let signals: [PersonSignal]
  let showsName: Bool

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.md))
      : AnyLayout(HStackLayout(alignment: .center, spacing: Spacing.lg))
    layout {
      PersonAvatar(name: name, photoURL: PeopleLinks.photo(person.photoThumbnailUrl), size: .hero)
      VStack(alignment: .leading, spacing: Spacing.sm) {
        if showsName {
          Text(verbatim: name)
            .font(.title2.weight(.semibold))
            .foregroundStyle(.ink)
            .accessibilityAddTraits(.isHeader)
        }
        if !subtitle.isEmpty {
          Text(verbatim: subtitle)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        if !signals.isEmpty {
          FlowChips(signals: signals)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, Spacing.xs)
    .accessibilityElement(children: .combine)
  }
}

/// One-directional counts: served looks back, scheduled looks ahead (the web's
/// `ServingNumbers`).
private struct PersonServingNumbers: View {
  let rhythm: ServingRhythm

  var body: some View {
    MetricGrid {
      MetricTile(label: Text("Served, last 30 days"), value: "\(Int(rhythm.servedDays30))")
      MetricTile(label: Text("Served, last 90 days"), value: "\(Int(rhythm.servedDays90))")
      MetricTile(label: Text("Scheduled, next 30 days"), value: "\(Int(rhythm.upcomingDays30))")
      MetricTile(
        label: Text("Declined, last 6 months"),
        value: rhythm.requests180 == 0
          ? "-" : "\(Int(rhythm.declined180)) of \(Int(rhythm.requests180))",
        accessibilityValue: rhythm.requests180 == 0 ? Text("No requests") : nil)
    }
  }
}

/// When they last served, when they serve next (tapping opens that plan when this month has
/// it), and how often they usually serve (the web's `Rotation`).
private struct RotationCard: View {
  let rhythm: ServingRhythm
  let todayKey: String
  let monthDays: [PeopleDashboardMonthDay]
  let month: PeopleDashboardMonth

  @Environment(AppRouter.self) private var router

  var body: some View {
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        PeopleCardHeader(Text("Rotation"), icon: AppSymbol.times.image)
          .padding(.horizontal, Spacing.lg)
          .padding(.top, Spacing.lg)
          .padding(.bottom, Spacing.sm)
        row("Last served") {
          if let last = rhythm.lastServedOn {
            VStack(alignment: .trailing, spacing: Spacing.xxs) {
              Text(verbatim: TeamHealthText.formatWeekdayDayKey(last)).foregroundStyle(.ink)
              Text(
                verbatim: TeamHealthText.describeDaysAgo(
                  OrgCalendar.daysRefMinusItem(itemDayKey: last, refDayKey: todayKey))
              )
              .font(.meta)
              .foregroundStyle(.inkSecondary)
            }
          } else {
            Text("Not in 6 months").foregroundStyle(.inkSecondary)
          }
        }
        Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg)
        nextServing
        Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg)
        row("Usually serves") {
          if let gap = rhythm.typicalGapDays {
            Text(verbatim: TeamHealthText.describeCadence(typicalGapDays: gap)).foregroundStyle(.ink)
          } else {
            Text("Not enough history").foregroundStyle(.inkSecondary)
          }
        }
        .padding(.bottom, Spacing.xs)
      }
    }
    .accessibilityElement(children: .contain)
  }

  @ViewBuilder private var nextServing: some View {
    if let next = rhythm.nextServingOn {
      let route = planRoute(on: next)
      if let route {
        Button {
          router.push(.plan(route))
        } label: {
          row("Next serving") {
            HStack(spacing: Spacing.xs) {
              Text(verbatim: TeamHealthText.formatWeekdayDayKey(next)).foregroundStyle(.ink)
              Image(symbol: .chevronRight)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.inkTertiary)
            }
          }
          .contentShape(.rect)
        }
        .buttonStyle(PersonRowButtonStyle())
        .accessibilityHint(Text("Opens the plan"))
      } else {
        row("Next serving") {
          Text(verbatim: TeamHealthText.formatWeekdayDayKey(next)).foregroundStyle(.ink)
        }
      }
    } else {
      row("Next serving") {
        Text("Not scheduled").foregroundStyle(.inkSecondary)
      }
    }
  }

  /// The plan of their service on `dayKey`, when the month on screen holds it.
  private func planRoute(on dayKey: String) -> PlanRoute? {
    guard dayKey.hasPrefix(peopleDashboardMonthKey(month)), let day = Int(dayKey.suffix(2)) else {
      return nil
    }
    return monthDays.first { $0.dayNumber == day && $0.kind == .service }.flatMap(PeopleLinks.planRoute)
  }

  private func row<Value: View>(_ label: LocalizedStringKey, @ViewBuilder value: () -> Value) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Text(label)
        .foregroundStyle(.inkSecondary)
      Spacer(minLength: Spacing.md)
      value()
        .multilineTextAlignment(.trailing)
    }
    .font(.rowDetail.monospacedDigit())
    .padding(.horizontal, Spacing.lg)
    .frame(minHeight: Metrics.minimumTapTarget + 4)
    .accessibilityElement(children: .combine)
  }
}
