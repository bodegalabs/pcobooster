import PCOBoosterCore
import SwiftUI

/// Every plan with the song over the past year, and the ones already planned, with the key each
/// sang it in (`songs.history`). A row opens its plan's run sheet.
struct SongHistorySection: View {
  let model: SongDetailModel
  @Environment(AppRouter.self) private var router
  @Environment(\.orgTimeZone) private var timeZone
  @State private var showsAll = false

  /// Rows shown before "Show all".
  private static let previewCount = 8

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      if let history = model.history.value {
        if !model.upcoming.isEmpty {
          group(title: "Planned", entries: model.upcoming, total: model.upcoming.count)
        }
        pastGroup(hasAny: !history.isEmpty)
      } else if model.history.status != .failure {
        VStack(alignment: .leading, spacing: Spacing.sm) {
          SectionHeader("History").padding(.horizontal, Spacing.xs)
          SurfaceCard {
            VStack(alignment: .leading, spacing: Spacing.md) {
              ForEach(0..<4, id: \.self) { _ in
                HStack(spacing: Spacing.md) {
                  Skeleton(.text, width: 52, height: 10)
                  Skeleton(.text, width: 140, height: 12)
                  Spacer()
                  Skeleton(.round, width: 28, height: 20)
                }
              }
            }
          }
          .accessibilityLabel(Text("Loading history"))
        }
      }
    }
  }

  @ViewBuilder private func pastGroup(hasAny: Bool) -> some View {
    let past = model.past
    let shown = showsAll ? past : Array(past.prefix(Self.previewCount))
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader("Past year", count: past.isEmpty ? nil : past.count)
        .padding(.horizontal, Spacing.xs)
      if !model.serviceTypeCounts.isEmpty {
        Text(verbatim: countLine)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .padding(.horizontal, Spacing.xs)
      }
      SurfaceCard(padding: .none) {
        if past.isEmpty {
          Text(hasAny ? "Not sung in the past year." : "Not scheduled in the past year.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .padding(Spacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          VStack(spacing: 0) {
            rows(shown)
            if past.count > Self.previewCount {
              Hairline()
              Button {
                withAnimation(Motion.reveal) { showsAll.toggle() }
              } label: {
                Text(showsAll ? "Show less" : "Show all \(past.count)")
                  .font(.rowDetail.weight(.medium))
                  .foregroundStyle(.ink)
                  .frame(maxWidth: .infinity, minHeight: Metrics.minimumTapTarget)
                  .contentShape(.rect)
              }
              .buttonStyle(ArrangementRowButtonStyle())
            }
          }
        }
      }
    }
  }

  /// "Sung 12 times in the past year · 10 at Sunday Gathering, 2 at Youth Night".
  private var countLine: String {
    let total = model.summary?.timesThisYear ?? model.past.count
    let label = songHistoryCountLabel(timesThisYear: total, timesHere: 0, serviceTypeName: nil)
    let counts = model.serviceTypeCounts
    guard counts.count > 1 else {
      return counts.first.map { "\(label) \u{B7} \($0.name)" } ?? label
    }
    return "\(label) \u{B7} " + counts.map { "\($0.count) at \($0.name)" }.joined(separator: ", ")
  }

  private func group(title: LocalizedStringKey, entries: [SongHistoryEntry], total: Int) -> some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader(title, count: total)
        .padding(.horizontal, Spacing.xs)
      SurfaceCard(padding: .none) {
        VStack(spacing: 0) {
          rows(entries)
        }
      }
    }
  }

  @ViewBuilder private func rows(_ entries: [SongHistoryEntry]) -> some View {
    ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
      if index > 0 { Hairline().padding(.leading, Spacing.lg) }
      HistoryRow(
        entry: entry, now: model.now, timeZone: timeZone,
        namesArrangement: model.historyNamesArrangements,
        open: entry.planId.flatMap { planId in
          entry.serviceTypeId.map { serviceTypeId in
            { router.push(.plan(PlanRoute(serviceTypeId: serviceTypeId, planId: planId, view: .plan))) }
          }
        })
    }
  }
}

private struct HistoryRow: View {
  let entry: SongHistoryEntry
  let now: Date
  let timeZone: String
  let namesArrangement: Bool
  let open: (() -> Void)?
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    if let open {
      Button(action: open) { content(showsChevron: true) }
        .buttonStyle(ArrangementRowButtonStyle())
        .accessibilityHint(Text("Opens the plan"))
    } else {
      content(showsChevron: false)
    }
  }

  private func content(showsChevron: Bool) -> some View {
    let stacked = dynamicTypeSize.isAccessibilitySize
    return HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      if !stacked {
        Text(verbatim: dateLabel)
          .font(.numericMeta)
          .foregroundStyle(.inkSecondary)
          .frame(width: 92, alignment: .leading)
      }
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        if stacked {
          Text(verbatim: dateLabel).font(.numericMeta).foregroundStyle(.inkSecondary)
        }
        Text(verbatim: entry.serviceTypeName.isEmpty ? String(localized: "Unknown service") : entry.serviceTypeName)
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(stacked ? 3 : 1)
        if let detail {
          Text(verbatim: detail)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let key = entry.startingKey, !key.isEmpty {
        KeyBadge(key)
      }
      if showsChevron {
        Image(symbol: .chevronRight)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .frame(minHeight: Metrics.minimumTapTarget + Spacing.sm)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }

  /// "Sun, Oct 4" this year, "Sun, Nov 9, 2025" before.
  private var dateLabel: String {
    let sameYear =
      OrgCalendar.dayKey(entry.sortDate, timeZone: timeZone).prefix(4)
      == OrgCalendar.dayKey(now, timeZone: timeZone).prefix(4)
    return OrgCalendar.label(
      entry.sortDate, timeZone: timeZone, style: sameYear ? .weekdayMonthDay : .monthDayYear)
  }

  /// The arrangement (when the history spans several) and a named key ("Jordan's key").
  private var detail: String? {
    var parts: [String] = []
    if namesArrangement, let name = entry.arrangementName, !name.isEmpty { parts.append(name) }
    if let keyName = entry.keyName, !keyName.isEmpty, keyName != "Original", keyName != entry.startingKey {
      parts.append(keyName)
    }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }
}
