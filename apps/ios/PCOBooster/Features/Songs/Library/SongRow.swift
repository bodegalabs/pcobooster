import PCOBoosterCore
import SwiftUI

/// A library row: the title, its writers (and when it was added, if it was never scheduled),
/// and the date of the latest plan with it. Facts only; nothing ranks or recommends.
struct SongRow: View {
  let row: SongRowData
  let now: Date
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let stacked = dynamicTypeSize.isAccessibilitySize
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: row.title)
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(stacked ? 3 : 1)
        if let detail = detail(includingDate: stacked) {
          Text(verbatim: detail)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .lineLimit(stacked ? 3 : 1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if !stacked, let date = dateLabel {
        Text(verbatim: date)
          .font(.numericMeta)
          .foregroundStyle(row.neverScheduled ? Color.inkTertiary : .inkSecondary)
          .lineLimit(1)
          .fixedSize()
      }
    }
    .padding(.vertical, Spacing.xs)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: accessibilityText))
  }

  /// "Sep 27" this year, "Mar 10, 2024" before it, or "Never scheduled".
  private var dateLabel: String? {
    guard row.dated else { return nil }
    guard let last = row.lastScheduledAt else { return String(localized: "Never scheduled") }
    return Self.compactDate(last, now: now, timeZone: timeZone)
  }

  private func detail(includingDate: Bool) -> String? {
    var parts: [String] = []
    if includingDate, let date = dateLabel { parts.append(date) }
    if row.neverScheduled, let added = row.createdAt {
      parts.append(
        String(localized: "Added \(OrgCalendar.label(added, timeZone: timeZone, style: .monthYear))"))
    }
    if !row.author.isEmpty { parts.append(row.author) }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }

  private var accessibilityText: String {
    var parts = [row.title]
    if !row.author.isEmpty { parts.append(String(localized: "by \(row.author)")) }
    if row.dated {
      if let last = row.lastScheduledAt {
        let date = OrgCalendar.label(last, timeZone: timeZone, style: .monthDayYear)
        parts.append(String(localized: "last scheduled \(date)"))
      } else {
        parts.append(String(localized: "never scheduled"))
      }
    }
    return parts.joined(separator: ", ")
  }

  /// A date in the org's calendar, without the year when it falls in this year.
  static func compactDate(_ date: Date, now: Date, timeZone: String) -> String {
    let sameYear =
      OrgCalendar.dayKey(date, timeZone: timeZone).prefix(4)
      == OrgCalendar.dayKey(now, timeZone: timeZone).prefix(4)
    return OrgCalendar.label(date, timeZone: timeZone, style: sameYear ? .monthDay : .monthDayYear)
  }
}

/// What a long press on a song shows above its menu: the library's facts about it, without
/// loading anything.
struct SongRowPreview: View {
  let row: SongRowData
  let themes: String
  let now: Date
  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md) {
        Image(symbol: .song)
          .font(.title3)
          .foregroundStyle(.inkSecondary)
          .frame(width: 44, height: 44)
          .background(.surfaceMuted, in: .rect(cornerRadius: Radius.control, style: .continuous))
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: row.title).font(.cardTitle).foregroundStyle(.ink)
          if !row.author.isEmpty {
            Text(verbatim: row.author).font(.rowDetail).foregroundStyle(.inkSecondary)
          }
        }
      }
      if row.dated {
        Hairline()
        VStack(alignment: .leading, spacing: Spacing.sm) {
          fact(
            "Last scheduled",
            value: row.lastScheduledAt.map {
              OrgCalendar.label($0, timeZone: timeZone, style: .weekdayMonthDayYear)
            } ?? String(localized: "Never"))
          if let created = row.createdAt {
            fact("Added", value: OrgCalendar.label(created, timeZone: timeZone, style: .monthDayYear))
          }
          if !themes.isEmpty {
            fact("Themes", value: themes)
          }
        }
      }
    }
    .padding(Spacing.lg)
    .frame(width: 320, alignment: .leading)
    .background(.surfaceCard)
  }

  private func fact(_ label: LocalizedStringKey, value: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label).font(.meta).foregroundStyle(.inkSecondary)
      Spacer(minLength: Spacing.md)
      Text(verbatim: value).font(.meta).foregroundStyle(.ink).multilineTextAlignment(.trailing)
    }
  }
}
