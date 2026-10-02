import PCOBoosterCore
import SwiftUI

/// The context menu preview for a plan time: its name, type, and range in the organization's
/// zone, who it is for, and the people serving at it, on a solid card.
struct PlanTimePreviewCard: View {
  let time: PlanTime
  let groups: [TeamPositionGroup]?
  let timeZone: String

  var body: some View {
    let kind = PlanTimeKind(time.timeType)
    let people = TimeAssignments.people(at: time.id, in: groups)
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md) {
        Image(symbol: kind.symbol)
          .font(.body.weight(.medium))
          .foregroundStyle(.ink)
          .frame(width: 36, height: 36)
          .background(kind.tint.opacity(0.35), in: .rect(cornerRadius: Radius.control, style: .continuous))
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: TimeFacts.displayName(time))
            .font(.cardTitle)
            .foregroundStyle(.ink)
          Text(verbatim: kindLine)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        }
      }
      Text(verbatim: TimeFacts.rangeLabel(time, timeZone: timeZone))
        .font(.rowDetail.monospacedDigit())
        .foregroundStyle(.ink)
      Hairline()
      Label {
        Text(verbatim: TimeAssignments.rowSummary(time, groups: groups) ?? "No teams assigned")
      } icon: {
        Image(symbol: .people)
      }
      .labelStyle(TimesInlineLabelStyle())
      .font(.rowDetail)
      .foregroundStyle(.inkSecondary)
      if !people.isEmpty {
        VStack(alignment: .leading, spacing: Spacing.sm) {
          TimesAvatarStack(people: people, limit: 8, size: .regular)
          Text(verbatim: names(people))
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(3)
        }
      }
    }
    .padding(Spacing.lg)
    .frame(width: 320, alignment: .leading)
    .background(.surfaceCard)
    .environment(\.surfaceColor, .surfaceCard)
  }

  private var kindLine: String {
    let kind = PlanTimeKind(time.timeType).label
    guard let seconds = TimeFacts.durationSeconds(time) else { return kind }
    return "\(kind) \u{B7} \(TimeFacts.durationLabel(seconds: seconds))"
  }

  private func names(_ people: [TimePersonOption]) -> String {
    let shown = people.prefix(6).map(\.name)
    let rest = people.count - shown.count
    return rest > 0
      ? "\(shown.joined(separator: ", ")), and \(rest) more" : shown.formatted(.list(type: .and))
  }
}
