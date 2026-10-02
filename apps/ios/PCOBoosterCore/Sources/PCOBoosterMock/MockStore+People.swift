import Foundation

/// People reads refined from their fixtures: search by query, batches by requested ids, and
/// the People month moved onto the current calendar month.
extension MockStore {
  private static let searchLimit = 15
  /// The month the fixtures' People dashboard reads ("this month" when they were written).
  private static let fixtureMonth =
    MockDay(key: MockFixtures.anchorSunday).map(MockMonth.init) ?? MockMonth(year: 2026, month: 10)

  func searchPeople(_ input: MockJSON) throws -> MockJSON {
    let query = try input.requiredString("query")
    let terms = Self.searchTerms(query)
    let directory = try fixtureOutput("people/search", for: input).array ?? []
    let matches = directory.filter { person in
      let name = Self.folded(person["fullName"]?.string ?? "")
      return terms.allSatisfy(name.contains)
    }
    let startsWithQuery = matches.filter { person in
      [person["firstName"], person["lastName"]].contains { name in
        Self.folded(name?.string ?? "").hasPrefix(terms.first ?? "")
      }
    }
    let rest = matches.filter { !startsWithQuery.contains($0) }
    return .array(Array((startsWithQuery + rest).prefix(Self.searchLimit)))
  }

  /// The requested people's availability; anyone the fixture leaves out is available.
  func candidateDetails(_ input: MockJSON) throws -> MockJSON {
    var output = try fixtureOutput("people/candidateDetails", for: input)
    let known = output["people"]?.array ?? []
    let people = (input["personIds"]?.array ?? []).compactMap(\.string).map { personId in
      known.first { $0["personId"]?.string == personId }
        ?? .object(["personId": .string(personId), "isBlockedForDate": .bool(false)])
    }
    output["people"] = .array(people)
    output["deferredPersonIds"] = .array([])
    output["blockoutProgress"] = .array([])
    return output
  }

  func dashboardRoster(_ input: MockJSON) throws -> MockJSON {
    var output = try fixtureOutput("people/dashboardRoster", for: input)
    output["month"] = monthInfo(currentMonth)
    return output
  }

  /// The requested people's activity, with this month's days on the current month.
  func dashboardActivity(_ input: MockJSON) throws -> MockJSON {
    var output = try fixtureOutput("people/dashboardActivity", for: input)
    let known = output["people"]?.array ?? []
    let requested = (input["personIds"]?.array ?? []).compactMap(\.string)
    output["people"] = .array(
      requested.compactMap { personId in
        known.first { $0["id"]?.string == personId }.map { activity in
          var activity = activity
          activity["monthDays"] = .array(
            rebase(
              activity["monthDays"]?.array ?? [], from: Self.fixtureMonth, to: currentMonth))
          return activity
        }
      })
    output["deferredPersonIds"] = .array([])
    return output
  }

  /// A person's month. The fixtures' October stands for the current month, September for the
  /// one before, and so on; the days move by whole weeks onto the requested month.
  func dashboardPerson(_ input: MockJSON) throws -> MockJSON {
    let requested = input["month"]?.string.flatMap(MockMonth.init(key:)) ?? currentMonth
    var fixtureInput = input
    if input["month"]?.string != nil {
      fixtureInput["month"] = .string(requested.adding(months: -monthOffset).key)
    }
    var output = try fixtureOutput("people/dashboardPerson", for: fixtureInput)
    let source =
      output["month"].flatMap { month -> MockMonth? in
        guard let year = month["year"]?.int, let index = month["monthIndex"]?.int else {
          return nil
        }
        return MockMonth(year: year, month: index + 1)
      } ?? Self.fixtureMonth
    output["month"] = monthInfo(requested)
    output["previousMonth"] = .string(requested.adding(months: -1).key)
    output["nextMonth"] = .string(requested.adding(months: 1).key)
    if var person = output["person"] {
      person["monthDays"] = .array(
        rebase(person["monthDays"]?.array ?? [], from: source, to: requested))
      output["person"] = person
    }
    return output
  }

  // MARK: Months

  private var currentMonth: MockMonth { MockMonth(calendar.today) }

  /// Months from the fixtures' month to the current one.
  private var monthOffset: Int { Self.fixtureMonth.months(to: currentMonth) }

  /// `PeopleDashboardMonth`, as the API builds it.
  private func monthInfo(_ month: MockMonth) -> MockJSON {
    .object([
      "year": .int(month.year),
      "monthIndex": .int(month.month - 1),
      "label": .string("\(Self.monthNames[month.month - 1]) \(month.year)"),
      "daysInMonth": .int(calendar.daysInMonth(month)),
      "startsOnWeekday": .int(calendar.weekday(of: month.firstDay)),
    ])
  }

  /// Month days moved by the whole weeks that best line `source` up with `target`, keeping
  /// weekdays; days that land outside `target` drop.
  private func rebase(_ days: [MockJSON], from source: MockMonth, to target: MockMonth)
    -> [MockJSON]
  {
    let gap = calendar.days(from: source.firstDay, to: target.firstDay)
    let shift = Int((Double(gap) / 7).rounded()) * 7
    let moved = days.compactMap { entry -> MockJSON? in
      guard let day = entry["day"]?.int else { return nil }
      let date = calendar.adding(
        shift, to: MockDay(year: source.year, month: source.month, day: day))
      guard MockMonth(date) == target else { return nil }
      var entry = entry
      entry["day"] = .int(date.day)
      return entry
    }
    return moved.sorted { first, second in
      let firstDay = first["day"]?.int ?? 0
      let secondDay = second["day"]?.int ?? 0
      if firstDay != secondDay {
        return firstDay < secondDay
      }
      return first["kind"]?.string == "service" && second["kind"]?.string != "service"
    }
  }

  private static let monthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
  ]

  private static func folded(_ text: String) -> String {
    text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
  }

  private static func searchTerms(_ query: String) -> [String] {
    folded(query).split(whereSeparator: \.isWhitespace).map(String.init)
  }
}
