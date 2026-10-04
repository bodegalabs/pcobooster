import Foundation
import Testing

@testable import PCOBoosterMock

/// Writes land in the overlay, so the reads a client refetches afterwards agree with them.
struct MockOverlayTests {
  private let plan = MockJSON.object([
    "serviceTypeId": .string(MockFixtures.Showcase.serviceTypeId),
    "planId": .string(MockFixtures.Showcase.planId),
  ])

  private func with(_ base: MockJSON, _ fields: [String: MockJSON]) -> MockJSON {
    var merged = base
    for (key, value) in fields {
      merged[key] = value
    }
    return merged
  }

  private func position(_ groups: MockJSON, _ positionId: String) -> MockJSON? {
    groups.array?.lazy.compactMap { group in
      group["positions"]?.array?.first { $0["id"]?.string == positionId }
    }.first
  }

  private func candidate(_ output: MockJSON, _ personId: String) -> MockJSON? {
    output["candidates"]?.array?.first { $0["id"]?.string == personId }
  }

  // MARK: Plan items

  @Test func reorderIsWhatTheNextListReturns() async throws {
    let transport = MockTransport.testing()
    let before = try await transport.call("planItems/list", plan)
    let ids = try #require(before.output.array?.compactMap { $0["id"] })
    #expect(ids.count > 5)
    let reversed = Array(ids.reversed())
    let reorder = try await transport.call(
      "planItems/reorder", with(plan, ["sequence": .array(reversed)]))
    #expect(reorder.output == .object(["success": .bool(true)]))
    let after = try await transport.call("planItems/list", plan)
    let items = try #require(after.output.array)
    #expect(items.compactMap { $0["id"] } == reversed)
    #expect(items.compactMap { $0["sequence"]?.int } == Array(1...items.count))
  }

  @Test func createdSongItemsCarryTheirArrangementAndKey() async throws {
    let transport = MockTransport.testing()
    let created = try await transport.call(
      "planItems/create",
      with(
        plan,
        [
          "songId": .string("5506"), "arrangementId": .string("55061"),
          "keyId": .string("550612"),
        ]))
    #expect(created.output["itemType"] == .string("song"))
    #expect(created.output["title"] == .string("Wide as the Sky"))
    #expect(created.output["arrangement"]?["id"] == .string("55061"))
    #expect(created.output["key"]?["startingKey"] == .string("C"))
    #expect(created.output["length"] == .int(285))
    let list = try await transport.call("planItems/list", plan)
    #expect(list.output.array?.last == created.output)
  }

  @Test func updatesAndDeletesShowInTheList() async throws {
    let transport = MockTransport.testing()
    let items = try #require(try await transport.call("planItems/list", plan).output.array)
    let welcome = try #require(items.first { $0["title"] == .string("Welcome") })
    let itemId = try #require(welcome["id"])
    let updated = try await transport.call(
      "planItems/update",
      with(plan, ["itemId": itemId, "length": .int(300), "description": .string("Host: Jordan")]))
    #expect(updated.output["length"] == .int(300))
    _ = try await transport.call(
      "planItems/delete", with(plan, ["itemId": try #require(items.first?["id"])]))
    let after = try #require(try await transport.call("planItems/list", plan).output.array)
    #expect(after.count == items.count - 1)
    #expect(after.first { $0["id"] == itemId }?["description"] == .string("Host: Jordan"))
  }

  // MARK: Plan times

  @Test func createdAndDeletedTimesShowInTheList() async throws {
    let transport = MockTransport.testing()
    let created = try await transport.call(
      "planTimes/create",
      with(
        plan,
        [
          "name": .string("Sound check"), "startsAt": .string("2026-10-04T14:30:00Z"),
          "timeType": .string("rehearsal"), "assignedTeamIds": .array([.string("2203")]),
        ]))
    #expect(created.output["startsAt"] == .string("2026-10-04T14:30:00.000Z"))
    let timeId = try #require(created.output["id"])
    var times = try #require(try await transport.call("planTimes/list", plan).output.array)
    #expect(times.contains(created.output))
    _ = try await transport.call("planTimes/delete", with(plan, ["planTimeId": timeId]))
    times = try #require(try await transport.call("planTimes/list", plan).output.array)
    #expect(!times.contains { $0["id"] == timeId })
  }

  // MARK: Scheduling

  @Test func assignAddsAPendingUnsentPersonToLineupAndAssign() async throws {
    let transport = MockTransport.testing()
    let acoustic = "3301"
    let quinn = "4100103"
    let before = try #require(
      position(try await transport.call("catalog/teamPositions", plan).output, acoustic))
    #expect(before["neededCount"] == .int(1))

    let assign = try await transport.call(
      "schedule/assign",
      with(
        plan,
        [
          "personId": .string(quinn), "teamId": .string("2201"),
          "positionId": .string(acoustic),
        ]))
    let planPersonId = try #require(assign.output["data"]?["id"])

    let after = try #require(
      position(try await transport.call("catalog/teamPositions", plan).output, acoustic))
    #expect(after["neededCount"] == .int(0))
    #expect(after["filledPendingCount"] == .int(1))
    let added = try #require(after["filledPeople"]?.array?.first { $0["personId"]?.string == quinn })
    #expect(added["name"] == .string("Quinn Clark"))
    #expect(added["planPersonId"] == planPersonId)
    #expect(added["notification"]?["prepared"] == .bool(true))

    let candidates = try await transport.call(
      "people/positionCandidates", with(plan, ["positionId": .string(acoustic)]))
    let slot = candidate(candidates.output, quinn)?["selectedPlanSlot"]
    #expect(slot?["planPersonId"] == planPersonId)
    #expect(slot?["status"] == .string("pending"))
    #expect(
      candidate(candidates.output, quinn)?["selectedPlanRosterLabels"]
        == .array([.string("Band - Acoustic Guitar")]))

    let again = try await transport.call(
      "schedule/assign",
      with(
        plan,
        [
          "personId": .string(quinn), "teamId": .string("2201"),
          "positionId": .string(acoustic),
        ]))
    #expect(again.status == 409)
    #expect(again.output["code"] == .string("ALREADY_SCHEDULED"))
  }

  @Test func declineConfirmAndUnscheduleFollowThrough() async throws {
    let transport = MockTransport.testing()
    let drums = "3303"
    let lane = "4100108"
    let groups = try await transport.call("catalog/teamPositions", plan).output
    let lanePlanPersonId = try #require(
      position(groups, drums)?["filledPeople"]?.array?.first?["planPersonId"])

    _ = try await transport.call(
      "schedule/updateStatus",
      with(plan, ["planPersonId": lanePlanPersonId, "status": .string("D")]))
    let declined = try await transport.call("catalog/teamPositions", plan).output
    #expect(position(declined, drums)?["filledPeople"] == nil)
    let candidates = try await transport.call(
      "people/positionCandidates", with(plan, ["positionId": .string(drums)]))
    #expect(candidate(candidates.output, lane)?["selectedPlanSlot"]?["status"] == .string("declined"))

    _ = try await transport.call(
      "schedule/updateStatus",
      with(plan, ["planPersonId": lanePlanPersonId, "status": .string("C")]))
    let confirmed = try await transport.call("catalog/teamPositions", plan).output
    #expect(position(confirmed, drums)?["filledConfirmedCount"] == .int(1))

    _ = try await transport.call("schedule/remove", with(plan, ["planPersonId": lanePlanPersonId]))
    let removed = try await transport.call("catalog/teamPositions", plan).output
    #expect(position(removed, drums)?["filledPeople"] == nil)
    let after = try await transport.call(
      "people/positionCandidates", with(plan, ["positionId": .string(drums)]))
    #expect(candidate(after.output, lane)?["selectedPlanSlot"] == .null)
  }

  @Test func fixtureDeclinesCanBeConfirmed() async throws {
    let transport = MockTransport.testing()
    let electric = "3304"
    let avery = "4100111"
    let before = try await transport.call(
      "people/positionCandidates", with(plan, ["positionId": .string(electric)]))
    let slot = try #require(candidate(before.output, avery)?["selectedPlanSlot"])
    #expect(slot["status"] == .string("declined"))
    _ = try await transport.call(
      "schedule/updateStatus",
      with(plan, ["planPersonId": slot["planPersonId"] ?? .null, "status": .string("U")]))
    let groups = try await transport.call("catalog/teamPositions", plan).output
    let people = position(groups, electric)?["filledPeople"]?.array ?? []
    #expect(people.contains { $0["personId"]?.string == avery })
    let after = try await transport.call(
      "people/positionCandidates", with(plan, ["positionId": .string(electric)]))
    #expect(candidate(after.output, avery)?["selectedPlanSlot"]?["status"] == .string("pending"))
  }

  @Test func openSlotsChangeOnlyWithAnOpenSlotRecord() async throws {
    let transport = MockTransport.testing()
    let added = try await transport.call(
      "neededPositions/adjust",
      with(
        plan,
        [
          "teamId": .string("2201"), "positionName": .string("Acoustic Guitar"),
          "change": .string("add"),
        ]))
    #expect(added.output == .object(["openCount": .int(2)]))
    let filledOnly = try await transport.call(
      "neededPositions/adjust",
      with(
        plan,
        ["teamId": .string("2201"), "positionName": .string("Keys"), "change": .string("add")]))
    #expect(filledOnly.output == .object(["openCount": .int(0)]))
    let groups = try await transport.call("catalog/teamPositions", plan).output
    #expect(position(groups, "3301")?["neededCount"] == .int(2))
  }

  @Test func planPersonTimesReplaceTheAssignedTimes() async throws {
    let transport = MockTransport.testing()
    let groups = try await transport.call("catalog/teamPositions", plan).output
    let person = try #require(position(groups, "3305")?["filledPeople"]?.array?.first)
    _ = try await transport.call(
      "planPeople/updateTimes",
      with(
        plan,
        [
          "personId": person["personId"] ?? .null,
          "planPersonId": person["planPersonId"] ?? .null,
          "planTimeIds": .array([.string("8812610042")]),
        ]))
    let after = try await transport.call("catalog/teamPositions", plan).output
    let updated = position(after, "3305")?["filledPeople"]?.array?.first
    #expect(updated?["assignedTimeIds"] == .array([.string("8812610042")]))
    #expect(updated?["serviceTimeIds"] == .array([.string("8812610042")]))
  }

  // MARK: Chord charts

  @Test func chordChartSavesDetectStaleEdits() async throws {
    let transport = MockTransport.testing()
    let song = MockJSON.object(["songId": .string(MockFixtures.Showcase.songId)])
    let current = try await transport.call("chordCharts/song", song)
    let arrangement = try #require(current.output["arrangements"]?.array?.first)
    let edit = with(
      song,
      [
        "arrangementId": arrangement["id"] ?? .null,
        "chordChart": .string("VERSE 1\n[G]New words"),
        "chordChartKey": .string("G"),
        "layout": .object(["columns": .int(1)]),
        "baseUpdatedAt": arrangement["updatedAt"] ?? .null,
      ])
    let saved = try await transport.call("chordCharts/update", edit)
    #expect(saved.status == 200)
    #expect(saved.output["lyrics"] == .string("VERSE 1\nNew words"))
    #expect(saved.output["layout"]?["columns"] == .int(1))
    #expect(saved.output["layout"]?["font"] == .string("Helvetica"))

    let stale = try await transport.call("chordCharts/update", edit)
    #expect(stale.status == 409)
    #expect(stale.output["data"]?["reason"] == .string("arrangement-updated"))

    let reread = try await transport.call("chordCharts/song", song)
    #expect(reread.output["arrangements"]?.array?.first == saved.output)
  }

  @Test func createdSongsJoinTheLibraryAndSearch() async throws {
    let transport = MockTransport.testing()
    let created = try await transport.call(
      "chordCharts/createSong", .object(["title": .string("Harvest Moon Hymn")]))
    let songId = try #require(created.output["song"]?["id"])
    let library = try await transport.call("songs/library")
    #expect(library.output["songs"]?.array?.contains { $0["id"] == songId } == true)
    let search = try await transport.call("songs/search", .object(["query": .string("harvest")]))
    #expect(search.output.array?.first?["id"] == songId)
    let chart = try await transport.call("chordCharts/song", .object(["songId": songId]))
    #expect(chart.output == created.output)
  }
}
