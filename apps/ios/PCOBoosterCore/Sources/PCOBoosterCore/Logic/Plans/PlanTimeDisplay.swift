import Foundation

// Port of `formatPlanTimeRangeLabel` in apps/web/src/components/schedule/plan-time-display.ts.
// Pinned by the `plans.formatPlanTimeRangeLabel` parity suite.
//
// The web builds a local `Date` from the form's civil date and formats it in the same local
// zone with date-fns, so the label never depends on a zone. The port does the same with UTC
// calendar arithmetic.

/// The weekday and date label ("Sat, Oct 3") for a `YYYY-MM-DD` form date, or nil when the
/// text isn't four, two, and two ASCII digits (`parseCalendarDay` then `format(date,
/// "EEE, MMM d")`). A day past the month's end rolls over, and years 0000 to 0099 read as 1900
/// to 1999, as `new Date(year, month, day)` does.
private func calendarDayLabel(_ value: String) -> String? {
  let scalars = Array(value.unicodeScalars)
  guard scalars.count == 10, scalars[4] == "-", scalars[7] == "-" else {
    return nil
  }
  var fields: [Int] = []
  for range in [0..<4, 5..<7, 8..<10] {
    var number = 0
    for scalar in scalars[range] {
      guard MusicText.isDigit(scalar) else {
        return nil
      }
      number = number * 10 + Int(scalar.value - 48)
    }
    fields.append(number)
  }
  let time = OrgCalendar.utcTime(year: fields[0], monthIndex: fields[1] - 1, day: fields[2])
  return OrgCalendar.label(JSParity.date(time: time), timeZone: "UTC", style: .weekdayMonthDay)
}

/// "9:30 AM" from an `HH:mm` value, or the value itself when either part isn't a finite
/// number (`formatTime12`). Parts convert like JavaScript's `Number`.
private func twelveHourTime(_ timeValue: String) -> String {
  let parts = JSParity.split(timeValue, separator: ":")
  guard parts.count >= 2 else {
    return timeValue
  }
  let hour = PlanLogic.number(parts[0])
  let minute = PlanLogic.number(parts[1])
  guard hour.isFinite, minute.isFinite else {
    return timeValue
  }
  let period = hour >= 12 ? "PM" : "AM"
  let remainder = hour.truncatingRemainder(dividingBy: 12)
  let hour12 = remainder == 0 ? 12 : remainder
  return "\(MusicText.numberString(hour12)):\(PlanLogic.twoDigits(minute)) \(period)"
}

/// The label for a plan time's range (`formatPlanTimeRangeLabel`): "Sun, Sep 27 · 9:00 AM",
/// "Sun, Sep 27 · 9:00 AM - 10:15 AM", or with both dates when the range spans days.
/// "Set start time" until there is a start date and time.
public func formatPlanTimeRangeLabel(
  startDate: String, startTime: String, endDate: String, endTime: String
) -> String {
  if startDate.isEmpty || startTime.isEmpty {
    return "Set start time"
  }
  let startDay = calendarDayLabel(startDate)
  let startTimeLabel = twelveHourTime(startTime)
  if endTime.isEmpty {
    guard let startDay else {
      return startTimeLabel
    }
    return "\(startDay) \u{B7} \(startTimeLabel)"
  }
  let endTimeLabel = twelveHourTime(endTime)
  let sameDay = endDate.isEmpty || PlanLogic.identical(endDate, startDate)
  if sameDay, let startDay {
    return "\(startDay) \u{B7} \(startTimeLabel) - \(endTimeLabel)"
  }
  if let startDay, let endDay = calendarDayLabel(endDate.isEmpty ? startDate : endDate) {
    return "\(startDay) \(startTimeLabel) - \(endDay) \(endTimeLabel)"
  }
  return "\(startTimeLabel) - \(endTimeLabel)"
}

/// The label for an edited plan time's range.
public func formatPlanTimeRangeLabel(_ edit: EditablePlanTime) -> String {
  formatPlanTimeRangeLabel(
    startDate: edit.startDate, startTime: edit.startTime, endDate: edit.endDate,
    endTime: edit.endTime)
}
