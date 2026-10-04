import Foundation
import PCOBoosterCore

/// Run sheet and plan time writes, kept in the overlay so a refetch shows them.
extension MockStore {
  // MARK: Plan items

  func items(for planId: String) -> [MockJSON] {
    planItems[planId]
      ?? (try? fixtureOutput("planItems/list", for: .object(["planId": .string(planId)])))?.array
      ?? []
  }

  func createPlanItem(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    var items = items(for: planId)
    let sequence = (items.compactMap { $0["sequence"]?.int }.max() ?? 0) + 1
    var item = MockJSON.object([
      "song": .null,
      "arrangement": .null,
      "id": .string(makeId(planId)),
      "title": .string(""),
      "itemType": input["itemType"] ?? .string("item"),
      "sequence": .int(sequence),
      "servicePosition": input["servicePosition"] ?? .string("during"),
      "length": input["length"] ?? .null,
      "description": input["description"] ?? .string(""),
      "htmlDetails": input["htmlDetails"] ?? .string(""),
      "customArrangementSequence": input["customArrangementSequence"] ?? .array([]),
      "key": .null,
      "layout": .null,
    ])
    if let songId = input["songId"]?.string {
      item["itemType"] = .string("song")
      try applySong(songId, from: input, to: &item)
      if !input.has("length") {
        item["length"] = item["arrangement"]?["length"] ?? .null
      }
    }
    item["title"] = input["title"] ?? item["song"]?["title"] ?? .string("")
    items.append(item)
    planItems[planId] = items
    return item
  }

  func updatePlanItem(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let itemId = try input.requiredString("itemId")
    var items = items(for: planId)
    guard let index = items.firstIndex(where: { $0["id"]?.string == itemId }) else {
      throw MockFailure.notFound("Plan item not found", resource: "planItem")
    }
    var item = items[index]
    for key in [
      "title", "servicePosition", "length", "description", "htmlDetails",
      "customArrangementSequence",
    ] where input.has(key) {
      item[key] = input[key]
    }
    if input.has("songId") {
      if let songId = input["songId"]?.string {
        try applySong(songId, from: input, to: &item)
      } else {
        for key in ["song", "arrangement", "key", "layout"] {
          item[key] = .null
        }
      }
    } else if let songId = item["song"]?["id"]?.string {
      try applySong(songId, from: input, to: &item)
    }
    items[index] = item
    planItems[planId] = items
    return item
  }

  func deletePlanItem(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let itemId = try input.requiredString("itemId")
    planItems[planId] = items(for: planId).filter { $0["id"]?.string != itemId }
    return .object(["success": .bool(true)])
  }

  func reorderPlanItems(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let order = (input["sequence"]?.array ?? []).compactMap(\.string)
    let items = items(for: planId)
    let listed = order.compactMap { id in items.first { $0["id"]?.string == id } }
    let rest = items.filter { item in !order.contains(item["id"]?.string ?? "") }
    planItems[planId] = (listed + rest).enumerated().map { offset, item in
      var item = item
      item["sequence"] = .int(offset + 1)
      return item
    }
    return .object(["success": .bool(true)])
  }

  /// Sets the item's song, and the arrangement, key, and layout the input names, from the
  /// song's options; a field the input leaves out keeps its value unless the song changed.
  private func applySong(_ songId: String, from input: MockJSON, to item: inout MockJSON) throws {
    let options = try songOptions(.object(["songId": .string(songId)]))
    let songChanged = item["song"]?["id"]?.string != songId
    if songChanged, let song = options["song"] {
      item["song"] = .object([
        "lastScheduledAt": song["lastScheduledAt"] ?? .null,
        "id": song["id"] ?? .string(songId),
        "title": song["title"] ?? .string(""),
        "author": song["author"] ?? .string(""),
        "themes": song["themes"] ?? .string(""),
      ])
      for key in ["arrangement", "key", "layout"] {
        item[key] = .null
      }
    }
    let arrangements = options["arrangements"]?.array ?? []
    if input.has("arrangementId") {
      let arrangement = arrangements.first { $0["id"] == input["arrangementId"] }
      item["arrangement"] = arrangement.map(arrangementSummary) ?? .null
    }
    if input.has("keyId") {
      let arrangementId = item["arrangement"]?["id"]
      let keys = arrangements.filter { arrangementId == nil || $0["id"] == arrangementId }
        .flatMap { $0["keys"]?.array ?? [] }
      item["key"] = keys.first { $0["id"] == input["keyId"] } ?? .null
    }
    if input.has("selectedLayoutId") {
      let layouts = options["layouts"]?.array ?? []
      item["layout"] = layouts.first { $0["id"] == input["selectedLayoutId"] } ?? .null
    }
  }

  private func arrangementSummary(_ option: MockJSON) -> MockJSON {
    .object([
      "archivedAt": option["archived"]?.bool == true ? .string(now()) : .null,
      "id": option["id"] ?? .null,
      "sequence": option["sequence"] ?? .array([]),
      "length": option["length"] ?? .null,
      "name": option["name"] ?? .string(""),
    ])
  }

  // MARK: Plan times

  func times(for planId: String) -> [MockJSON] {
    planTimes[planId]
      ?? (try? fixtureOutput("planTimes/list", for: .object(["planId": .string(planId)])))?.array
      ?? []
  }

  func createPlanTime(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let time = MockJSON.object([
      "startsAt": .string(try isoInstant(input.requiredString("startsAt"))),
      "endsAt": try input["endsAt"]?.string.map { .string(try isoInstant($0)) } ?? .null,
      "id": .string(makeId(planId)),
      "name": input["name"] ?? .string(""),
      "timeType": try input.requiredValue("timeType"),
      "teamReminders": .array([]),
      "assignedTeamIds": input["assignedTeamIds"] ?? .array([]),
      "assignedPositionIds": input["assignedPositionIds"] ?? .array([]),
      "splitTeamRehearsalAssignmentIds": .array([]),
    ])
    planTimes[planId] = sortedByStart(times(for: planId) + [time])
    return time
  }

  func updatePlanTime(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let timeId = try input.requiredString("planTimeId")
    var times = times(for: planId)
    guard let index = times.firstIndex(where: { $0["id"]?.string == timeId }) else {
      throw MockFailure.notFound("Plan time not found", resource: "planTime")
    }
    var time = times[index]
    for key in ["name", "timeType", "assignedTeamIds", "assignedPositionIds"] where input.has(key) {
      time[key] = input[key]
    }
    if let startsAt = input["startsAt"]?.string {
      time["startsAt"] = .string(try isoInstant(startsAt))
    }
    if input.has("endsAt") {
      time["endsAt"] = try input["endsAt"]?.string.map { .string(try isoInstant($0)) } ?? .null
    }
    times[index] = time
    planTimes[planId] = sortedByStart(times)
    let isService = time["timeType"]?.string == "service"
    for planPersonId in (input["assignedPlanPersonIds"]?.array ?? []).compactMap(\.string) {
      updateFilledPerson(planId: planId, planPersonId: planPersonId) { person in
        person.addTime(timeId, isService: isService)
      }
    }
    for planPersonId in (input["clearedPlanPersonIds"]?.array ?? []).compactMap(\.string) {
      updateFilledPerson(planId: planId, planPersonId: planPersonId) { person in
        person.removeTime(timeId)
      }
    }
    return time
  }

  func deletePlanTime(_ input: MockJSON) throws -> MockReply {
    let planId = try input.requiredString("planId")
    let timeId = try input.requiredString("planTimeId")
    planTimes[planId] = times(for: planId).filter { $0["id"]?.string != timeId }
    updateFilledPeople(planId: planId) { person in person.removeTime(timeId) }
    return .void
  }

  func updatePlanPersonTimes(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let planPersonId = try input.requiredString("planPersonId")
    let timeIds = (input["planTimeIds"]?.array ?? []).compactMap(\.string)
    let serviceTimeIds = Set(
      times(for: planId).filter { $0["timeType"]?.string == "service" }
        .compactMap { $0["id"]?.string })
    updateFilledPerson(planId: planId, planPersonId: planPersonId) { person in
      person["assignedTimeIds"] = .array(timeIds.map(MockJSON.string))
      person["serviceTimeIds"] = .array(
        timeIds.filter(serviceTimeIds.contains).map(MockJSON.string))
    }
    return .object(["ok": .bool(true)])
  }

  /// `planTimes` inputs are UTC date-times; the API echoes them as `toISOString()`.
  private func isoInstant(_ text: String) throws -> String {
    guard let date = JSONCoding.parseISODate(text) else {
      throw MockFailure.badRequest("Invalid ISO datetime")
    }
    return JSONCoding.isoString(date)
  }

  private func sortedByStart(_ times: [MockJSON]) -> [MockJSON] {
    times.sorted { ($0["startsAt"]?.string ?? "") < ($1["startsAt"]?.string ?? "") }
  }
}

extension MockJSON {
  mutating func addTime(_ timeId: String, isService: Bool) {
    for key in isService ? ["assignedTimeIds", "serviceTimeIds"] : ["assignedTimeIds"] {
      var ids = self[key]?.array ?? []
      if !ids.contains(.string(timeId)) {
        ids.append(.string(timeId))
      }
      self[key] = .array(ids)
    }
  }

  mutating func removeTime(_ timeId: String) {
    for key in ["assignedTimeIds", "serviceTimeIds"] {
      if let ids = self[key]?.array {
        self[key] = .array(ids.filter { $0 != .string(timeId) })
      }
    }
  }
}
