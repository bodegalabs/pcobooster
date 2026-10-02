import PCOBoosterCore
import SwiftUI

/// How much someone serves around this plan, as plain counts and dates: the 4 weeks before it
/// and the 4 weeks after (the range the candidate list loads), in congregation days.
struct AssignFrequencyFacts: View {
  let frequency: ScheduleFrequency
  let planDate: Date?

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    AssignDetailCard(title: "Serving", symbol: .reasonService) {
      let columns = dynamicTypeSize.isAccessibilitySize ? 1 : 2
      Grid(alignment: .leading, horizontalSpacing: Spacing.lg, verticalSpacing: Spacing.lg) {
        ForEach(Array(facts.factRows(of: columns).enumerated()), id: \.offset) { _, row in
          GridRow {
            ForEach(row) { fact in
              AssignFactTile(fact: fact)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
    }
  }

  private var facts: [Fact] {
    var facts = [
      Fact(
        id: "recent", value: "\(frequency.recentServedDays)",
        label: frequency.recentServedDays == 1 ? "Service in the 4 weeks before" : "Services in the 4 weeks before",
        detail: rehearsalDetail(frequency.recentRehearsalOnlyDays)),
      Fact(
        id: "upcoming", value: "\(frequency.upcomingServices)",
        label: frequency.upcomingServices == 1 ? "Service in the 4 weeks after" : "Services in the 4 weeks after",
        detail: rehearsalDetail(frequency.upcomingRehearsals)),
    ]
    facts.append(
      Fact(
        id: "last", value: frequency.lastServedDate.map(date) ?? "None",
        label: "Last served", detail: nil))
    facts.append(
      Fact(
        id: "next", value: frequency.nextUpcomingDate.map(date) ?? "None",
        label: "Next serving", detail: nil))
    return facts
  }

  private func date(_ date: Date) -> String {
    OrgCalendar.label(date, timeZone: timeZone, style: .monthDay)
  }

  private func rehearsalDetail(_ count: Int) -> String? {
    switch count {
    case 0: nil
    case 1: "plus 1 rehearsal"
    default: "plus \(count) rehearsals"
    }
  }

  struct Fact: Identifiable {
    let id: String
    let value: String
    let label: String
    let detail: String?
  }
}

private struct AssignFactTile: View {
  let fact: AssignFrequencyFacts.Fact

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xxs) {
      Text(verbatim: fact.value)
        .font(.title3.weight(.semibold).monospacedDigit())
        .foregroundStyle(.ink)
      Text(verbatim: fact.label)
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      if let detail = fact.detail {
        Text(verbatim: detail)
          .font(.caption2)
          .foregroundStyle(.inkTertiary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// The person's scheduling preferences as Planning Center records them. Facts only; the
/// ranking already notes where this plan goes against them.
struct AssignPreferencesCard: View {
  let preferences: SchedulingPreferences

  /// Readable lines for what's set; empty when nothing is.
  static func lines(_ preferences: SchedulingPreferences) -> [String] {
    preferences.readableLines
  }

  var body: some View {
    AssignDetailCard(title: "Planning Center preferences", symbol: .reasonPreference) {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        ForEach(Self.lines(preferences), id: \.self) { line in
          Text(verbatim: line)
            .font(.rowDetail)
            .foregroundStyle(.ink)
        }
      }
    }
  }
}

fileprivate extension SchedulingPreferences {
  /// Readable lines for what's set.
  var readableLines: [String] {
    var lines: [String] = []
    if let preference = schedulePreference?.trimmingCharacters(in: .whitespaces), !preference.isEmpty {
      lines.append("Prefers \(preference.lowercased())")
    }
    if !preferredWeeks.isEmpty {
      let weeks = preferredWeeks.sorted().map(String.init)
      let list =
        weeks.count > 1 ? weeks.dropLast().joined(separator: ", ") + " and " + (weeks.last ?? "") : weeks[0]
      lines.append(weeks.count > 1 ? "Weeks \(list) of the month" : "Week \(list) of the month")
    }
    if let perDay = maxPlansPerDay {
      lines.append(perDay == 1 ? "At most 1 plan a day" : "At most \(perDay) plans a day")
    }
    if let perMonth = maxPlansPerMonth {
      lines.append(perMonth == 1 ? "At most 1 plan a month" : "At most \(perMonth) plans a month")
    }
    return lines
  }

}

fileprivate extension Array {
  /// Consecutive slices of `size` elements (the last may be shorter).
  func factRows(of size: Int) -> [[Element]] {
    let size = Swift.max(size, 1)
    return stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
  }
}
