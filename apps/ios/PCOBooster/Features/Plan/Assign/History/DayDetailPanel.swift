import Foundation
import PCOBoosterCore
import SwiftUI

/// Copy for the day bars, from `schedule-day-bars.tsx`.
enum ScheduleDayText {
  /// A day key is a civil date, so it formats as UTC noon in UTC.
  static func label(_ dayKey: String, style: CalendarDateLabelStyle) -> String {
    guard let date = JSONCoding.parseISODate("\(dayKey)T12:00:00Z") else { return dayKey }
    return OrgCalendar.label(date, timeZone: "UTC", style: style)
  }

  /// "3 days before", "This plan", "1 day after".
  static func distance(_ offset: Int) -> String {
    if offset == 0 { return "This plan" }
    let days = abs(offset) == 1 ? "1 day" : "\(abs(offset)) days"
    return offset < 0 ? "\(days) before" : "\(days) after"
  }

  /// The position as Planning Center names it, team and position joined back together.
  static func positionLabel(_ item: ServiceHistoryItem) -> String {
    guard let team = item.teamName, !team.isEmpty else { return item.teamPositionName }
    return "\(team) - \(item.teamPositionName)"
  }

  /// One entry per position, service, and kind; services before rehearsals.
  static func entries(_ day: ScheduleDay) -> [ScheduleDayEntry] {
    var seen: Set<String> = []
    var entries: [ScheduleDayEntry] = []
    for item in day.items {
      let rehearsal = item.timeType == .rehearsal
      let key = [
        item.teamPositionName, item.serviceTypeName ?? "", item.planId ?? "", rehearsal ? "r" : "s",
      ].joined(separator: "|")
      guard seen.insert(key).inserted else { continue }
      let status = item.status.trimmingCharacters(in: .whitespaces).lowercased()
      entries.append(
        ScheduleDayEntry(
          id: key, item: item, isRehearsal: rehearsal,
          isConfirmed: status == "c" || status == "confirmed"))
    }
    return entries.filter { !$0.isRehearsal } + entries.filter(\.isRehearsal)
  }

  /// "Sun, Oct 25 · Keys, Sunday Gathering"; a rehearsal-only line says so.
  static func lines(_ day: ScheduleDay) -> [String] {
    var order: [String] = []
    var rehearsalOnly: [String: Bool] = [:]
    for item in day.items {
      let what = [positionLabel(item), item.serviceTypeName ?? ""].filter { !$0.isEmpty }
        .joined(separator: ", ")
      if rehearsalOnly[what] == nil { order.append(what) }
      rehearsalOnly[what] = (rehearsalOnly[what] ?? true) && item.timeType == .rehearsal
    }
    return order.map { rehearsalOnly[$0] == true ? "\($0) (rehearsal)" : $0 }
  }

  /// What VoiceOver reads for the bars.
  static func summary(_ days: [ScheduleDay]) -> String {
    let busy = days.filter { $0.kind != .free }
    guard !busy.isEmpty else {
      return "Nothing scheduled in the 4 weeks either side of this plan."
    }
    return busy.map { "\(label($0.dayKey, style: .weekdayMonthDay)): \(lines($0).joined(separator: "; "))" }
      .joined(separator: ". ")
  }
}

struct ScheduleDayEntry: Identifiable, Hashable {
  let id: String
  let item: ServiceHistoryItem
  let isRehearsal: Bool
  let isConfirmed: Bool

  var toneLabel: LocalizedStringResource {
    if isRehearsal { return "Rehearsal" }
    return isConfirmed ? "Confirmed" : "Pending"
  }

  var tone: StatusTone {
    if isRehearsal { return .neutral }
    return isConfirmed ? .confirmed : .pending
  }
}

/// The day's date and distance from the plan, then everything they're on that day.
struct DayDetailPanel: View {
  let day: ScheduleDay

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: ScheduleDayText.label(day.dayKey, style: .weekdayMonthDay))
          .font(.cardTitle)
          .foregroundStyle(.ink)
        Spacer(minLength: Spacing.md)
        Text(verbatim: ScheduleDayText.distance(day.offset))
          .font(.meta.weight(day.offset == 0 ? .semibold : .regular))
          .foregroundStyle(day.offset == 0 ? Color.statusInfoText : Color.inkSecondary)
      }
      VStack(alignment: .leading, spacing: Spacing.md) {
        ForEach(ScheduleDayText.entries(day)) { entry in
          ScheduleDayEntryRow(entry: entry)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct ScheduleDayEntryRow: View {
  let entry: ScheduleDayEntry

  var body: some View {
    HStack(spacing: Spacing.md) {
      AppSymbol.rosterPosition(entry.item.teamPositionName, team: entry.item.teamName ?? "").image
        .font(.subheadline)
        .foregroundStyle(.inkSecondary)
        .frame(width: 20)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 1) {
        Text(verbatim: ScheduleDayText.positionLabel(entry.item))
          .font(.rowDetail.weight(.medium))
          .foregroundStyle(.ink)
          .lineLimit(1)
        let detail = [entry.item.serviceTypeName, entry.item.planTitle].compactMap { $0 }
          .filter { !$0.isEmpty }.joined(separator: " \u{B7} ")
        if !detail.isEmpty {
          Text(verbatim: detail)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: Spacing.xs) {
        Circle().fill(entry.tone.color).frame(width: 6, height: 6)
        Text(entry.toneLabel)
      }
      .font(.badgeLabel)
      .foregroundStyle(entry.tone.textColor)
    }
  }
}
