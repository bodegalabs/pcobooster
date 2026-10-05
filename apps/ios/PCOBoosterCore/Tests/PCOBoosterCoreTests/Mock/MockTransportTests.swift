import Foundation
import PCOBoosterCore
import Testing

@testable import PCOBoosterMock

struct MockTransportTests {
  private let showcase = MockFixtures.Showcase.self

  // MARK: Envelope and routing

  @Test func wrapsOutputsInTheRPCEnvelope() async throws {
    let call = try await MockTransport.testing().call("health")
    #expect(call.status == 200)
    #expect(call.body["meta"] == .array([]))
    #expect(call.output == .object(["status": .string("ok"), "version": .string("mock")]))
  }

  @Test func answersMatchedCasesBeforeTheDefault() async throws {
    let transport = MockTransport.testing()
    let plan = try await transport.call(
      "catalog/plan",
      .object(["serviceTypeId": .string(showcase.serviceTypeId), "planId": .string(showcase.planId)]))
    #expect(plan.output["title"] == .string("Deep Roots"))
    #expect(plan.output["seriesTitle"] == .string("Rooted"))
    let missing = try await transport.call(
      "catalog/plan", .object(["serviceTypeId": .string("1101"), "planId": .string("1")]))
    #expect(missing.status == 200)
    #expect(missing.output == .null)
  }

  @Test func acceptsLeadingSlashesAndTheRPCPrefix() async throws {
    let transport = MockTransport.testing()
    for path in ["/catalog/serviceTypes", "/api/rpc/catalog/serviceTypes"] {
      let call = try await transport.call(path)
      #expect(call.output.array?.count == 3)
    }
  }

  @Test func unknownProceduresGetTheORPCNotFoundEnvelope() async throws {
    let call = try await MockTransport.testing().call("nope/missing")
    #expect(call.status == 404)
    #expect(call.output["code"] == .string("NOT_FOUND"))
    #expect(call.output["status"] == .int(404))
    #expect(call.output["defined"] == .bool(false))
    #expect(call.output["data"]?["message"]?.string?.contains("nope/missing") == true)
  }

  @Test func malformedBodiesAreBadRequests() async throws {
    let response = try await MockTransport.testing().send(
      RPCRequest(path: "health", body: Data("not json".utf8)))
    #expect(response.status == 400)
    let body = try MockJSON.parse(response.body)
    #expect(body["json"]?["code"] == .string("BAD_REQUEST"))
  }

  @Test func voidOutputsReplyWithAnEmptyObject() async throws {
    let response = try await MockTransport.testing().send(
      RPCRequest(
        path: "planTimes/delete",
        body: try MockJSON.object([
          "json": .object([
            "serviceTypeId": .string("1101"), "planId": .string(showcase.planId),
            "planTimeId": .string("8812610043"),
          ])
        ]).encoded()))
    #expect(response.status == 200)
    #expect(String(decoding: response.body, as: UTF8.self) == "{}")
  }

  @Test func waitsForTheConfiguredLatency() async throws {
    let transport = MockTransport(latency: .milliseconds(120), now: MockFixtures.anchorNow)
    let clock = ContinuousClock()
    let elapsed = try await clock.measure { _ = try await transport.call("health") }
    #expect(elapsed >= .milliseconds(120))
  }

  @Test func fixedNowPinsTransportsCreatedAfterIt() {
    let sunday = Date(timeIntervalSince1970: 1_795_885_200)  // 2026-11-28T17:00:00Z, Saturday
    MockTransport.fixedNow = sunday
    defer { MockTransport.fixedNow = nil }
    #expect(MockTransport(latency: .zero).dayShift == 56)
    #expect(MockTransport(latency: .zero, now: MockFixtures.anchorNow).dayShift == 0)
  }

  // MARK: Date shifting

  @Test func anchorNowServesFixtureDatesUnchanged() async throws {
    let transport = MockTransport.testing()
    #expect(transport.dayShift == 0)
    let plan = try await transport.call(
      "catalog/plan", .object(["serviceTypeId": .string("1101"), "planId": .string(showcase.planId)]))
    #expect(plan.output["sortDate"] == .string("2026-10-04T16:00:00.000Z"))
  }

  @Test(arguments: [
    // Thursday before the anchor: the anchor is the coming Sunday.
    ("2026-10-01T17:00:00Z", 0),
    // A Sunday: that Sunday, across the end of daylight saving time.
    ("2026-11-22T16:00:00Z", 49),
    // The Monday after: next Sunday.
    ("2026-11-23T18:00:00Z", 56),
    // Saturday night in Los Angeles is already Sunday in UTC.
    ("2026-11-29T06:30:00Z", 56),
    // Before the anchor.
    ("2026-09-15T18:00:00Z", -14),
  ])
  func shiftsToTheComingSunday(_ now: String, _ expected: Int) throws {
    let transport = MockTransport.testing(now: try #require(JSONCoding.parseISODate(now)))
    #expect(transport.dayShift == expected)
  }

  @Test func shiftingKeepsWeekdaysAndWallClockTimes() async throws {
    // 2026-11-22 is a Sunday in PST; the anchor Sunday was in PDT.
    let now = try #require(JSONCoding.parseISODate("2026-11-22T16:00:00Z"))
    let transport = MockTransport.testing(now: now)
    let upcoming = try await transport.call(
      "catalog/plans", .object(["serviceTypeId": .string(showcase.serviceTypeId)]))
    let plans = try #require(upcoming.output.array)
    #expect(plans.first?["id"] == .string(showcase.planId))
    for plan in plans {
      let sortDate = try date(plan["sortDate"])
      #expect(orgCalendar.component(.weekday, from: sortDate) == 1)
      #expect(orgCalendar.component(.hour, from: sortDate) == 9)
    }
    let showcaseDate = try date(plans.first?["sortDate"])
    #expect(JSONCoding.isoString(showcaseDate) == "2026-11-22T17:00:00.000Z")

    let times = try await transport.call(
      "planTimes/list",
      .object(["serviceTypeId": .string("1101"), "planId": .string(showcase.planId)]))
    let rehearsal = try date(times.output.array?.first?["startsAt"])
    #expect(orgCalendar.component(.weekday, from: rehearsal) == 5)
    #expect(orgCalendar.component(.hour, from: rehearsal) == 19)
  }

  @Test func shiftsDayKeysByTheSameDays() async throws {
    let now = try #require(JSONCoding.parseISODate("2026-11-22T16:00:00Z"))
    let activity = try await MockTransport.testing(now: now).call(
      "people/dashboardActivity", .object(["personIds": .array([.string(showcase.personId)])]))
    let rhythm = activity.output["people"]?.array?.first?["rhythm"]
    #expect(rhythm?["nextServingOn"] == .string("2026-11-22"))
    #expect(rhythm?["lastServedOn"] == .string("2026-11-15"))
  }

  @Test func matchesShiftedDatesAndFollowsTheContinuation() async throws {
    let now = try #require(JSONCoding.parseISODate("2026-11-22T16:00:00Z"))
    let transport = MockTransport.testing(now: now)
    let first = try await transport.call(
      "people/planWindowHistory", .object(["date": .string("2026-11-22T17:00:00Z")]))
    let deferred = try #require(first.output["deferredPlans"]?.array)
    #expect(!deferred.isEmpty)
    #expect(first.output["deferredServiceTypeIds"] == .array([.string("1103")]))
    let second = try await transport.call(
      "people/planWindowHistory",
      .object([
        "date": .string("2026-11-22T17:00:00.000Z"),
        "continuation": .object([
          "plans": .array(deferred), "serviceTypeIds": .array([.string("1103")]),
        ]),
      ]))
    #expect(second.output["deferredPlans"] == .array([]))
    #expect(second.output["deferredServiceTypeIds"] == .array([]))
    let planIds = (second.output["plans"]?.array ?? []).compactMap { $0["id"]?.string }
    #expect(planIds.contains(showcase.eventPlanId))
  }

  // MARK: Refined reads

  @Test func peopleSearchFiltersTheDirectory() async throws {
    let call = try await MockTransport.testing().call(
      "people/search", .object(["query": .string("lane")]))
    let names = (call.output.array ?? []).compactMap { $0["fullName"]?.string }
    #expect(names.count >= 4)
    #expect(names.count <= 15)
    #expect(names.allSatisfy { $0.localizedCaseInsensitiveContains("lane") })
  }

  @Test func songSearchRanksTitleMatchesFirst() async throws {
    let call = try await MockTransport.testing().call(
      "songs/search", .object(["query": .string("morning")]))
    let results = try #require(call.output.array)
    // Whole numbers come back from JSON as integers.
    #expect(results.first?["matchScore"]?.int == 1)
    let titles = results.compactMap { $0["title"]?.string }
    #expect(titles.contains("Morning Light"))
    #expect(titles.contains("A New Morning"))
    #expect(!titles.contains("Steady Ground"))
  }

  @Test func candidateDetailsAnswerTheRequestedBatch() async throws {
    let call = try await MockTransport.testing().call(
      "people/candidateDetails",
      .object([
        "personIds": .array([.string("4100105"), .string("4100101"), .string("999")]),
        "planId": .string(showcase.planId),
        "date": .string("2026-10-04T16:00:00.000Z"),
        "scheduleHistory": .bool(false),
      ]))
    let people = try #require(call.output["people"]?.array)
    #expect(people.compactMap { $0["personId"]?.string } == ["4100105", "4100101", "999"])
    #expect(people.map { $0["isBlockedForDate"] } == [.bool(true), .bool(false), .bool(false)])
    #expect(call.output["deferredPersonIds"] == .array([]))
  }

  @Test func candidatesAgreeWithTheShowcaseLineup() async throws {
    let transport = MockTransport.testing()
    let file = try #require(try MockFixtures.load("people/positionCandidates"))
    let cases = file.cases.filter { $0.match["planId"]?.string == showcase.planId }
    #expect(cases.count >= 10)
    for entry in cases {
      let call = try await transport.call(
        "people/positionCandidates",
        .object([
          "serviceTypeId": .string(showcase.serviceTypeId), "planId": .string(showcase.planId),
          "positionId": entry.match["positionId"] ?? .null,
        ]))
      #expect(call.output["candidates"] == entry.output["candidates"])
    }
  }

  @Test func peopleMonthFollowsTheCalendar() async throws {
    // Wednesday, March 10, 2027.
    let now = try #require(JSONCoding.parseISODate("2027-03-10T20:00:00Z"))
    let transport = MockTransport.testing(now: now)
    let roster = try await transport.call("people/dashboardRoster")
    #expect(
      roster.output["month"]
        == .object([
          "year": .int(2027), "monthIndex": .int(2), "label": .string("March 2027"),
          "daysInMonth": .int(31), "startsOnWeekday": .int(1),
        ]))

    let detail = try await transport.call(
      "people/dashboardPerson",
      .object(["personId": .string(showcase.personId), "month": .string("2027-02")]))
    #expect(detail.output["month"]?["label"] == .string("February 2027"))
    #expect(detail.output["previousMonth"] == .string("2027-01"))
    #expect(detail.output["nextMonth"] == .string("2027-03"))
    let days = try #require(detail.output["person"]?["monthDays"]?.array)
    #expect(!days.isEmpty)
    for entry in days {
      let day = try #require(entry["day"]?.int)
      let date = try #require(
        orgCalendar.date(from: DateComponents(year: 2027, month: 2, day: day, hour: 12)))
      // Sunday services and Thursday rehearsals stay on their weekdays.
      let weekday = orgCalendar.component(.weekday, from: date)
      #expect(weekday == (entry["kind"] == .string("service") ? 1 : 5))
    }
  }

  @Test func peopleMonthIsTheFixtureMonthAtTheAnchor() async throws {
    let transport = MockTransport.testing()
    let detail = try await transport.call(
      "people/dashboardPerson", .object(["personId": .string(showcase.personId)]))
    let file = try #require(try MockFixtures.load("people/dashboardPerson"))
    let fixture = file.output(for: .object(["personId": .string(showcase.personId)]))
    #expect(detail.output == fixture)
  }
}
