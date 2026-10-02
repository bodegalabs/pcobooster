import Foundation
import PCOBoosterCore

/// The words a plan is introduced with: the navigation title, its subtitle, and the short line
/// used for neighboring plans in menus. Dates are organization calendar days.
struct PlanHeaderText: Equatable {
  /// The plan's own title, else its series, else the service type.
  var title: String
  /// "Sun, Oct 4 · Sunday Gathering"; the year appears when it isn't the current one.
  var subtitle: String
  /// The series, when the plan has one ("Rooted").
  var series: String?

  init(plan: Plan?, serviceTypeName: String?, timeZone: String, now: Date) {
    let serviceType = serviceTypeName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let planTitle = Self.withoutServiceTypePrefix(plan?.title ?? "", serviceType: serviceType)
    let seriesTitle = plan?.seriesTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    title = [planTitle, seriesTitle, serviceType].first { !$0.isEmpty } ?? ""
    series = seriesTitle.isEmpty ? nil : seriesTitle
    var parts: [String] = []
    if let date = plan?.sortDate {
      parts.append(Self.dateLabel(date, timeZone: timeZone, now: now))
    }
    if !serviceType.isEmpty, serviceType != title {
      parts.append(serviceType)
    }
    subtitle = parts.joined(separator: " \u{B7} ")
  }

  /// "Sun, Oct 4", or "Sun, Oct 4, 2025" outside the current organization year.
  static func dateLabel(_ date: Date, timeZone: String, now: Date) -> String {
    let sameYear =
      OrgCalendar.dayKey(date, timeZone: timeZone).prefix(4)
      == OrgCalendar.dayKey(now, timeZone: timeZone).prefix(4)
    return OrgCalendar.label(
      date, timeZone: timeZone, style: sameYear ? .weekdayMonthDay : .weekdayMonthDayYear)
  }

  /// A neighboring plan's second line in the step and title menus: its series or title with the
  /// service type prefix removed (`buildPlanSubtitle` in apps/web/src/components/dashboard-page.tsx),
  /// or nil when that only repeats the service type.
  static func neighborDetail(_ plan: Plan, serviceTypeName: String?) -> String? {
    let serviceType = serviceTypeName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let titles = [plan.title, plan.seriesTitle ?? ""]
      .map { withoutServiceTypePrefix($0, serviceType: serviceType) }
      .filter { !$0.isEmpty }
    let unique = titles.reduce(into: [String]()) { list, title in
      if !list.contains(title) { list.append(title) }
    }
    return unique.isEmpty ? nil : unique.joined(separator: " \u{B7} ")
  }

  /// Drops a leading "Sunday Gathering - " (or ":" or "|") and returns "" when the text only
  /// names the service type, compared without regard to case, as the web does.
  static func withoutServiceTypePrefix(_ text: String, serviceType: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !serviceType.isEmpty, !trimmed.isEmpty else { return trimmed }
    if trimmed.compare(serviceType, options: [.caseInsensitive]) == .orderedSame {
      return ""
    }
    guard
      let range = trimmed.range(of: serviceType, options: [.caseInsensitive, .anchored])
    else { return trimmed }
    let rest = trimmed[range.upperBound...].drop { $0.isWhitespace }
    guard let separator = rest.first, "-:|".contains(separator) else { return trimmed }
    let remainder = rest.dropFirst().trimmingCharacters(in: .whitespacesAndNewlines)
    if remainder.compare(serviceType, options: [.caseInsensitive]) == .orderedSame {
      return ""
    }
    return remainder
  }
}
