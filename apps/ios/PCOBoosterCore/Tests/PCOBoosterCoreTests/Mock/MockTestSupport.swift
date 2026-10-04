import Foundation
import PCOBoosterCore
import Testing

@testable import PCOBoosterMock

/// One mock call: the HTTP status and the reply's `json` (or the whole body when it has none).
struct MockCall {
  let status: Int
  let body: MockJSON

  var output: MockJSON { body["json"] ?? body }
}

extension MockTransport {
  /// A transport with no latency whose clock reads `now` (the fixtures' own time by default).
  static func testing(now: Date = MockFixtures.anchorNow) -> MockTransport {
    MockTransport(latency: .zero, now: now)
  }

  func call(_ path: String, _ input: MockJSON = .object([:])) async throws -> MockCall {
    let body = try MockJSON.object(["json": input]).encoded()
    let response = try await send(RPCRequest(path: path, body: body))
    return MockCall(status: response.status, body: try MockJSON.parse(response.body))
  }
}

/// `catalog.organization`'s zone, for reading served dates the way the app must.
let orgCalendar: Calendar = {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = MockFixtures.timeZone
  return calendar
}()

func date(_ value: MockJSON?) throws -> Date {
  try #require(value?.string.flatMap(JSONCoding.parseISODate))
}
