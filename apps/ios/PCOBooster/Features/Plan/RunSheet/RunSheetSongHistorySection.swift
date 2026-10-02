import PCOBoosterCore
import SwiftUI

/// Every service that scheduled the song over the past year, newest first, with the key each
/// sang it in, counted from the plan's date: how often before it, and how often here
/// (`SongHistory` in `song-history.tsx`). Facts only.
struct RunSheetSongHistorySection: View {
  let songId: String
  let serviceTypeId: String
  let planId: String
  let planDate: Date
  /// Rows shown before "Show all".
  let previewRows: Int

  @ScreenModel private var model: SongHistoryModel
  @State private var showsAll = false
  @Environment(\.orgTimeZone) private var timeZone

  init(songId: String, serviceTypeId: String, planId: String, planDate: Date, previewRows: Int) {
    self.songId = songId
    self.serviceTypeId = serviceTypeId
    self.planId = planId
    self.planDate = planDate
    self.previewRows = previewRows
    _model = ScreenModel { app in SongHistoryModel(queries: app.queries, songId: songId) }
  }

  var body: some View {
    Group {
      if let history = model.history.value {
        loaded(history)
      } else if let message = model.history.errorMessage {
        HStack(alignment: .firstTextBaseline) {
          Text("History didn\u{2019}t load.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .accessibilityHint(Text(verbatim: message))
          Spacer()
          Button("Try Again") { model.history.retry() }
            .buttonStyle(.pill(.outline, size: .small))
        }
      } else {
        VStack(alignment: .leading, spacing: Spacing.sm) {
          Skeleton(.text, width: 180)
          Skeleton(.text)
          Skeleton(.text, width: 220)
        }
        .padding(.vertical, Spacing.xs)
      }
    }
    .queryLifecycle(model.history, model.serviceTypes)
  }

  @ViewBuilder private func loaded(_ history: [SongHistoryEntry]) -> some View {
    let summary = summarizeSongHistory(history, planDate: planDate, serviceTypeId: serviceTypeId)
    let rows = showsAll ? history : Array(history.prefix(previewRows))
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Text(
        verbatim: songHistoryCountLabel(
          summary, serviceTypeName: model.serviceTypeName(serviceTypeId))
      )
      .font(.meta)
      .foregroundStyle(.inkSecondary)
      .monospacedDigit()
      if rows.isEmpty {
        Text("Not scheduled in the past year.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(rows.enumerated()), id: \.offset) { _, entry in
            historyRow(entry)
          }
        }
      }
      if history.count > previewRows {
        Button(showsAll ? "Show Less" : "Show All \(history.count)") {
          withAnimation(Motion.reveal) { showsAll.toggle() }
        }
        .font(.meta.weight(.medium))
        .buttonStyle(.borderless)
        .foregroundStyle(.ink)
      }
    }
  }

  private func historyRow(_ entry: SongHistoryEntry) -> some View {
    let sameYear =
      OrgCalendar.dayKey(entry.sortDate, timeZone: timeZone).prefix(4)
      == OrgCalendar.dayKey(planDate, timeZone: timeZone).prefix(4)
    let date = OrgCalendar.label(
      entry.sortDate, timeZone: timeZone, style: sameYear ? .monthDay : .monthDayYear)
    let note = note(for: entry)
    return HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Text(verbatim: date)
        .font(.meta.monospacedDigit())
        .foregroundStyle(.inkSecondary)
        .frame(minWidth: 64, alignment: .leading)
      HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
        Text(verbatim: entry.serviceTypeName.isEmpty ? "Unknown service" : entry.serviceTypeName)
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .lineLimit(1)
        if let note {
          Text(verbatim: note)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let key = entry.startingKey {
        Text(verbatim: KeyBadge.display(key))
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
    }
    .frame(minHeight: 30)
    .accessibilityElement(children: .combine)
  }

  /// "this plan" for the plan being built, "later" for plans after its date.
  private func note(for entry: SongHistoryEntry) -> String? {
    if let entryPlanId = entry.planId, entryPlanId == planId {
      return String(localized: "this plan")
    }
    return entry.sortDate > planDate ? String(localized: "later") : nil
  }
}
