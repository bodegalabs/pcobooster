import PCOBoosterCore
import SwiftUI

/// The plan's times in start order (`summarizeTimes`): the organization calendar day and time of
/// day, with the time's name or type.
struct OverviewTimesCard: View {
  let schedule: PlanSchedule?
  let loadError: String?
  let onRetry: () -> Void
  let onOpenTimes: () -> Void
  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    OverviewCard(
      "Times", systemImage: "clock", summary: summary,
      isSummaryLoading: schedule == nil && loadError == nil
    ) {
      OverviewSegmentLink(segment: .times, action: onOpenTimes)
    } content: {
      if let schedule {
        if schedule.times.isEmpty {
          Text("No times on this plan yet.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        } else {
          VStack(spacing: 0) {
            ForEach(Array(schedule.times.enumerated()), id: \.element.id) { index, time in
              if index > 0 {
                Hairline(color: .hairlineSubtle)
              }
              TimeRow(time: time, timeZone: timeZone)
            }
          }
        }
      } else if let loadError {
        OverviewLoadError(title: "Couldn't load times", message: loadError, retry: onRetry)
      } else {
        OverviewRowsSkeleton(rows: 2)
      }
    }
  }

  private var summary: Text? {
    guard let schedule else { return nil }
    return schedule.times.count == 1 ? Text("1 time") : Text("\(schedule.times.count) times")
  }
}

private struct TimeRow: View {
  let time: PlanTime
  let timeZone: String

  var body: some View {
    HStack(spacing: Spacing.md) {
      Text(
        "\(Text(verbatim: OrgCalendar.label(time.startsAt, timeZone: timeZone, style: .weekdayMonthDay)).foregroundStyle(.ink))\(Text(verbatim: " \u{B7} \(OrgCalendar.timeOfDay(time.startsAt, timeZone: timeZone))").foregroundStyle(.inkSecondary))"
      )
        .font(.rowTitle.monospacedDigit())
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      badge
    }
    .frame(minHeight: Metrics.minimumTapTarget - 4)
    .accessibilityElement(children: .combine)
  }

  /// The time's name, or its type when unnamed; services get a filled chip, others an outline.
  private var badge: some View {
    let name = time.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let isService = time.timeType == .service
    return Text(verbatim: name.isEmpty ? Self.typeLabel(time.timeType) : name)
      .font(.badgeLabel)
      .foregroundStyle(.ink)
      .lineLimit(1)
      .padding(.horizontal, Spacing.sm)
      .padding(.vertical, Spacing.xxs + 1)
      .background(isService ? Color.surfaceSecondary : .clear, in: .capsule)
      .hairlineBorder(.capsule, color: isService ? .clear : .hairline)
  }

  private static func typeLabel(_ type: PlanTimeType) -> String {
    switch type {
    case .service: "Service"
    case .rehearsal: "Rehearsal"
    case .other: "Other"
    case .unknown(let value): value.capitalized
    }
  }
}
