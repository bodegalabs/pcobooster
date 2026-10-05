import Foundation
import PCOBoosterCore

/// The mock API: shifted fixtures, the procedures refined from them, and the overlay the main
/// writes leave behind. One actor, so overlay reads and writes never interleave, and fixture
/// parsing stays off the main actor.
actor MockStore {
  let calendar: MockCalendar
  /// The time writes are stamped with (`updatedAt`, new songs).
  let clock: @Sendable () -> Date

  private var fixtures: [String: MockFixtureFile] = [:]
  private var missingFixtures: Set<String> = []
  private var nextNumber = 1

  // The overlay. Each plan or song is copied from its fixture on its first write, and reads
  // prefer the copy from then on.

  /// Run sheets by plan id.
  var planItems: [String: [MockJSON]] = [:]
  /// Plan times by plan id.
  var planTimes: [String: [MockJSON]] = [:]
  /// Team position groups by plan id.
  var teamPositions: [String: [MockJSON]] = [:]
  /// Slots declined through `schedule/updateStatus`, by plan person id.
  var declinedSlots: [String: MockDeclinedSlot] = [:]
  /// Plan people unscheduled through `schedule/remove`; their fixture slots no longer count.
  var removedPlanPersonIds: Set<String> = []
  /// `chordCharts/song` outputs by song id.
  var chordChartSongs: [String: MockJSON] = [:]
  /// Songs added through `chordCharts/createSong`, as catalog entries.
  var createdSongs: [MockJSON] = []
  var feedbackCount = 0

  init(calendar: MockCalendar, clock: @escaping @Sendable () -> Date) {
    self.calendar = calendar
    self.clock = clock
  }

  func reply(to path: String, input: MockJSON) -> MockReply {
    do {
      return try route(path, input: input)
    } catch let failure as MockFailure {
      return .failure(failure)
    } catch {
      return .failure(.internalError(String(describing: error)))
    }
  }

  private func route(_ path: String, input: MockJSON) throws -> MockReply {
    switch path {
    case "catalog/teamPositions": .output(.array(groups(for: try input.requiredString("planId"))))
    case "planItems/list": .output(.array(items(for: try input.requiredString("planId"))))
    case "planItems/create": .output(try createPlanItem(input))
    case "planItems/update": .output(try updatePlanItem(input))
    case "planItems/delete": .output(try deletePlanItem(input))
    case "planItems/reorder": .output(try reorderPlanItems(input))
    case "planTimes/list": .output(.array(times(for: try input.requiredString("planId"))))
    case "planTimes/create": .output(try createPlanTime(input))
    case "planTimes/update": .output(try updatePlanTime(input))
    case "planTimes/delete": try deletePlanTime(input)
    case "planPeople/updateTimes": .output(try updatePlanPersonTimes(input))
    case "schedule/assign": .output(try assign(input))
    case "schedule/updateStatus": .output(try updateStatus(input))
    case "schedule/remove": .output(try unschedule(input))
    case "neededPositions/adjust": .output(try adjustNeededPositions(input))
    case "people/positionCandidates": .output(try positionCandidates(input))
    case "people/candidateDetails": .output(try candidateDetails(input))
    case "people/search": .output(try searchPeople(input))
    case "people/dashboardRoster": .output(try dashboardRoster(input))
    case "people/dashboardActivity": .output(try dashboardActivity(input))
    case "people/dashboardPerson": .output(try dashboardPerson(input))
    case "songs/search": .output(try searchSongs(input))
    case "songs/library": .output(try songLibrary(input))
    case "songs/options": .output(try songOptions(input))
    case "chordCharts/song": .output(try chordChartSong(try input.requiredString("songId")))
    case "chordCharts/update": .output(try updateChordChart(input))
    case "chordCharts/create": .output(try createChordChart(input))
    case "chordCharts/createSong": .output(try createSong(input))
    case "accounts/select":
      .output(
        .object(["success": .bool(true), "selectedAccountId": try input.requiredValue("accountId")]))
    case "feedback/submit": .output(submitFeedback())
    default: .output(try fixtureOutput(path, for: input))
    }
  }

  // MARK: Fixtures

  /// The procedure's fixture with its dates shifted, parsed once.
  func fixture(_ path: String) throws -> MockFixtureFile {
    if let cached = fixtures[path] {
      return cached
    }
    guard !missingFixtures.contains(path), let file = try MockFixtures.load(path) else {
      missingFixtures.insert(path)
      throw MockFailure.noFixture(path)
    }
    let shifted = file.shifted(by: calendar)
    fixtures[path] = shifted
    return shifted
  }

  func fixtureOutput(_ path: String, for input: MockJSON) throws -> MockJSON {
    try fixture(path).output(for: input)
  }

  /// Ids for created records: numeric, like Planning Center's, and unique for the store.
  func makeId(_ prefix: String) -> String {
    defer { nextNumber += 1 }
    return "\(prefix)\(String(format: "%05d", nextNumber))"
  }

  func now() -> String {
    JSONCoding.isoString(clock())
  }

  private func submitFeedback() -> MockJSON {
    feedbackCount += 1
    return .object(["id": .int(feedbackCount)])
  }
}

/// A slot declined in the mock session, which team positions no longer list.
struct MockDeclinedSlot: Sendable, Equatable {
  let planId: String
  let positionId: String
  let personId: String
}

extension MockJSON {
  /// An input field the contract requires, or a 400 like the API's input validation.
  func requiredValue(_ key: String) throws -> MockJSON {
    guard let value = self[key], value.isPresent else {
      throw MockFailure.badRequest("Missing \(key)")
    }
    return value
  }

  func requiredString(_ key: String) throws -> String {
    guard let value = self[key]?.string, !value.isEmpty else {
      throw MockFailure.badRequest("Missing \(key)")
    }
    return value
  }

  /// Whether the input names the key at all, `null` included (`null` clears a field).
  func has(_ key: String) -> Bool {
    self[key] != nil
  }
}
