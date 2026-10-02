import PCOBoosterCore
import SwiftUI

/// One plan time, Calendar-list style: the start and end in a tabular column (organization
/// zone), a thin bar in the type's tint, then the name, the type and length, and who it is for
/// (teams and positions, plus the people serving at it). At accessibility text sizes the clock
/// column moves above the details.
struct PlanTimeRow: View {
  let time: PlanTime
  let groups: [TeamPositionGroup]?
  let assignmentsLoading: Bool
  let timeZone: String

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .body) private var clockWidth: CGFloat = 74

  var body: some View {
    let stacked = dynamicTypeSize.isAccessibilitySize
    let layout =
      stacked
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.xs))
      : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.md))
    layout {
      clockColumn(stacked: stacked)
      HStack(alignment: .top, spacing: Spacing.md) {
        Capsule()
          .fill(PlanTimeKind(time.timeType).tint)
          .frame(width: 3)
          .accessibilityHidden(true)
        details
      }
      .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, Spacing.xs)
    .frame(maxWidth: .infinity, alignment: .leading)
    .opacity(TimeFacts.isPending(time) ? 0.55 : 1)
  }

  // MARK: Clock

  @ViewBuilder private func clockColumn(stacked: Bool) -> some View {
    let start = TimeFacts.clock(time.startsAt, timeZone: timeZone)
    let end = TimeFacts.endClock(time, timeZone: timeZone)
    if stacked {
      Text(verbatim: end.map { "\(start) to \($0)" } ?? start)
        .font(.rowDetail.weight(.medium))
        .monospacedDigit()
        .foregroundStyle(.inkSecondary)
    } else {
      VStack(alignment: .trailing, spacing: Spacing.xxs) {
        Text(verbatim: start)
          .font(.rowTitle)
          .foregroundStyle(.ink)
        if let end {
          Text(verbatim: end)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        }
      }
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .frame(width: clockWidth, alignment: .trailing)
    }
  }

  // MARK: Details

  private var details: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: TimeFacts.displayName(time))
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        Text(verbatim: kindLine)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
      whoLine
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// "Service · 1h 15m" (just the length when the type is already the title), or "Adding" while
  /// the time is being created.
  private var kindLine: String {
    if TimeFacts.isPending(time) {
      return "Adding"
    }
    let kind = PlanTimeKind(time.timeType).label
    let length = TimeFacts.durationSeconds(time).map(TimeFacts.durationLabel(seconds:))
    let parts = TimeFacts.nameRepeatsType(time) ? [length ?? "No end time"] : [kind, length]
    return parts.compactMap { $0 }.joined(separator: " \u{B7} ")
  }

  @ViewBuilder private var whoLine: some View {
    let people = TimeAssignments.people(at: time.id, in: groups)
    let summary = TimeAssignments.rowSummary(time, groups: groups)
    if assignmentsLoading, !time.assignedTeamIds.isEmpty || !time.assignedPositionIds.isEmpty {
      Skeleton(.text, width: 120, height: 10)
        .padding(.vertical, Spacing.xxs)
    } else if summary != nil || !people.isEmpty {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Spacing.sm) {
          summaryText(summary)
          peopleBadge(people)
        }
        VStack(alignment: .leading, spacing: Spacing.xs) {
          summaryText(summary)
          peopleBadge(people)
        }
      }
    } else {
      Text("No teams assigned")
        .font(.meta)
        .foregroundStyle(.inkTertiary)
    }
  }

  @ViewBuilder private func summaryText(_ summary: String?) -> some View {
    if let summary {
      Label {
        Text(verbatim: summary)
      } icon: {
        Image(symbol: .people)
      }
      .labelStyle(TimesInlineLabelStyle())
      .font(.meta)
      .foregroundStyle(.inkSecondary)
    }
  }

  /// Who serves at the time: a few faces and "+N" for the rest (the count is spoken).
  @ViewBuilder private func peopleBadge(_ people: [TimePersonOption]) -> some View {
    if !people.isEmpty {
      TimesAvatarStack(people: people, limit: 3, size: .small)
        .fixedSize()
    }
  }

  // MARK: Accessibility

  /// "9 AM Gathering, Service, Sunday, Oct 4, 9:00 AM to 10:15 AM, 1 hour, 15 minutes, All teams,
  /// 14 people".
  var spokenLabel: String {
    var parts = [TimeFacts.displayName(time)]
    if !TimeFacts.nameRepeatsType(time) {
      parts.append(PlanTimeKind(time.timeType).label)
    }
    parts.append(TimeFacts.spokenRange(time, timeZone: timeZone))
    if let seconds = TimeFacts.durationSeconds(time) {
      parts.append(TimeFacts.spokenDuration(seconds: seconds))
    }
    if let summary = TimeAssignments.rowSummary(time, groups: groups) {
      parts.append(summary)
    }
    let people = TimeAssignments.people(at: time.id, in: groups).count
    if people > 0 {
      parts.append(TimeAssignments.counted(people, "person", "people"))
    }
    if TimeFacts.isPending(time) {
      parts.append("Adding")
    }
    return parts.joined(separator: ", ")
  }
}

/// A small leading glyph with a tight gap, for meta lines.
struct TimesInlineLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: Spacing.xs) {
      configuration.icon.imageScale(.small).foregroundStyle(.inkTertiary)
      configuration.title
    }
  }
}
