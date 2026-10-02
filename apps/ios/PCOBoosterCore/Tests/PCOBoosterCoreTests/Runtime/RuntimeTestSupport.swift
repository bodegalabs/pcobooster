import Foundation
import PCOBoosterCore
import Synchronization
import Testing

/// An `RPCTransport` and `HTTPTransport` that records requests and answers from a handler.
final class StubTransport: RPCTransport, HTTPTransport {
  typealias RPCHandler = @Sendable (RPCRequest) async throws -> RPCResponse
  typealias HTTPHandler = @Sendable (HTTPRequest) async throws -> HTTPResponse

  private struct State {
    var requests: [RPCRequest] = []
    var httpRequests: [HTTPRequest] = []
  }

  private let state = Mutex(State())
  private let rpcHandler: RPCHandler
  private let httpHandler: HTTPHandler

  init(
    rpc: @escaping RPCHandler = { _ in .ok("null") },
    http: @escaping HTTPHandler = { _ in HTTPResponse(status: 200, body: Data("{}".utf8)) }
  ) {
    rpcHandler = rpc
    httpHandler = http
  }

  func send(_ request: RPCRequest) async throws -> RPCResponse {
    state.withLock { $0.requests.append(request) }
    return try await rpcHandler(request)
  }

  func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    state.withLock { $0.httpRequests.append(request) }
    return try await httpHandler(request)
  }

  var requests: [RPCRequest] { state.withLock { $0.requests } }
  var httpRequests: [HTTPRequest] { state.withLock { $0.httpRequests } }

  func requests(to path: String) -> [RPCRequest] {
    requests.filter { $0.path == path }
  }
}

extension RPCResponse {
  /// A success with `json` (raw JSON text) as the output.
  static func ok(_ json: String, headers: [String: String] = [:]) -> RPCResponse {
    RPCResponse(status: 200, body: Data(#"{"json":\#(json),"meta":[]}"#.utf8), headers: headers)
  }

  /// An encoded success.
  static func ok<Output: Encodable>(encoding output: Output) throws -> RPCResponse {
    let json = try JSONCoding.makeEncoder().encode(output)
    return .ok(String(decoding: json, as: UTF8.self))
  }

  /// An oRPC error envelope.
  static func orpcError(
    status: Int, code: String, message: String, data: String? = nil, defined: Bool = true
  ) -> RPCResponse {
    let dataPart = data.map { #","data":\#($0)"# } ?? ""
    let body =
      #"{"json":{"defined":\#(defined),"code":"\#(code)","status":\#(status),"message":"\#(message)"\#(dataPart)}}"#
    return RPCResponse(status: status, body: Data(body.utf8))
  }
}

/// Holds work until opened.
final class Gate: Sendable {
  private struct State {
    var isOpen = false
    var waiters: [CheckedContinuation<Void, Never>] = []
  }

  private let state = Mutex(State())

  func wait() async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      let resumeNow = state.withLock { state -> Bool in
        if state.isOpen { return true }
        state.waiters.append(continuation)
        return false
      }
      if resumeNow { continuation.resume() }
    }
  }

  func open() {
    let waiters = state.withLock { state -> [CheckedContinuation<Void, Never>] in
      state.isOpen = true
      defer { state.waiters = [] }
      return state.waiters
    }
    for waiter in waiters { waiter.resume() }
  }
}

/// A thread-safe counter and log.
final class Recorder<Value: Sendable>: Sendable {
  private let storage = Mutex<[Value]>([])

  func append(_ value: Value) {
    storage.withLock { $0.append(value) }
  }

  var values: [Value] { storage.withLock { $0 } }
  var count: Int { storage.withLock { $0.count } }
}

/// A clock that moves only when told, with a wall-clock `date` that moves with it.
final class TestClock: Clock {
  struct Instant: InstantProtocol {
    var offset: Swift.Duration

    func advanced(by duration: Swift.Duration) -> Instant {
      Instant(offset: offset + duration)
    }

    func duration(to other: Instant) -> Swift.Duration {
      other.offset - offset
    }

    static func < (lhs: Instant, rhs: Instant) -> Bool {
      lhs.offset < rhs.offset
    }
  }

  private struct Sleeper {
    let id: UInt64
    let deadline: Instant
    let continuation: CheckedContinuation<Void, any Error>
  }

  private struct State {
    var now = Instant(offset: .zero)
    var sleepers: [Sleeper] = []
    var nextID: UInt64 = 0
    var cancelled: Set<UInt64> = []
  }

  private let state = Mutex(State())
  let start: Date

  init(start: Date = Date(timeIntervalSince1970: 1_790_000_000)) {
    self.start = start
  }

  var now: Instant { state.withLock { $0.now } }
  var minimumResolution: Swift.Duration { .zero }

  /// The wall-clock time matching `now`.
  var date: Date {
    let (seconds, attoseconds) = now.offset.components
    return start.addingTimeInterval(TimeInterval(seconds) + TimeInterval(attoseconds) / 1e18)
  }

  /// A `now` closure for `QueryClient`.
  var dateProvider: @Sendable () -> Date {
    { [self] in date }
  }

  var sleeperCount: Int { state.withLock { $0.sleepers.count } }

  func sleep(until deadline: Instant, tolerance: Swift.Duration?) async throws {
    let id = state.withLock { state -> UInt64 in
      state.nextID += 1
      return state.nextID
    }
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
        let immediate = state.withLock { state -> Result<Void, any Error>? in
          if state.cancelled.contains(id) { return .failure(CancellationError()) }
          if deadline <= state.now { return .success(()) }
          state.sleepers.append(Sleeper(id: id, deadline: deadline, continuation: continuation))
          return nil
        }
        if let immediate { continuation.resume(with: immediate) }
      }
    } onCancel: {
      let sleeper = state.withLock { state -> Sleeper? in
        state.cancelled.insert(id)
        guard let index = state.sleepers.firstIndex(where: { $0.id == id }) else { return nil }
        return state.sleepers.remove(at: index)
      }
      sleeper?.continuation.resume(throwing: CancellationError())
    }
  }

  func advance(by duration: Swift.Duration) {
    let due = state.withLock { state -> [Sleeper] in
      state.now = state.now.advanced(by: duration)
      let now = state.now
      let due = state.sleepers.filter { $0.deadline <= now }
      state.sleepers.removeAll { $0.deadline <= now }
      return due
    }
    for sleeper in due { sleeper.continuation.resume() }
  }

  /// Waits (in real time) until `count` sleepers are registered.
  func waitForSleepers(_ count: Int = 1) async {
    await eventually("\(count) sleeper(s)") { self.sleeperCount >= count }
  }
}

/// Polls `condition` in real time until it holds, recording an issue after `timeout`. The
/// timeout is generous because CI runners run thousands of parity cases in parallel; a
/// passing condition returns as soon as it holds.
func eventually(
  _ description: String = "condition",
  timeout: Duration = .seconds(30),
  sourceLocation: SourceLocation = #_sourceLocation,
  _ condition: () async -> Bool
) async {
  let clock = ContinuousClock()
  let deadline = clock.now + timeout
  while clock.now < deadline {
    if await condition() { return }
    try? await Task.sleep(for: .milliseconds(2))
  }
  Issue.record("Timed out waiting for \(description)", sourceLocation: sourceLocation)
}

/// Parses a request body.
func json(_ data: Data) throws -> JSONValue {
  try JSONCoding.makeDecoder().decode(JSONValue.self, from: data)
}

let testClientInfo = ClientInfo(appVersion: "1.2.3", build: "45", platform: "iOS", osVersion: "26.0")
