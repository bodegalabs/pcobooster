import Foundation

// Port of packages/planning-center-models/src/candidate-frequency.ts. Pinned by the
// `scheduling.isDeclinedAssignmentStatus`, `scheduling.buildFrequency`, and
// `scheduling.summarizeCandidateHistory` parity suites in scripts/parity/scheduling.parity.ts.

/// How much someone serves around a plan, in distinct congregation calendar days
/// (`ScheduleFrequency` in `packages/planning-center-models/src/types.ts`).
///
/// A day with any service is a service day; a day with only rehearsals is a rehearsal day,
/// so the two counts never overlap. "Recent" means within
/// `ScheduleConstants.planHistoryHalfRangeDays` before the plan's day (the plan's day
/// included); upcoming days are after it, within the same range.
public struct ScheduleFrequency: Codable, Hashable, Sendable {
  /// Past service days within the plan history range. Add `recentRehearsalOnlyDays` for every
  /// day on the schedule in that range.
  public var recentServedDays: Int
  public var last60Days: Int
  public var last90Days: Int
  /// The latest service on or before the plan's day.
  public var lastServedDate: Date?
  public var totalServed: Int
  /// Past days with a rehearsal and no service, in the same range as `recentServedDays`.
  public var recentRehearsalOnlyDays: Int
  public var rehearsalLast60Days: Int
  public var rehearsalLast90Days: Int
  public var lastRehearsalDate: Date?
  public var totalRehearsals: Int
  /// Service days after the plan's day.
  public var upcomingServices: Int
  /// The earliest service after the plan's day.
  public var nextUpcomingDate: Date?
  public var upcomingRehearsals: Int
  public var nextRehearsalDate: Date?

  public init(
    recentServedDays: Int = 0,
    last60Days: Int = 0,
    last90Days: Int = 0,
    lastServedDate: Date? = nil,
    totalServed: Int = 0,
    recentRehearsalOnlyDays: Int = 0,
    rehearsalLast60Days: Int = 0,
    rehearsalLast90Days: Int = 0,
    lastRehearsalDate: Date? = nil,
    totalRehearsals: Int = 0,
    upcomingServices: Int = 0,
    nextUpcomingDate: Date? = nil,
    upcomingRehearsals: Int = 0,
    nextRehearsalDate: Date? = nil
  ) {
    self.recentServedDays = recentServedDays
    self.last60Days = last60Days
    self.last90Days = last90Days
    self.lastServedDate = lastServedDate
    self.totalServed = totalServed
    self.recentRehearsalOnlyDays = recentRehearsalOnlyDays
    self.rehearsalLast60Days = rehearsalLast60Days
    self.rehearsalLast90Days = rehearsalLast90Days
    self.lastRehearsalDate = lastRehearsalDate
    self.totalRehearsals = totalRehearsals
    self.upcomingServices = upcomingServices
    self.nextUpcomingDate = nextUpcomingDate
    self.upcomingRehearsals = upcomingRehearsals
    self.nextRehearsalDate = nextRehearsalDate
  }
}

/// A candidate's frequency and the history shown beside it (`CandidateHistorySummary`).
public struct CandidateHistorySummary: Codable, Hashable, Sendable {
  public var frequency: ScheduleFrequency
  /// Sorted by date (equal dates keep their input order) and limited to the plan history
  /// range either side of the reference day.
  public var serviceHistory: [ServiceHistoryItem]

  public init(frequency: ScheduleFrequency, serviceHistory: [ServiceHistoryItem]) {
    self.frequency = frequency
    self.serviceHistory = serviceHistory
  }
}

/// Planning Center Services status `D` or "declined" (`isDeclinedAssignmentStatus`).
/// Declined rows never count as history or load; selected-plan matching still sees them so
/// the UI can show "Declined".
public func isDeclinedAssignmentStatus(_ status: String?) -> Bool {
  let trimmed = JSParity.trim(status ?? "")
  return JSString.equal(trimmed, "D") || JSString.equal(MusicText.lowercased(trimmed), "declined")
}

/// Counts distinct calendar days in the organization's zone: a day with any service is a
/// service day, and a day with only rehearsals is a rehearsal day
/// (`buildFrequencyFromServiceHistory`).
public func buildFrequency(
  from history: [ServiceHistoryItem], referenceDate: Date, timeZone: String
) -> ScheduleFrequency {
  var serviceDays: [ServiceHistoryItem] = []
  var rehearsalOnlyDays: [ServiceHistoryItem] = []
  for day in EngagementDays(history, timeZone: timeZone).days {
    if let service = day.service {
      serviceDays.append(service)
    } else if let rehearsal = day.rehearsal {
      rehearsalOnlyDays.append(rehearsal)
    }
  }
  let services = EngagementSummary(serviceDays, referenceDate: referenceDate, timeZone: timeZone)
  let rehearsals = EngagementSummary(
    rehearsalOnlyDays, referenceDate: referenceDate, timeZone: timeZone)
  return ScheduleFrequency(
    recentServedDays: services.recent,
    last60Days: services.last60,
    last90Days: services.last90,
    lastServedDate: services.latest,
    totalServed: services.total,
    recentRehearsalOnlyDays: rehearsals.recent,
    rehearsalLast60Days: rehearsals.last60,
    rehearsalLast90Days: rehearsals.last90,
    lastRehearsalDate: rehearsals.latest,
    totalRehearsals: rehearsals.total,
    upcomingServices: services.upcoming,
    nextUpcomingDate: services.next,
    upcomingRehearsals: rehearsals.upcoming,
    nextRehearsalDate: rehearsals.next
  )
}

/// Frequency from every item, then the items within the plan history range of the
/// reference day for display (`summarizeCandidateHistory`).
public func summarizeCandidateHistory(
  _ items: [ServiceHistoryItem], referenceDate: Date, timeZone: String
) -> CandidateHistorySummary {
  let sorted = JSSort.sorted(items) { Double(JSParity.time($0.date) - JSParity.time($1.date)) }
  let frequency = buildFrequency(from: sorted, referenceDate: referenceDate, timeZone: timeZone)
  let referenceDay = OrgCalendar.dayKey(referenceDate, timeZone: timeZone)
  let halfRange = ScheduleConstants.planHistoryHalfRangeDays
  let serviceHistory = sorted.filter { item in
    let difference = OrgCalendar.daysRefMinusItem(
      itemDayKey: OrgCalendar.dayKey(item.date, timeZone: timeZone), refDayKey: referenceDay)
    return difference >= -halfRange && difference <= halfRange
  }
  return CandidateHistorySummary(frequency: frequency, serviceHistory: serviceHistory)
}

extension ServiceHistoryItem {
  /// Untyped items count as service, as Planning Center schedules without plan times do.
  var countsAsService: Bool {
    timeType == nil || timeType == .service
  }
}

/// Each org day's latest service and latest rehearsal, declined rows left out, in the order
/// the days first appear.
private struct EngagementDays {
  struct Day {
    var service: ServiceHistoryItem?
    var rehearsal: ServiceHistoryItem?
  }

  private(set) var days: [Day] = []

  init(_ history: [ServiceHistoryItem], timeZone: String) {
    var indexByDay: [String: Int] = [:]
    for item in history where !isDeclinedAssignmentStatus(item.status) {
      let dayKey = OrgCalendar.dayKey(item.date, timeZone: timeZone)
      let index = indexByDay[dayKey] ?? days.count
      if index == days.count {
        indexByDay[dayKey] = index
        days.append(Day())
      }
      let time = JSParity.time(item.date)
      if item.countsAsService,
        days[index].service.map({ time > JSParity.time($0.date) }) ?? true
      {
        days[index].service = item
      }
      if item.timeType == .rehearsal,
        days[index].rehearsal.map({ time > JSParity.time($0.date) }) ?? true
      {
        days[index].rehearsal = item
      }
    }
  }
}

/// Counts of engagement days relative to the reference day.
private struct EngagementSummary {
  var recent = 0
  var last60 = 0
  var last90 = 0
  var total = 0
  var upcoming = 0
  var latest: Date?
  var next: Date?

  init(_ days: [ServiceHistoryItem], referenceDate: Date, timeZone: String) {
    let halfRange = ScheduleConstants.planHistoryHalfRangeDays
    let referenceKey = OrgCalendar.dayKey(referenceDate, timeZone: timeZone)
    for item in days {
      let difference = OrgCalendar.daysRefMinusItem(
        itemDayKey: OrgCalendar.dayKey(item.date, timeZone: timeZone), refDayKey: referenceKey)
      if difference < -halfRange {
        continue
      }
      let time = JSParity.time(item.date)
      if difference < 0 {
        upcoming += 1
        if next.map({ time < JSParity.time($0) }) ?? true {
          next = item.date
        }
        continue
      }
      total += 1
      if difference <= halfRange {
        recent += 1
      }
      if difference <= 60 {
        last60 += 1
      }
      if difference <= 90 {
        last90 += 1
      }
      if latest.map({ time > JSParity.time($0) }) ?? true {
        latest = item.date
      }
    }
  }
}
