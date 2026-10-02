import PCOBoosterCore
import SwiftUI

/// A plan in Search, laid out like an agenda row: the date tile, the service type, and the
/// plan and series titles, with "Today", "Tomorrow", or "In 5 days" for plans in the next two
/// weeks.
struct PlanResultRow: View {
  let hit: PlanHit
  var query = ""
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock

  var body: some View {
    let row = hit.row
    let isToday = OrgCalendar.dayKey(row.sortDate, timeZone: timeZone)
      == OrgCalendar.dayKey(clock.now, timeZone: timeZone)
    HStack(spacing: Spacing.md) {
      SearchDateTile(date: row.sortDate, timeZone: timeZone, isToday: isToday)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        HighlightedText(text: row.serviceTypeName, query: query, font: .rowTitleEmphasized)
          .lineLimit(1)
        if let detail = row.detailText {
          HighlightedText(text: detail, query: query, font: .rowDetail, color: .inkSecondary)
            .lineLimit(1)
            .truncationMode(.middle)
        }
      }
      Spacer(minLength: Spacing.sm)
      if let relative = formatPlanRelativeDay(row.sortDate, now: clock.now, timeZone: timeZone) {
        Text(verbatim: relative)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .lineLimit(1)
      }
    }
    .padding(.vertical, Spacing.xxs)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
  }

  private var accessibilityLabel: Text {
    let row = hit.row
    let date = formatPlanDate(row.sortDate, timeZone: timeZone)
    if let detail = row.detailText {
      return Text(verbatim: "\(row.serviceTypeName), \(date), \(detail)")
    }
    return Text(verbatim: "\(row.serviceTypeName), \(date)")
  }
}

/// The long-press preview of a plan: the date, service type, titles, and how far away it is.
struct PlanResultPreview: View {
  let hit: PlanHit
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock

  var body: some View {
    let row = hit.row
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md) {
        SearchDateTile(date: row.sortDate, timeZone: timeZone)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: row.serviceTypeName)
            .font(.cardTitle)
            .foregroundStyle(.ink)
          Text(verbatim: formatPlanDate(row.sortDate, timeZone: timeZone))
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        }
      }
      if !row.planTitle.isEmpty {
        Text(verbatim: row.planTitle)
          .font(.pageTitle)
          .foregroundStyle(.ink)
      }
      if let series = row.seriesTitle, !series.isEmpty {
        Label {
          Text(verbatim: series)
        } icon: {
          Image(systemName: "square.stack")
        }
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
      }
      if let relative = formatPlanRelativeDay(row.sortDate, now: clock.now, timeZone: timeZone) {
        StatusBadge(LocalizedStringKey(relative), tone: .info)
      }
    }
    .padding(Spacing.xl)
    .frame(width: 320, alignment: .leading)
    .background(.surfaceCard)
  }
}
