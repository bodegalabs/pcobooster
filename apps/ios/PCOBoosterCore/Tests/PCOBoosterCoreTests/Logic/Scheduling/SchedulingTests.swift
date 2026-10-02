import Foundation
import Testing

@testable import PCOBoosterCore

/// What the `scheduling.*` fixtures cannot pin: the JavaScript helpers on their own, the
/// coupling between the scoring copy and the ranking reasons, and the deliberate departures
/// where the TypeScript would throw, loop, or carry an invalid date.
struct SchedulingTests {
  struct LocaleCompareInput: Decodable, Sendable {
    let a: String
    let b: String
  }

  @Test(arguments: Parity.cases("scheduling.localeCompare", LocaleCompareInput.self, Int.self))
  func localeCompare(_ parity: ParityCase<LocaleCompareInput, Int>) {
    #expect(JSCollator.compare(parity.input.a, parity.input.b) == parity.output)
  }

  @Test func collatorIgnoresWhatICUIgnores() {
    #expect(JSCollator.compare("Zed\u{200B}", "Zed") == 0)
    #expect(JSCollator.compare("\u{FEFF}Ann", "Ann") == 0)
    #expect(JSCollator.compare("Ana\u{AD}Lucia", "AnaLucia") == 0)
    #expect(JSCollator.compare("Zoe\u{308}", "Zo\u{EB}") == 0)
    #expect(JSCollator.compare("a", "A") < 0)
    #expect(JSCollator.compare("\u{FF21}", "A") > 0)
    #expect(JSCollator.compare("e", "\u{E9}") < 0)
  }

  @Test func sortKeepsTiesInInputOrder() {
    let items = Array(0..<40)
    let allEqual = JSSort.sorted(items) { _, _ in 0 }
    let unordered = JSSort.sorted(items) { _, _ in Double.nan }
    let byRemainder = JSSort.sorted(items) { (a: Int, b: Int) -> Double in Double(a % 3 - b % 3) }
    #expect(allEqual == items)
    #expect(unordered == items)
    #expect(Array(byRemainder.prefix(4)) == [0, 3, 6, 9])
  }

  @Test func stringHelpersCountCodeUnits() {
    #expect(!JSString.equal("\u{E9}", "e\u{301}"))
    #expect(JSString.hasPrefix("e\u{301}x", "e"))
    #expect(JSString.split("A - B - C", separator: " - ") == ["A", "B", "C"])
    #expect(JSString.split(" - ", separator: " - ") == ["", ""])
    #expect(JSString.uniqued(["\u{E9}", "e\u{301}", "\u{E9}"]).count == 2)
  }

  @Test func datesReadTheWayNewDateReadsISOText() throws {
    func time(_ text: String) -> Int? {
      JSDate.parse(text).map(JSParity.time)
    }
    #expect(time("2026-01-01T00:00:00.1239Z") == time("2026-01-01T00:00:00.123Z"))
    #expect(time("2026-01-01T00:00:00.1Z") == time("2026-01-01T00:00:00.100Z"))
    #expect(time("2026-01-01T24:00:00Z") == time("2026-01-02T00:00:00Z"))
    #expect(time("2026-01-01T10:00:00+05:30") == time("2026-01-01T04:30:00Z"))
    #expect(time("2026-01-01T10:00:00+0530") == time("2026-01-01T04:30:00Z"))
    #expect(time("2026-02-30T00:00:00Z") == time("2026-03-02T00:00:00Z"))
    #expect(time("+002026-01-01T00:00:00Z") == time("2026-01-01T00:00:00Z"))
    #expect(time("2026") == time("2026-01-01T00:00:00Z"))
    #expect(time("2026-01-01") == 1_767_225_600_000)
    // The browser reads a time without an offset in its own zone; the port reads UTC.
    #expect(time("2026-01-01T10:00") == time("2026-01-01T10:00Z"))
    for invalid in [
      "", "x", "2026-13-01", "2026-01-01T24:00:01Z", "2026-01-01T10:00:60Z",
      "2026-01-01T10:60:00Z", "2026-01-01T10:00:00.Z", "2026-1-1", "2026-01-01T10:00:00+25:00",
      "2026-01-01T10:00:00Zjunk", "-000000-01-01T00:00:00Z",
    ] {
      #expect(JSDate.parse(invalid) == nil, "\(invalid)")
    }
  }

  /// Every line the scoring writes is a fact `groupRankingReasons` knows or an adjustment it
  /// attaches to one, so the two copies cannot drift apart unnoticed.
  @Test func rankingReasonsReadEveryLineTheScoringWrites() throws {
    let timeZone = "America/Los_Angeles"
    let referenceDate = try #require(JSONCoding.parseISODate("2026-09-27T17:00:00.000Z"))
    let preferences = [
      nil, "Unavailable", "Choose Weeks", "Once a month", "Twice a month", "Three times a month",
      "Every other week", "Every 3rd week", "Every 9th week",
    ]
    var people: [CandidatePerson] = []
    for (index, offsets) in [[], [-1], [-3, -10, -17, 2], [-20, 5, 9], [12, 16], [0, 1]]
      .enumerated()
    {
      let history = offsets.enumerated().map { item, days in
        ServiceHistoryItem(
          id: "\(index)-\(item)", sourceScheduleId: "pp-\(item)", planId: "plan-\(item)",
          date: referenceDate.addingTimeInterval(Double(days) * 86_400),
          teamPositionName: "Keys", status: "C",
          timeType: item.isMultiple(of: 2) ? .service : .rehearsal)
      }
      let summary = summarizeCandidateHistory(
        history, referenceDate: referenceDate, timeZone: timeZone)
      for (preferenceIndex, preference) in preferences.enumerated() {
        people.append(
          CandidatePerson(
            id: "\(index)-\(preferenceIndex)", firstName: "A", lastName: "B", fullName: "A B",
            frequency: index == 0 ? nil : summary.frequency,
            serviceHistory: summary.serviceHistory,
            isBlockedForDate: false,
            schedulingPreferences: SchedulingPreferences(
              schedulePreference: preference, preferredWeeks: [2, 4],
              timePreferenceOptionIds: ["tpo-9am"], maxPlansPerDay: 1, maxPlansPerMonth: 1)))
      }
    }
    let scored = scoreAndNormalize(
      people, referenceDate: referenceDate, timeZone: timeZone,
      slot: ScoringSlot(planId: "plan-sel", slotTimePreferenceOptionId: "tpo-11am"))
    for person in scored {
      let facts = groupRankingReasons(person.recommendationReasoning)
      #expect(!facts.contains { $0.kind == .note }, "\(person.recommendationReasoning)")
      #expect(facts.flatMap { [$0.text] + $0.adjustments } == person.recommendationReasoning)
    }
  }

  @Test func batchSizeBelowOneStillMakesProgress() {
    let candidates = PositionCandidates(
      generatedAt: "", timeZone: "UTC", match: SelectedPlanMatch(),
      candidates: ["a", "b"].map {
        PositionCandidate(
          id: $0, firstName: $0, lastName: "", fullName: $0, archived: false,
          selectedPlanRosterLabels: [])
      })
    #expect(planCandidateDetailsBatches(candidates, batchSize: 0) == [["a"], ["b"]])
    #expect(planCandidateDetailsBatches(nil) == [])
  }

  @Test func windowRowsFallBackPastUnreadableDates() throws {
    func row(_ id: String, createdAt: String, timeIds: [String] = []) -> WindowRosterRow {
      WindowRosterRow(
        id: id, planId: "plan-1", teamPositionName: "Keys", status: "C", createdAt: createdAt,
        timeIds: timeIds, serviceTimeIds: timeIds)
    }
    let batch = PlanWindowHistoryBatch(
      generatedAt: "", loadedPlanCount: 1,
      plans: [WindowPlanSummary(id: "plan-1", sortDate: "not a date")],
      planTimes: [WindowPlanTime(id: "t-1", startsAt: "garbage", timeType: "service")],
      people: [
        PlanWindowHistoryBatchPerson(
          personId: "p-1",
          rows: [
            row("pp-1", createdAt: "2026-02-01T00:00:00Z", timeIds: ["t-1"]),
            row("pp-2", createdAt: "unreadable"),
          ])
      ],
      deferredPlans: [], deferredServiceTypeIds: [],
      requestBudget: PlanWindowHistoryBatchRequestBudget(
        limit: 36, planningCenterRequests: 1, planRangeRequests: 1, rosterRequests: 1))
    let history = try #require(expandPlanWindowHistory([batch], selectedPlanId: "x")["p-1"])
    #expect(history.serviceHistory.map(\.id) == ["pp-1:t-1"])
    #expect(history.serviceHistory.first.map { JSParity.time($0.date) } == 1_769_904_000_000)
  }

  @Test func unknownStatusCodesCountAsPending() {
    let person = OptimisticSchedulePerson(id: "p", fullName: "Pat Doe")
    let position = ScheduleOptimism.upsertFilledPerson(
      TeamPosition(id: "pos", name: "Keys", teamId: "team"), person: person,
      planPersonId: "pp", status: .unknown("X"))
    #expect(position.filledPeople?.first?.status == .pending)
    #expect(position.filledPendingCount == 1)
    #expect(
      ScheduleOptimism.optimisticSlot(status: .unknown("X"), planPersonId: "pp").status == .pending)
    let removed = ScheduleOptimism.upsertFilledPerson(
      position, person: person, planPersonId: "pp", status: .d)
    #expect(removed.filledPeople == nil)
    #expect(removed.filledPendingCount == 0)
  }

  @Test func candidatePersonRoundTripsThroughTheAPICoders() throws {
    let person = CandidatePerson(
      id: "p", firstName: "Pat", lastName: "Doe", fullName: "Pat Doe", availability: .blocked,
      frequency: ScheduleFrequency(
        recentServedDays: 2, lastServedDate: Date(timeIntervalSince1970: 1)),
      isBlockedForDate: true, recommendationScore: 81.93, recommendationReasoning: ["x"])
    let data = try JSONCoding.makeEncoder().encode(person)
    #expect(try JSONCoding.makeDecoder().decode(CandidatePerson.self, from: data) == person)
  }
}
