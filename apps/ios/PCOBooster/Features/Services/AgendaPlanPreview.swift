import Observation
import PCOBoosterCore
import SwiftUI

/// A long-press preview of a plan: its date, titles, how full the roster is, the songs with
/// their keys, and the times. It loads the three reads the Overview opens with only once the
/// preview shows (a deliberate long press), so they are cached if the plan is opened next.
struct AgendaPlanPreview: View {
  let row: ServicePlanRow
  let isScheduled: Bool
  let queries: QueryClient
  let timeZone: String
  @State private var model: AgendaPreviewModel?

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      header
      Hairline(color: .hairlineSubtle)
      staffing
      songs
      times
    }
    .padding(Spacing.xl)
    .frame(width: 340, alignment: .leading)
    .background(.surfaceCard)
    .environment(\.orgTimeZone, timeZone)
    .environment(\.surfaceColor, .surfaceCard)
    .task {
      if model == nil {
        model = AgendaPreviewModel(queries: queries, row: row)
      }
    }
  }

  private var header: some View {
    HStack(alignment: .center, spacing: Spacing.md) {
      AgendaDateTile(date: row.sortDate)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: row.serviceTypeName)
          .font(.footnote.weight(.medium))
          .foregroundStyle(.inkSecondary)
        Text(verbatim: row.planTitle.isEmpty ? row.serviceTypeName : row.planTitle)
          .font(.cardTitle)
          .foregroundStyle(.ink)
          .lineLimit(2)
        if let series = row.seriesTitle, !series.isEmpty {
          Text(verbatim: series)
            .font(.footnote)
            .foregroundStyle(.inkSecondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
      if isScheduled {
        AgendaScheduledMark()
      }
    }
  }

  @ViewBuilder private var staffing: some View {
    if let staffing = model?.staffing {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        previewLabel(
          "People",
          detail: staffing.total == 0
            ? "No positions yet"
            : "\(staffing.confirmed + staffing.pending) of \(staffing.total) filled \u{B7} \(staffing.open) open")
        if staffing.total > 0 {
          OverviewStaffingBar(confirmed: staffing.confirmed, pending: staffing.pending, total: staffing.total, height: 6)
        }
      }
    } else {
      placeholder(label: "People")
    }
  }

  @ViewBuilder private var songs: some View {
    if let order = model?.order {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        previewLabel("Songs", detail: order.songs.isEmpty ? "None yet" : songSummary(order))
        ForEach(order.songs.prefix(4)) { song in
          HStack(spacing: Spacing.sm) {
            Text(verbatim: song.title)
              .font(.subheadline)
              .foregroundStyle(.ink)
              .lineLimit(1)
              .frame(maxWidth: .infinity, alignment: .leading)
            KeyBadge(song.keyLabel?.components(separatedBy: " to ").first)
          }
        }
      }
    } else {
      placeholder(label: "Songs")
    }
  }

  @ViewBuilder private var times: some View {
    if let schedule = model?.schedule {
      previewLabel("Times", detail: timesSummary(schedule))
    } else {
      placeholder(label: "Times")
    }
  }

  private func previewLabel(_ title: LocalizedStringKey, detail: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title)
        .font(.footnote.weight(.medium))
        .foregroundStyle(.inkSecondary)
      Spacer(minLength: Spacing.sm)
      Text(verbatim: detail)
        .font(.footnote.monospacedDigit())
        .foregroundStyle(.ink)
        .lineLimit(1)
    }
  }

  private func placeholder(label: LocalizedStringKey) -> some View {
    HStack {
      Text(label)
        .font(.footnote.weight(.medium))
        .foregroundStyle(.inkSecondary)
      Spacer()
      Skeleton(.text, width: 110, height: 10)
    }
  }

  private func songSummary(_ order: PlanOrder) -> String {
    let songs = order.songs.count == 1 ? "1 song" : "\(order.songs.count) songs"
    guard let length = formatDuration(seconds: order.serviceLength) else { return songs }
    return "\(songs) \u{B7} \(length)"
  }

  /// "9:00 AM, 11:00 AM": the service times on the plan's own day, else how many times.
  private func timesSummary(_ schedule: PlanSchedule) -> String {
    let services = schedule.times.filter { $0.timeType == .service }
    guard !services.isEmpty else {
      return schedule.times.isEmpty ? "None yet" : "\(schedule.times.count) times"
    }
    return services.prefix(3).map { OrgCalendar.timeOfDay($0.startsAt, timeZone: timeZone) }
      .joined(separator: ", ")
  }
}

/// The preview's reads, started when the preview appears.
@MainActor
@Observable
final class AgendaPreviewModel {
  let teamPositions: QueryState<[TeamPositionGroup]>
  let planItems: QueryState<[PlanItem]>
  let planTimes: QueryState<[PlanTime]>

  init(queries: QueryClient, row: ServicePlanRow) {
    let serviceTypeId = row.serviceTypeId
    let planId = row.planId
    teamPositions = queries.query(
      .teamPositions(serviceTypeId: serviceTypeId, planId: planId), RPC.Catalog.teamPositions,
      TeamPositionsInput(serviceTypeId: serviceTypeId, planId: planId, seriesId: row.seriesId))
    planItems = queries.query(
      .planItems(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanItems.list,
      PlanItemsListInput(serviceTypeId: serviceTypeId, planId: planId))
    planTimes = queries.query(
      .planTimes(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanTimes.list,
      PlanTimesListInput(serviceTypeId: serviceTypeId, planId: planId))
  }

  var staffing: PlanStaffing? { teamPositions.value.map(summarizeStaffing) }
  var order: PlanOrder? { planItems.value.map(summarizeOrder) }
  var schedule: PlanSchedule? { planTimes.value.map(summarizeTimes) }
}
