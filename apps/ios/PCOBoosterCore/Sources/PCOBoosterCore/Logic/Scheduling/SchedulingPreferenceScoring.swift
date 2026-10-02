import Foundation

// Port of packages/planning-center-models/src/scheduling-preferences.ts. Pinned by the
// `scheduling.scoreSchedulingPreferences` parity suite in scripts/parity/scheduling.parity.ts.
// `groupRankingReasons` and `preferenceConflicts` read these lines by their wording, so the
// copy must stay exactly as written.

/// The selected plan and slot a candidate's preferences are scored against
/// (`SchedulingPreferenceContext`).
public struct SchedulingPreferenceContext: Hashable, Sendable {
  /// The selected plan's sort instant.
  public var referenceDate: Date
  /// The organization's IANA time zone.
  public var timeZone: String
  /// The selected plan, left out of "other plans" counts.
  public var planId: String?
  /// The service time the selected slot is needed for, when Planning Center says.
  public var slotTimePreferenceOptionId: String?

  public init(
    referenceDate: Date,
    timeZone: String,
    planId: String? = nil,
    slotTimePreferenceOptionId: String? = nil
  ) {
    self.referenceDate = referenceDate
    self.timeZone = timeZone
    self.planId = planId
    self.slotTimePreferenceOptionId = slotTimePreferenceOptionId
  }
}

/// How much to lower a raw score, and the lines that explain it
/// (`SchedulingPreferenceScore`).
public struct SchedulingPreferenceScore: Codable, Hashable, Sendable {
  public var penalty: Int
  /// A preference line, then any "Ranked lower" lines.
  public var reasoning: [String]

  public init(penalty: Int, reasoning: [String]) {
    self.penalty = penalty
    self.reasoning = reasoning
  }
}

/// Scores a candidate against their Planning Center scheduling preferences, using the history
/// the candidate list already loaded, a few weeks either side of the plan
/// (`scoreSchedulingPreferences`).
public func scoreSchedulingPreferences(
  _ preferences: SchedulingPreferences,
  history: [ServiceHistoryItem],
  context: SchedulingPreferenceContext
) -> SchedulingPreferenceScore {
  var reasoning: [String] = []
  let view = PlanHistoryView(history, context: context)
  var penalty = 0
  if let rule = SchedulePreferenceRule(
    preferences.schedulePreference, preferredWeeks: preferences.preferredWeeks)
  {
    penalty += rule.score(view, reasoning: &reasoning)
  }
  if let maxPlansPerMonth = preferences.maxPlansPerMonth, maxPlansPerMonth > 0 {
    penalty += PreferencePenalty.scoreMaxPlansPerMonth(
      maxPlansPerMonth, view: view, reasoning: &reasoning)
  }
  if let maxPlansPerDay = preferences.maxPlansPerDay, maxPlansPerDay > 0 {
    penalty += PreferencePenalty.scoreMaxPlansPerDay(
      maxPlansPerDay, view: view, reasoning: &reasoning)
  }
  penalty += PreferencePenalty.scoreTimePreference(
    preferences.timePreferenceOptionIds,
    slotOptionId: context.slotTimePreferenceOptionId,
    reasoning: &reasoning)
  return SchedulingPreferenceScore(penalty: penalty, reasoning: reasoning)
}

private enum PreferencePenalty {
  /// Planning Center's own "Unavailable" setting for a position (not in its API docs).
  static let unavailable = 100
  static let preferenceConflict = 25
  static let maxPlansReached = 30
  static let timePreference = 20

  static func scoreMaxPlansPerMonth(
    _ max: Int, view: PlanHistoryView, reasoning: inout [String]
  ) -> Int {
    var plans = Set<String>()
    for (day, dayPlans) in view.otherPlansByDay where JSString.hasPrefix(day, view.planMonth) {
      plans.formUnion(dayPlans)
    }
    let limit = "At most \(JSString.plural(max, "plan")) a month"
    if plans.count < max {
      reasoning.append("\(limit); this plan fits")
      return 0
    }
    reasoning.append(limit)
    reasoning.append(
      "Ranked lower: already on \(JSString.plural(plans.count, "other plan")) in \(view.monthLabel)"
    )
    return maxPlansReached
  }

  /// Only a reached daily limit is worth a line; most people never get close.
  static func scoreMaxPlansPerDay(
    _ max: Int, view: PlanHistoryView, reasoning: inout [String]
  ) -> Int {
    let plansThatDay = view.otherPlansByDay[view.planDay]?.count ?? 0
    if plansThatDay < max {
      return 0
    }
    reasoning.append("At most \(JSString.plural(max, "plan")) a day")
    reasoning.append(
      "Ranked lower: already on \(JSString.plural(plansThatDay, "other plan")) that day")
    return maxPlansReached
  }

  static func scoreTimePreference(
    _ optionIds: [String], slotOptionId: String?, reasoning: inout [String]
  ) -> Int {
    guard let slotOptionId, !optionIds.isEmpty,
      !optionIds.contains(where: { JSString.equal($0, slotOptionId) })
    else {
      return 0
    }
    reasoning.append("Prefers other service times")
    reasoning.append("Ranked lower: not this slot's service time")
    return timePreference
  }
}

/// What `schedule_preference` asks of the ranking; "Every week" and "As often as needed" ask
/// nothing.
private enum SchedulePreferenceRule {
  case unavailable
  /// At least `weeks` weeks between services. `weeks` is a JavaScript number, so a long
  /// digit run reads as a huge (or infinite) value just as `Number` reads it.
  case interval(weeks: Double, label: String)
  case perMonth(times: Int, label: String)
  /// Weeks of the month, sorted.
  case weeks([Int])

  private static let timesPerMonth: [(preference: String, times: Int)] = [
    ("Once a month", 1), ("Twice a month", 2), ("Three times a month", 3),
  ]
  private static let ordinals: [Int: String] = [2: "other", 3: "3rd", 4: "4th", 5: "5th", 6: "6th"]
  private static let daysPerWeek = 7

  init?(_ preference: String?, preferredWeeks: [Int]) {
    guard let preference else { return nil }
    if JSString.equal(preference, "Unavailable") {
      self = .unavailable
      return
    }
    if JSString.equal(preference, "Choose Weeks") {
      guard !preferredWeeks.isEmpty else { return nil }
      self = .weeks(JSSort.sorted(preferredWeeks) { Double($0 - $1) })
      return
    }
    if let entry = Self.timesPerMonth.first(where: { JSString.equal($0.preference, preference) }) {
      self = .perMonth(times: entry.times, label: MusicText.lowercased(preference))
      return
    }
    if JSString.equal(preference, "Every other week") {
      self = .interval(weeks: 2, label: "every other week")
      return
    }
    guard let weeks = Self.everyNthWeek(preference), weeks.isFinite, weeks >= 2 else {
      return nil
    }
    let ordinal =
      weeks <= 6 ? Self.ordinals[Int(weeks)] ?? "" : "\(MusicText.numberString(weeks))th"
    self = .interval(weeks: weeks, label: "every \(ordinal) week")
  }

  /// `/^Every (?<weeks>\d+)(?:st|nd|rd|th) week$/u`, read with `Number` (ASCII digits only).
  private static func everyNthWeek(_ preference: String) -> Double? {
    let scalars = Array(preference.unicodeScalars)
    let prefix = Array("Every ".unicodeScalars)
    let suffix = Array(" week".unicodeScalars)
    guard scalars.count > prefix.count + suffix.count + 2,
      scalars.starts(with: prefix), scalars.reversed().starts(with: suffix.reversed())
    else {
      return nil
    }
    let middle = scalars[prefix.count..<(scalars.count - suffix.count)]
    let digits = middle.prefix { ("0"..."9").contains($0) }
    let ordinal = String(String.UnicodeScalarView(middle.dropFirst(digits.count)))
    guard !digits.isEmpty, ["st", "nd", "rd", "th"].contains(where: { $0 == ordinal }) else {
      return nil
    }
    return Double(String(String.UnicodeScalarView(digits)))
  }

  func score(_ view: PlanHistoryView, reasoning: inout [String]) -> Int {
    switch self {
    case .unavailable:
      reasoning.append("Marked Unavailable for this position in Planning Center")
      reasoning.append("Ranked lower: asked not to be scheduled here")
      return PreferencePenalty.unavailable
    case .interval(let weeks, let label):
      return Self.scoreInterval(weeks: weeks, label: label, view: view, reasoning: &reasoning)
    case .perMonth(let times, let label):
      let daysThisMonth = view.otherServiceDays.filter { JSString.hasPrefix($0, view.planMonth) }
        .count
      if daysThisMonth < times {
        reasoning.append("Prefers to serve \(label); this plan fits")
        return 0
      }
      reasoning.append("Prefers to serve \(label)")
      reasoning.append(
        "Ranked lower: already serving \(JSString.plural(daysThisMonth, "other day")) in \(view.monthLabel)"
      )
      return PreferencePenalty.preferenceConflict
    case .weeks(let weeks):
      let week = view.weekOfMonth
      let labels = weeks.map(String.init)
      let list =
        labels.count <= 1
        ? labels.joined()
        : "\(labels.dropLast().joined(separator: ", ")) and \(labels.last ?? "")"
      let preferred = "Prefers week\(weeks.count == 1 ? "" : "s") \(list) of the month"
      if weeks.contains(week) {
        reasoning.append("\(preferred); this plan is in week \(week)")
        return 0
      }
      reasoning.append(preferred)
      reasoning.append("Ranked lower: this plan is in week \(week)")
      return PreferencePenalty.preferenceConflict
    }
  }

  private static func scoreInterval(
    weeks: Double, label: String, view: PlanHistoryView, reasoning: inout [String]
  ) -> Int {
    let gapDays = weeks * Double(daysPerWeek)
    var daysBefore = Double.infinity
    var daysAfter = Double.infinity
    for day in view.otherServiceDays {
      let offset = OrgCalendar.daysRefMinusItem(itemDayKey: day, refDayKey: view.planDay)
      if offset > 0 {
        daysBefore = min(daysBefore, Double(offset))
      } else {
        daysAfter = min(daysAfter, Double(-offset))
      }
    }
    var conflicts: [String] = []
    if daysBefore < gapDays {
      conflicts.append("Ranked lower: served \(JSString.plural(Int(daysBefore), "day")) before")
    }
    if daysAfter < gapDays {
      conflicts.append("Ranked lower: serving \(JSString.plural(Int(daysAfter), "day")) after")
    }
    if conflicts.isEmpty {
      reasoning.append("Prefers to serve \(label); this plan fits")
      return 0
    }
    reasoning.append("Prefers to serve \(label)")
    reasoning.append(contentsOf: conflicts)
    return PreferencePenalty.preferenceConflict
  }
}

/// The candidate's history as the preference rules read it.
private struct PlanHistoryView {
  let planDay: String
  let planMonth: String
  let monthLabel: String
  /// Distinct service days other than the plan's day, sorted.
  let otherServiceDays: [String]
  /// Other plans, by calendar day.
  let otherPlansByDay: [String: Set<String>]

  init(_ history: [ServiceHistoryItem], context: SchedulingPreferenceContext) {
    let planDay = OrgCalendar.dayKey(context.referenceDate, timeZone: context.timeZone)
    var serviceDays = Set<String>()
    var otherPlansByDay: [String: Set<String>] = [:]
    for item in history where !isDeclinedAssignmentStatus(item.status) {
      let day = OrgCalendar.dayKey(item.date, timeZone: context.timeZone)
      if item.countsAsService, day != planDay {
        serviceDays.insert(day)
      }
      let itemPlan = item.planId ?? item.sourceScheduleId
      if context.planId.map({ !JSString.equal(itemPlan, $0) }) ?? true {
        otherPlansByDay[day, default: []].insert(itemPlan)
      }
    }
    self.planDay = planDay
    planMonth = String(planDay.prefix(7))
    monthLabel = OrgCalendar.label(
      context.referenceDate, timeZone: context.timeZone, style: .monthYear)
    otherServiceDays = serviceDays.sorted()
    self.otherPlansByDay = otherPlansByDay
  }

  /// Planning Center counts weeks of the month from the 1st: days 1 to 7 are week 1.
  var weekOfMonth: Int {
    let day = Int(JSString.suffix(String(planDay.prefix(10)), from: 8)) ?? 0
    return (day + 6) / 7
  }
}
