import PCOBoosterCore
import SwiftUI

/// A person's month: a compact calendar tinted by commitment (with blocked-out days striped),
/// paging by month with the chevrons or a sideways swipe, and the month's schedule split into
/// what's coming up and what already happened. Each commitment opens its plan (the web's
/// month card in `detail-body.tsx`).
struct PersonMonthCard: View {
  let detail: PeopleDashboardPersonDetail
  let todayKey: String
  let blockouts: [Blockout]
  /// The month on screen is a stand-in while the requested month loads.
  let isLoading: Bool
  /// +1 after paging forward, -1 after paging back.
  let direction: Int
  let onPrevious: () -> Void
  let onNext: () -> Void

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.peopleLayout) private var layout
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var pageTurns = 0

  private var monthKey: String { peopleDashboardMonthKey(detail.month) }

  var body: some View {
    let monthDays = detail.person.monthDays
    let blocked = BlockoutDays.days(in: detail.month, blockouts: blockouts, fallbackZone: timeZone)
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        header
          .padding(Spacing.lg)
        Group {
          if layout >= .medium {
            HStack(alignment: .top, spacing: Spacing.xl) {
              calendar(monthDays: monthDays, blocked: blocked)
                .frame(width: 280)
              CommitmentList(detail: detail, todayKey: todayKey)
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.md)
          } else {
            VStack(alignment: .leading, spacing: Spacing.md) {
              calendar(monthDays: monthDays, blocked: blocked)
                .padding(.horizontal, Spacing.lg)
              CommitmentList(detail: detail, todayKey: todayKey)
            }
            .padding(.bottom, Spacing.sm)
          }
        }
        .id(monthKey)
        .transition(pageTransition)
        .staleWhileRefreshing(isLoading)
        if detail.requestBudget.unresolvedRehearsalTimes > 0 {
          Text("Some rehearsal times couldn't be loaded, so those show on the service date.")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.lg)
        }
      }
      .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.32)), value: monthKey)
    }
    .haptic(.selection, trigger: pageTurns)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("person-month")
  }

  private var pageTransition: AnyTransition {
    guard !reduceMotion else { return .opacity }
    let edge: Edge = direction >= 0 ? .trailing : .leading
    return .asymmetric(
      insertion: .move(edge: edge).combined(with: .opacity),
      removal: .opacity)
  }

  private var header: some View {
    PeopleCardHeader(
      Text(verbatim: detail.month.label), icon: Image(systemName: PeopleGlyph.month),
      description: Text(verbatim: PeopleScreens.describeMonth(detail.person.monthDays))
    ) {
      HStack(spacing: Spacing.xs) {
        if isLoading {
          ProgressView()
            .controlSize(.small)
            .padding(.trailing, Spacing.xs)
        }
        Button {
          pageTurns += 1
          onPrevious()
        } label: {
          Image(symbol: .chevronLeft)
        }
        .accessibilityLabel(Text("Previous month"))
        .accessibilityIdentifier("person-month-previous")
        Button {
          pageTurns += 1
          onNext()
        } label: {
          Image(symbol: .chevronRight)
        }
        .accessibilityLabel(Text("Next month"))
        .accessibilityIdentifier("person-month-next")
      }
      .buttonStyle(.bordered)
      .buttonBorderShape(.circle)
      .controlSize(.small)
      .tint(.ink)
    }
  }

  private func calendar(monthDays: [PeopleDashboardMonthDay], blocked: Set<Int>) -> some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      PersonMonthCalendar(
        month: detail.month, monthDays: monthDays, blockedDays: blocked,
        today: PeopleScreens.todayInMonth(todayKey: todayKey, month: detail.month))
      CommitmentLegend(showsBlockouts: !blocked.isEmpty)
    }
    .contentShape(.rect)
    .simultaneousGesture(
      DragGesture(minimumDistance: 24)
        .onEnded { value in
          let horizontal = value.translation.width
          guard abs(horizontal) > 60, abs(horizontal) > abs(value.translation.height) * 1.5 else {
            return
          }
          pageTurns += 1
          if horizontal < 0 { onNext() } else { onPrevious() }
        }
    )
    .accessibilityAction(named: Text("Previous month")) { onPrevious() }
    .accessibilityAction(named: Text("Next month")) { onNext() }
  }
}

/// The month's commitments in date order, split around today when the month is the current
/// one. Each opens its plan's Lineup.
private struct CommitmentList: View {
  let detail: PeopleDashboardPersonDetail
  let todayKey: String

  var body: some View {
    let entries = detail.person.monthDays
    let monthKey = peopleDashboardMonthKey(detail.month)
    let currentMonth = String(todayKey.prefix(7))
    if entries.isEmpty {
      Text(verbatim: PeopleScreens.emptyMonthText(detail.month))
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else if monthKey == currentMonth,
      let today = PeopleScreens.todayInMonth(todayKey: todayKey, month: detail.month)
    {
      let upcoming = entries.filter { $0.dayNumber >= today }
      let earlier = entries.filter { $0.dayNumber < today }
      VStack(alignment: .leading, spacing: Spacing.sm) {
        if !upcoming.isEmpty {
          group("Coming up", entries: upcoming, isPast: false)
        }
        if !earlier.isEmpty {
          group("Earlier this month", entries: earlier, isPast: true)
        }
      }
    } else {
      group(nil, entries: entries, isPast: monthKey < currentMonth)
    }
  }

  private func group(_ title: LocalizedStringKey?, entries: [PeopleDashboardMonthDay], isPast: Bool)
    -> some View
  {
    VStack(alignment: .leading, spacing: 0) {
      if let title {
        Text(title)
          .font(.sectionLabel)
          .foregroundStyle(.inkSecondary)
          .padding(.horizontal, Spacing.lg)
          .padding(.vertical, Spacing.xs)
          .accessibilityAddTraits(.isHeader)
      }
      ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
        CommitmentRow(month: detail.month, entry: entry, isPast: isPast)
        if index < entries.count - 1 {
          Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg + 52)
        }
      }
    }
  }
}

/// "Sun 4 · Keys · Sunday Gathering · Confirmed", opening the plan when tapped.
private struct CommitmentRow: View {
  let month: PeopleDashboardMonth
  let entry: PeopleDashboardMonthDay
  let isPast: Bool

  @Environment(AppRouter.self) private var router

  var body: some View {
    if let route = PeopleLinks.planRoute(entry) {
      Button {
        router.push(.plan(route))
      } label: {
        content(showsChevron: true)
      }
      .buttonStyle(PersonRowButtonStyle())
      .accessibilityHint(Text("Opens the plan"))
    } else {
      content(showsChevron: false)
    }
  }

  private func content(showsChevron: Bool) -> some View {
    HStack(alignment: .center, spacing: Spacing.md) {
      VStack(spacing: 0) {
        Text(verbatim: DashboardCalendar.formatWeekday(month, day: entry.dayNumber))
          .font(.caption2.weight(.medium))
          .foregroundStyle(.inkSecondary)
          .textCase(.uppercase)
        Text(verbatim: "\(entry.dayNumber)")
          .font(.title3.weight(.semibold).monospacedDigit())
          .foregroundStyle(isPast ? Color.inkSecondary : Color.ink)
      }
      .frame(width: 40)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: entry.positionName ?? "Scheduled")
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(2)
        if let secondary {
          Text(verbatim: secondary)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: Spacing.xs + 2) {
        CommitmentDotView(dot: entry.dot)
        if entry.kind != .rehearsal {
          Text(verbatim: DashboardCalendar.statusLabel(entry.status))
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
      }
      .fixedSize()
      if showsChevron {
        Image(symbol: .chevronRight)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.inkTertiary)
          .accessibilityHidden(true)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.sm)
    .frame(minHeight: Metrics.minimumTapTarget + 8)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: accessibilityLabel))
  }

  private var secondary: String? {
    var parts: [String] = []
    if entry.kind == .rehearsal {
      parts.append("Rehearsal")
    }
    if let serviceType = entry.serviceTypeName, !serviceType.isEmpty {
      parts.append(serviceType)
    }
    return parts.isEmpty ? nil : parts.joined(separator: PeopleScreens.separator)
  }

  private var accessibilityLabel: String {
    "\(DashboardCalendar.formatWeekdayMonthDay(month, day: entry.dayNumber)), \(entry.engagement), \(PeopleScreens.commitmentEntryText(entry))"
  }
}
