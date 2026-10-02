import Foundation
import PCOBoosterCore
import Synchronization

/// An `RPCTransport` that answers from the bundled fictional fixtures, for previews, UI tests,
/// and App Store screenshots (`-PCOBMock YES`). Nothing leaves the device.
///
/// - Requests are oRPC RPC calls: `path` is `<namespace>/<procedure>` and the body is
///   `{"json": input}` (or `{}`). The reply is `{"json": output, "meta": []}` with status 200,
///   `{}` for `planTimes/delete`, or an oRPC error envelope (404 for a procedure with no
///   fixture, 400 for an unreadable body).
/// - A fixture's first case whose `match` is a JSON subset of the input answers, else its
///   default. A few reads are refined from their fixture so they behave like the API:
///   searches filter by the query, batched people reads return the requested people,
///   candidates follow the lineup, and the People month follows the calendar.
/// - Fixture dates move by whole weeks so ``MockFixtures/anchorSunday`` lands on the coming
///   Sunday (today, on a Sunday) in the org zone; set ``fixedNow`` for repeatable screenshots.
/// - The main writes (plan items, plan times, scheduling, open slots, chord charts) update an
///   in-memory overlay, so the screen still agrees with itself after the client's refetch.
public final class MockTransport: RPCTransport {
  /// Delay before every reply, so loading states show.
  public let latency: Duration
  /// Days added to every fixture date (a multiple of 7).
  public let dayShift: Int

  private let calendar: MockCalendar
  private let store: MockStore

  /// - Parameters:
  ///   - latency: Delay before every reply; `.zero` answers at once.
  ///   - now: The clock dates are shifted against. Defaults to ``fixedNow``, then the real
  ///     time; it is read once, so a transport keeps one calendar for its lifetime.
  public init(latency: Duration = .milliseconds(250), now: Date? = nil) {
    let pinned = now ?? Self.fixedNow
    let anchor = MockDay(key: MockFixtures.anchorSunday) ?? MockDay(year: 2026, month: 10, day: 4)
    let calendar = MockCalendar(
      now: pinned ?? Date(), anchorSunday: anchor, timeZone: MockFixtures.timeZone)
    self.latency = latency
    self.calendar = calendar
    dayShift = calendar.dayShift
    store = MockStore(calendar: calendar, clock: { @Sendable in pinned ?? Date() })
  }

  /// Freezes the mock clock for deterministic screenshots and UI tests: every transport created
  /// afterwards shifts dates against this instant and stamps writes with it. Set it before
  /// creating the transport. ``MockFixtures/anchorNow`` serves the fixtures unchanged.
  public static var fixedNow: Date? {
    get { fixedNowStorage.withLock { $0 } }
    set { fixedNowStorage.withLock { $0 = newValue } }
  }

  /// A fixture date as this transport serves it.
  public func shift(_ fixtureDate: Date) -> Date {
    calendar.shift(fixtureDate)
  }

  public func send(_ request: RPCRequest) async throws -> RPCResponse {
    if latency > .zero {
      try await Task.sleep(for: latency)
    }
    let path = Self.procedurePath(request.path)
    let reply: MockReply
    if let input = Self.input(from: request.body) {
      reply = await store.reply(to: path, input: input)
    } else {
      reply = .failure(.badRequest("Malformed request body"))
    }
    return try Self.response(for: reply)
  }

  /// Accepts `people/search`, `/people/search`, and `/api/rpc/people/search`.
  static func procedurePath(_ path: String) -> String {
    var trimmed = Substring(path)
    while trimmed.hasPrefix("/") {
      trimmed = trimmed.dropFirst()
    }
    if trimmed.hasPrefix("api/rpc/") {
      trimmed = trimmed.dropFirst("api/rpc/".count)
    }
    return String(trimmed)
  }

  /// The request's input: the body's `json`, or an empty object for `{}` and empty bodies.
  static func input(from body: Data) -> MockJSON? {
    if body.isEmpty {
      return .object([:])
    }
    guard let envelope = try? MockJSON.parse(body), envelope.object != nil else {
      return nil
    }
    return envelope["json"] ?? .object([:])
  }

  static func response(for reply: MockReply) throws -> RPCResponse {
    let headers = ["content-type": "application/json"]
    switch reply {
    case .output(let output):
      let body = MockJSON.object(["json": output, "meta": .array([])])
      return RPCResponse(status: 200, body: try body.encoded(), headers: headers)
    case .void:
      return RPCResponse(status: 200, body: Data("{}".utf8), headers: headers)
    case .failure(let failure):
      let body = MockJSON.object([
        "json": .object([
          "defined": .bool(failure.defined),
          "code": .string(failure.code),
          "status": .int(failure.status),
          "message": .string(failure.message),
          "data": failure.data,
        ])
      ])
      return RPCResponse(status: failure.status, body: try body.encoded(), headers: headers)
    }
  }
}

private let fixedNowStorage = Mutex<Date?>(nil)

/// What the store answers a call with, before it is wrapped in the RPC envelope.
enum MockReply: Sendable, Equatable {
  case output(MockJSON)
  /// A `z.void()` output: the API sends `{}`.
  case void
  case failure(MockFailure)
}

/// An oRPC error, as the API would send it.
struct MockFailure: Error, Sendable, Equatable {
  let status: Int
  let code: String
  let message: String
  let defined: Bool
  let data: MockJSON

  static func noFixture(_ path: String) -> MockFailure {
    MockFailure(
      status: 404, code: "NOT_FOUND", message: "Not Found", defined: false,
      data: .object(["message": .string("No mock fixture for \(path)")]))
  }

  static func notFound(_ message: String, resource: String) -> MockFailure {
    MockFailure(
      status: 404, code: "NOT_FOUND", message: "Not Found", defined: true,
      data: .object(["message": .string(message), "resource": .string(resource)]))
  }

  static func badRequest(_ message: String) -> MockFailure {
    MockFailure(
      status: 400, code: "BAD_REQUEST", message: "Bad Request", defined: true,
      data: .object(["message": .string(message)]))
  }

  static func conflict(_ message: String, reason: String) -> MockFailure {
    MockFailure(
      status: 409, code: "CONFLICT", message: "Conflict", defined: true,
      data: .object(["message": .string(message), "reason": .string(reason)]))
  }

  static func internalError(_ message: String) -> MockFailure {
    MockFailure(
      status: 500, code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error",
      defined: true, data: .object(["message": .string(message)]))
  }

  static func alreadyScheduled() -> MockFailure {
    MockFailure(
      status: 409, code: "ALREADY_SCHEDULED", message: "ALREADY_SCHEDULED", defined: true,
      data: .object(["message": .string("Already scheduled")]))
  }
}
