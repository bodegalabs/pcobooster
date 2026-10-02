import PCOBoosterCore
import SwiftUI

/// Dates and copy for a blockout, read on the blockout's own calendar: its Planning Center
/// zone when valid, else the congregation's (the same calendar-day rule the server uses to
/// compare blockouts with plans), so an all-day "Oct 30 to Nov 2" reads as entered.
enum BlockoutText {
  struct Range: Hashable {
    /// `YYYY-MM-DD` of the first and last blocked days.
    var start: String
    var end: String
  }

  static func zone(_ blockout: Blockout, fallbackZone: String) -> String {
    if let zone = blockout.timeZone, !zone.isEmpty, OrgCalendar.isValidTimeZone(zone) {
      return zone
    }
    return fallbackZone
  }

  static func dayRange(_ blockout: Blockout, fallbackZone: String) -> Range {
    let zone = zone(blockout, fallbackZone: fallbackZone)
    return Range(
      start: OrgCalendar.dayKey(blockout.startsAt, timeZone: zone),
      end: OrgCalendar.dayKey(blockout.endsAt, timeZone: zone))
  }

  /// Starts at midnight and ends at the last minute of a day, as Planning Center writes
  /// all-day blockouts.
  static func isAllDay(_ blockout: Blockout, zone: String) -> Bool {
    OrgCalendar.wallTime(blockout.startsAt, timeZone: zone).timeValue == "00:00"
      && ["23:59", "00:00"].contains(OrgCalendar.wallTime(blockout.endsAt, timeZone: zone).timeValue)
  }

  /// "Fri, Oct 30 to Mon, Nov 2", "Sat, Oct 3", or "Sat, Oct 3, 9:00 AM to 5:00 PM". Years show
  /// when a date falls outside the current year.
  static func dates(_ blockout: Blockout, fallbackZone: String, todayKey: String) -> String {
    let zone = zone(blockout, fallbackZone: fallbackZone)
    let range = dayRange(blockout, fallbackZone: fallbackZone)
    let year = String(todayKey.prefix(4))
    func day(_ date: Date, key: String) -> String {
      OrgCalendar.label(
        date, timeZone: zone, style: key.hasPrefix(year) ? .weekdayMonthDay : .weekdayMonthDayYear)
    }
    let start = day(blockout.startsAt, key: range.start)
    let end = day(blockout.endsAt, key: range.end)
    if isAllDay(blockout, zone: zone) {
      return range.start == range.end ? start : "\(start) to \(end)"
    }
    let startTime = OrgCalendar.timeOfDay(blockout.startsAt, timeZone: zone)
    let endTime = OrgCalendar.timeOfDay(blockout.endsAt, timeZone: zone)
    if range.start == range.end {
      return "\(start), \(startTime) to \(endTime)"
    }
    return "\(start), \(startTime) to \(end), \(endTime)"
  }

  /// "5 days" for a multi-day blockout; nil for a single day.
  static func length(_ blockout: Blockout, fallbackZone: String) -> String? {
    let range = dayRange(blockout, fallbackZone: fallbackZone)
    let days = OrgCalendar.daysRefMinusItem(itemDayKey: range.start, refDayKey: range.end) + 1
    return days > 1 ? "\(days) days" : nil
  }

  /// The blockout covers today.
  static func isCurrent(_ blockout: Blockout, now: Date) -> Bool {
    blockout.startsAt <= now && now <= blockout.endsAt
  }
}

/// Upcoming dates someone can't serve (`people.blockouts`, future only). A native addition:
/// the web loads blockouts only to rank candidates, never to show them.
struct BlockoutsCard: View {
  let state: QueryState<[Blockout]>

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock

  var body: some View {
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        PeopleCardHeader(
          Text("Blockouts"), icon: Image(systemName: PeopleGlyph.blockout),
          count: state.value?.count)
          .padding(.horizontal, Spacing.lg)
          .padding(.top, Spacing.lg)
          .padding(.bottom, Spacing.sm)
        content
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("person-blockouts")
  }

  @ViewBuilder private var content: some View {
    if let blockouts = state.value {
      if blockouts.isEmpty {
        Text("No upcoming blockouts.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .padding(.horizontal, Spacing.lg)
          .padding(.bottom, Spacing.lg)
      } else {
        let sorted = blockouts.sorted { $0.startsAt < $1.startsAt }
        let todayKey = OrgCalendar.dayKey(clock.now, timeZone: timeZone)
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(sorted.enumerated()), id: \.element.id) { index, blockout in
            BlockoutRow(blockout: blockout, todayKey: todayKey, now: clock.now)
            if index < sorted.count - 1 {
              Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg)
            }
          }
        }
        .padding(.bottom, Spacing.xs)
      }
    } else if state.status == .failure {
      HStack(spacing: Spacing.md) {
        Text("Blockouts failed to load.")
          .font(.rowDetail)
          .foregroundStyle(.destructive)
        Spacer(minLength: 0)
        Button("Retry") { state.retry() }
          .buttonStyle(.pill(.outline, size: .small))
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.bottom, Spacing.lg)
    } else {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        Skeleton(.text, width: 120, height: 12)
        Skeleton(.text, width: 180, height: 10)
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.bottom, Spacing.lg)
    }
  }
}

private struct BlockoutRow: View {
  let blockout: Blockout
  let todayKey: String
  let now: Date

  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xxs) {
      HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
        Text(verbatim: blockout.reason.isEmpty ? "Blocked out" : blockout.reason)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        if BlockoutText.isCurrent(blockout, now: now) {
          StatusBadge("Away now", tone: .declined)
        }
        Spacer(minLength: Spacing.sm)
        if let length = BlockoutText.length(blockout, fallbackZone: timeZone) {
          Text(verbatim: length)
            .font(.meta.monospacedDigit())
            .foregroundStyle(.inkSecondary)
        }
      }
      Text(verbatim: BlockoutText.dates(blockout, fallbackZone: timeZone, todayKey: todayKey))
        .font(.rowDetail.monospacedDigit())
        .foregroundStyle(.ink)
      if !blockout.description.isEmpty {
        Text(verbatim: blockout.description)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.sm + 2)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}
