import Foundation

/// Scheduling writes and the reads that follow the lineup: team positions keep the truth, and
/// position candidates take their slots and "also on" labels from them, so Lineup and Assign
/// agree after any write.
extension MockStore {
  // MARK: Team positions

  func groups(for planId: String) -> [MockJSON] {
    teamPositions[planId]
      ?? (try? fixtureOutput("catalog/teamPositions", for: .object(["planId": .string(planId)])))?
      .array
      ?? []
  }

  /// Runs `change` on every position of a plan, then stores the plan's groups in the overlay.
  private func updatePositions(
    planId: String, _ change: (_ group: MockJSON, _ position: inout MockJSON) -> Void
  ) {
    var groups = groups(for: planId)
    for groupIndex in groups.indices {
      guard var positions = groups[groupIndex]["positions"]?.array else { continue }
      for positionIndex in positions.indices {
        change(groups[groupIndex], &positions[positionIndex])
      }
      groups[groupIndex]["positions"] = .array(positions)
    }
    teamPositions[planId] = groups
  }

  /// Runs `change` on one scheduled person, wherever they sit on the plan.
  func updateFilledPerson(
    planId: String, planPersonId: String, _ change: (inout MockJSON) -> Void
  ) {
    updatePositions(planId: planId) { _, position in
      guard var people = position["filledPeople"]?.array,
        let index = people.firstIndex(where: { $0["planPersonId"]?.string == planPersonId })
      else { return }
      change(&people[index])
      position["filledPeople"] = .array(people)
    }
  }

  func updateFilledPeople(planId: String, _ change: (inout MockJSON) -> Void) {
    updatePositions(planId: planId) { _, position in
      guard var people = position["filledPeople"]?.array else { return }
      for index in people.indices {
        change(&people[index])
      }
      position["filledPeople"] = .array(people)
    }
  }

  // MARK: Scheduling

  func assign(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let personId = try input.requiredString("personId")
    let teamId = try input.requiredString("teamId")
    let positionId = try input.requiredString("positionId")
    var groups = groups(for: planId)
    let groupIndex: Int
    if let existing = groups.firstIndex(where: { $0["teamId"]?.string == teamId }) {
      groupIndex = existing
    } else {
      groups.append(
        .object([
          "teamId": .string(teamId),
          "teamName": input["teamName"] ?? .string("Team"),
          "positions": .array([]),
        ]))
      groupIndex = groups.count - 1
    }
    var positions = groups[groupIndex]["positions"]?.array ?? []
    let positionIndex: Int
    if let existing = positions.firstIndex(where: { $0["id"]?.string == positionId }) {
      positionIndex = existing
    } else {
      // A custom position: Planning Center creates it with the plan person.
      positions.append(
        .object([
          "id": .string(positionId),
          "name": input["positionName"] ?? .string("Position"),
          "teamId": .string(teamId),
          "teamName": groups[groupIndex]["teamName"] ?? .string("Team"),
          "source": .string("plan_member"),
          "neededCount": .int(0),
        ]))
      positionIndex = positions.count - 1
    }
    var position = positions[positionIndex]
    let filled = position["filledPeople"]?.array ?? []
    if filled.contains(where: { $0["personId"]?.string == personId }) {
      throw MockFailure.alreadyScheduled()
    }
    let planPersonId = makeId(planId)
    let teamTimes = times(for: planId).filter { time in
      time["assignedTeamIds"]?.array?.contains(.string(teamId)) ?? false
    }
    let timeIds = teamTimes.compactMap { $0["id"] }
    let serviceTimeIds = teamTimes.filter { $0["timeType"]?.string == "service" }
      .compactMap { $0["id"] }
    let person = MockJSON.object([
      "id": .string(personId),
      "planPersonId": .string(planPersonId),
      "personId": .string(personId),
      "name": .string(personName(personId)),
      "status": .string("pending"),
      "rawStatus": .string("U"),
      "photoThumbnailUrl": .null,
      "assignedTimeIds": .array(timeIds),
      "serviceTimeIds": .array(serviceTimeIds),
      // Planning Center prepares the scheduling email; the scheduler sends it there.
      "notification": .object([
        "prepared": .bool(true), "sentAt": .null, "senderName": .null,
      ]),
    ])
    position["filledPeople"] = .array(filled + [person])
    position["neededCount"] = .int(max(0, (position["neededCount"]?.int ?? 0) - 1))
    positions[positionIndex] = position.recountingFilledPeople()
    groups[groupIndex]["positions"] = .array(positions)
    teamPositions[planId] = groups
    return .object(["success": .bool(true), "data": .object(["id": .string(planPersonId)])])
  }

  func updateStatus(_ input: MockJSON) throws -> MockJSON {
    let planPersonId = try input.requiredString("planPersonId")
    let status = try input.requiredString("status")
    guard let planId = input["planId"]?.string ?? planId(scheduling: planPersonId) else {
      return .object(["success": .bool(true)])
    }
    if status == "D" {
      declineFilledPerson(planId: planId, planPersonId: planPersonId)
    } else if !setFilledStatus(planId: planId, planPersonId: planPersonId, status: status) {
      restoreDeclined(planId: planId, planPersonId: planPersonId, status: status)
    }
    return .object(["success": .bool(true)])
  }

  func unschedule(_ input: MockJSON) throws -> MockJSON {
    let planPersonId = try input.requiredString("planPersonId")
    removedPlanPersonIds.insert(planPersonId)
    declinedSlots[planPersonId] = nil
    if let planId = input["planId"]?.string ?? planId(scheduling: planPersonId) {
      updatePositions(planId: planId) { _, position in
        guard let people = position["filledPeople"]?.array,
          people.contains(where: { $0["planPersonId"]?.string == planPersonId })
        else { return }
        position["filledPeople"] = .array(
          people.filter { $0["planPersonId"]?.string != planPersonId })
        position = position.recountingFilledPeople()
      }
    }
    return .object(["success": .bool(true)])
  }

  func adjustNeededPositions(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let teamId = try input.requiredString("teamId")
    let positionName = try input.requiredString("positionName")
      .trimmingCharacters(in: .whitespaces)
    let step = try input.requiredString("change") == "add" ? 1 : -1
    var openCount = 0
    updatePositions(planId: planId) { group, position in
      guard group["teamId"]?.string == teamId, position["name"]?.string == positionName else {
        return
      }
      let current = position["neededCount"]?.int ?? 0
      // Only an existing open-slot record changes; without one the count stays.
      openCount = position["neededPositionId"]?.isPresent == true ? max(0, current + step) : current
      position["neededCount"] = .int(openCount)
    }
    return .object(["openCount": .int(openCount)])
  }

  private func setFilledStatus(planId: String, planPersonId: String, status: String) -> Bool {
    var found = false
    updatePositions(planId: planId) { _, position in
      guard var people = position["filledPeople"]?.array,
        let index = people.firstIndex(where: { $0["planPersonId"]?.string == planPersonId })
      else { return }
      found = true
      people[index]["status"] = .string(status == "C" ? "confirmed" : "pending")
      people[index]["rawStatus"] = .string(status)
      position["filledPeople"] = .array(people)
      position = position.recountingFilledPeople()
    }
    return found
  }

  /// A declined person leaves the position's people; their slot stays declined for Assign.
  private func declineFilledPerson(planId: String, planPersonId: String) {
    updatePositions(planId: planId) { _, position in
      guard let people = position["filledPeople"]?.array,
        let person = people.first(where: { $0["planPersonId"]?.string == planPersonId })
      else { return }
      declinedSlots[planPersonId] = MockDeclinedSlot(
        planId: planId,
        positionId: position["id"]?.string ?? "",
        personId: person["personId"]?.string ?? "")
      position["filledPeople"] = .array(
        people.filter { $0["planPersonId"]?.string != planPersonId })
      position = position.recountingFilledPeople()
    }
  }

  /// Puts a declined person back on their position as confirmed or pending.
  private func restoreDeclined(planId: String, planPersonId: String, status: String) {
    guard let slot = declinedSlots[planPersonId] ?? fixtureDeclinedSlot(planId, planPersonId)
    else { return }
    declinedSlots[planPersonId] = nil
    removedPlanPersonIds.insert(planPersonId)
    let serviceTimeIds = times(for: planId).filter { $0["timeType"]?.string == "service" }
      .compactMap { $0["id"] }
    updatePositions(planId: planId) { _, position in
      guard position["id"]?.string == slot.positionId else { return }
      let person = MockJSON.object([
        "id": .string(slot.personId),
        "planPersonId": .string(planPersonId),
        "personId": .string(slot.personId),
        "name": .string(personName(slot.personId)),
        "status": .string(status == "C" ? "confirmed" : "pending"),
        "rawStatus": .string(status),
        "photoThumbnailUrl": .null,
        "assignedTimeIds": .array(serviceTimeIds),
        "serviceTimeIds": .array(serviceTimeIds),
        "notification": .object([
          "prepared": .bool(false), "sentAt": .null, "senderName": .null,
        ]),
      ])
      position["filledPeople"] = .array((position["filledPeople"]?.array ?? []) + [person])
      position = position.recountingFilledPeople()
    }
  }

  /// A slot the fixtures declined: the candidates case whose slot has this plan person.
  private func fixtureDeclinedSlot(_ planId: String, _ planPersonId: String) -> MockDeclinedSlot? {
    guard let file = try? fixture("people/positionCandidates") else { return nil }
    for entry in file.cases where entry.match["planId"]?.string == planId {
      guard let positionId = entry.match["positionId"]?.string else { continue }
      for candidate in entry.output["candidates"]?.array ?? []
      where candidate["selectedPlanSlot"]?["planPersonId"]?.string == planPersonId {
        return MockDeclinedSlot(
          planId: planId, positionId: positionId, personId: candidate["id"]?.string ?? "")
      }
    }
    return nil
  }

  /// The plan a plan person is on, when the input leaves the plan out (the client sends it):
  /// plan person ids start with their plan's 9-digit id in the fixtures and in the mock.
  private func planId(scheduling planPersonId: String) -> String? {
    if let slot = declinedSlots[planPersonId] {
      return slot.planId
    }
    if let known = teamPositions.keys.first(where: { planPersonId.hasPrefix($0) }) {
      return known
    }
    let prefix = String(planPersonId.prefix(9))
    return groups(for: prefix).isEmpty ? nil : prefix
  }

  /// A name from the people directory (`people/search`), for people the mock schedules.
  func personName(_ personId: String) -> String {
    let directory = (try? fixture("people/search"))?.defaultOutput.array ?? []
    return directory.first { $0["id"]?.string == personId }?["fullName"]?.string ?? "Someone"
  }

  // MARK: Candidates

  /// The fixture's candidates, with slots and "also on" labels taken from the plan's lineup.
  func positionCandidates(_ input: MockJSON) throws -> MockJSON {
    let planId = try input.requiredString("planId")
    let positionId = try input.requiredString("positionId")
    var output = try fixtureOutput("people/positionCandidates", for: input)
    let groups = groups(for: planId)
    let group = groups.first { group in
      group["positions"]?.array?.contains { $0["id"]?.string == positionId } ?? false
    }
    let position = group?["positions"]?.array?.first { $0["id"]?.string == positionId }
    let filled = position?["filledPeople"]?.array ?? []

    var candidates = output["candidates"]?.array ?? []
    for index in candidates.indices {
      let personId = candidates[index]["id"]?.string ?? ""
      candidates[index]["selectedPlanRosterLabels"] = .array(
        rosterLabels(personId: personId, in: groups))
      candidates[index]["selectedPlanSlot"] = slot(
        personId: personId, planId: planId, positionId: positionId, filled: filled,
        fixtureSlot: candidates[index]["selectedPlanSlot"])
    }
    let listed = Set(candidates.compactMap { $0["id"]?.string })
    for person in filled {
      guard let personId = person["personId"]?.string, !listed.contains(personId) else {
        continue
      }
      let fullName = person["name"]?.string ?? ""
      let names = fullName.split(separator: " ", maxSplits: 1).map(String.init)
      candidates.append(
        .object([
          "id": .string(personId),
          "firstName": .string(names.first ?? ""),
          "lastName": .string(names.count > 1 ? names[1] : ""),
          "fullName": .string(fullName),
          "photoUrl": .null,
          "photoThumbnailUrl": person["photoThumbnailUrl"] ?? .null,
          "archived": .bool(false),
          "selectedPlanRosterLabels": .array(rosterLabels(personId: personId, in: groups)),
          "selectedPlanSlot": slot(
            personId: personId, planId: planId, positionId: positionId, filled: filled,
            fixtureSlot: nil),
          "schedulingPreferences": .null,
        ]))
    }
    output["candidates"] = .array(candidates)
    var match = output["match"] ?? .object([:])
    match["planId"] = .string(planId)
    if let group, let position {
      match["teamId"] = group["teamId"]
      match["selectedPositionName"] = position["name"]
      match["selectedTeamName"] = group["teamName"]
    }
    output["match"] = match
    return output
  }

  /// "Team - Position" for each of the person's places on the plan.
  private func rosterLabels(personId: String, in groups: [MockJSON]) -> [MockJSON] {
    groups.flatMap { group in
      (group["positions"]?.array ?? []).flatMap { position in
        (position["filledPeople"]?.array ?? [])
          .filter { $0["personId"]?.string == personId }
          .map { _ in
            .string(
              "\(group["teamName"]?.string ?? "") - \(position["name"]?.string ?? "")")
          }
      }
    }
  }

  private func slot(
    personId: String, planId: String, positionId: String, filled: [MockJSON],
    fixtureSlot: MockJSON?
  ) -> MockJSON {
    if let person = filled.first(where: { $0["personId"]?.string == personId }) {
      return .object([
        "planPersonId": person["planPersonId"] ?? .null,
        "status": person["status"] ?? .string("pending"),
        "declineReason": .null,
      ])
    }
    let declined = MockDeclinedSlot(planId: planId, positionId: positionId, personId: personId)
    if let entry = declinedSlots.first(where: { $0.value == declined }) {
      return .object([
        "planPersonId": .string(entry.key), "status": .string("declined"),
        "declineReason": .null,
      ])
    }
    if let fixtureSlot, fixtureSlot["status"]?.string == "declined",
      let planPersonId = fixtureSlot["planPersonId"]?.string,
      !removedPlanPersonIds.contains(planPersonId)
    {
      return fixtureSlot
    }
    return .null
  }
}

extension MockJSON {
  /// The position with its people sorted as the API sorts them (confirmed first, then by
  /// name) and the counts the API sets only when someone fills the position.
  func recountingFilledPeople() -> MockJSON {
    var position = self
    let people = (self["filledPeople"]?.array ?? []).sorted { first, second in
      let firstConfirmed = first["status"]?.string == "confirmed"
      let secondConfirmed = second["status"]?.string == "confirmed"
      if firstConfirmed != secondConfirmed {
        return firstConfirmed
      }
      return (first["name"]?.string ?? "")
        .localizedStandardCompare(second["name"]?.string ?? "") == .orderedAscending
    }
    let confirmed = people.filter { $0["status"]?.string == "confirmed" }.count
    let pending = people.count - confirmed
    position["filledPeople"] = people.isEmpty ? nil : .array(people)
    position["filledConfirmedCount"] = confirmed > 0 ? .int(confirmed) : nil
    position["filledPendingCount"] = pending > 0 ? .int(pending) : nil
    return position
  }
}
