import Foundation
import os

/// Calls oRPC procedures by their generated descriptors:
///
/// ```swift
/// let plans = try await rpc.call(RPC.Catalog.plans, PlansInput(serviceTypeId: "1101"))
/// let access = try await rpc.call(RPC.Access.me)
/// ```
///
/// Every call is `POST <base>/api/rpc/<path>` with `{"json": input}` (or `{}` when the contract
/// has no input), authenticated from `SessionCredentials`, and routed through the
/// `RequestScheduler` lanes. Network work and JSON coding run off the main actor. Failures are
/// `APIError` (or `CancellationError`); an `UNAUTHORIZED` answer is reported to the session,
/// which asks the person to sign in again. Tracked writes report `workflow completed` and
/// `workflow failed`.
///
/// Screens normally read through `QueryClient`, which adds caching, de-duplication, and the
/// read retry; call the client directly for one-off work.
public struct RPCClient: Sendable {
  public let transport: any RPCTransport
  public let scheduler: RequestScheduler
  public let clientInfo: ClientInfo
  public let credentials: SessionCredentials
  private let analytics: any AnalyticsSink

  private static let logger = Logger(subsystem: "com.pcobooster.core", category: "rpc")

  public init(
    transport: any RPCTransport,
    scheduler: RequestScheduler = RequestScheduler(),
    clientInfo: ClientInfo = .current(),
    credentials: SessionCredentials = SessionCredentials(),
    analytics: any AnalyticsSink = NoAnalytics()
  ) {
    self.transport = transport
    self.scheduler = scheduler
    self.clientInfo = clientInfo
    self.credentials = credentials
    self.analytics = analytics
  }

  /// Calls `procedure` with `input`. `priority: .speculative` queues the call behind
  /// interactive work and sends the speculative header.
  @concurrent
  public func call<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    priority: RequestPriority = .interactive
  ) async throws -> Output {
    try await call(procedure, input, lane: RequestLane(priority))
  }

  /// Calls a procedure whose input is empty.
  @concurrent
  public func call<Output>(
    _ procedure: Procedure<EmptyInput, Output>,
    priority: RequestPriority = .interactive
  ) async throws -> Output {
    try await call(procedure, EmptyInput(), lane: RequestLane(priority))
  }

  /// Calls `procedure` in `lane`, whose priority may rise while the call waits.
  @concurrent
  public func call<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    lane: RequestLane
  ) async throws -> Output {
    try await exchange(procedure, input, lane: lane).output
  }

  /// Calls `procedure` and also returns the response headers (lowercased names), for the one
  /// procedure that answers through a header: `demo.start` sets `pcobooster-demo`.
  @concurrent
  public func callWithHeaders<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    priority: RequestPriority = .interactive
  ) async throws -> RPCResult<Output> {
    try await exchange(procedure, input, lane: RequestLane(priority))
  }

  // MARK: - Exchange

  @concurrent
  private func exchange<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    _ input: Input,
    lane: RequestLane
  ) async throws -> RPCResult<Output> {
    let body = try RPCWire.requestBody(input, hasInput: procedure.hasInput)
    let operation = WorkflowOperation(procedurePath: procedure.path)
    let start = ContinuousClock.now
    do {
      let result = try await scheduler.perform(lane) { priority in
        try await send(procedure, body: body, priority: priority)
      }
      if let operation {
        analytics.capture(.workflowCompleted(operation, duration: ContinuousClock.now - start))
      }
      return result
    } catch {
      if let operation, !error.isCancellation {
        analytics.capture(.workflowFailed(operation, errorCode: WorkflowErrorCode(error)))
      }
      throw error
    }
  }

  @concurrent
  private func send<Input, Output>(
    _ procedure: Procedure<Input, Output>,
    body: Data,
    priority: RequestPriority
  ) async throws -> RPCResult<Output> {
    let sent = credentials.current
    let requestID = UUID().uuidString.lowercased()
    let request = RPCRequest(
      path: procedure.path, body: body,
      headers: headers(credentials: sent, priority: priority, requestID: requestID))

    let response: RPCResponse
    do {
      response = try await transport.send(request)
    } catch {
      guard
        let failure = APIError.transportFailure(
          error, procedure: procedure.path, requestID: requestID)
      else {
        throw CancellationError()
      }
      Self.logger.info(
        "\(procedure.path, privacy: .public) failed: \(failure.kind.rawValue, privacy: .public) [\(requestID, privacy: .public)]"
      )
      throw failure
    }

    guard (200..<300).contains(response.status) else {
      let failure = RPCWire.error(
        status: response.status, body: response.body, procedure: procedure.path,
        requestID: requestID)
      Self.logger.info(
        "\(procedure.path, privacy: .public) answered \(response.status) \(failure.code?.rawValue ?? "-", privacy: .public) [\(requestID, privacy: .public)]"
      )
      if failure.isUnauthorized {
        credentials.reportUnauthorized(sent)
      }
      throw failure
    }

    do {
      let output = try RPCWire.decodeOutput(Output.self, from: response.body)
      return RPCResult(output: output, headers: response.headers)
    } catch {
      Self.logger.error(
        "\(procedure.path, privacy: .public) returned an undecodable body [\(requestID, privacy: .public)]: \(String(describing: error), privacy: .public)"
      )
      throw APIError(
        kind: .decoding, status: response.status, message: APIError.decodingMessage,
        procedure: procedure.path, requestID: requestID, detail: String(describing: error))
    }
  }

  /// Every header a request carries. Exposed for tests.
  func headers(
    credentials: RequestCredentials, priority: RequestPriority, requestID: String
  ) -> [String: String] {
    var headers = [
      APIHeader.contentType: "application/json",
      APIHeader.accept: "application/json",
      APIHeader.userAgent: clientInfo.userAgent,
      APIHeader.client: clientInfo.clientHeader,
      APIHeader.requestID: requestID,
    ]
    if let token = credentials.bearerToken, !token.isEmpty {
      headers[APIHeader.authorization] = "Bearer \(token)"
    }
    if let account = credentials.planningCenterAccountID, !account.isEmpty {
      headers[APIHeader.account] = account
    }
    if let demo = credentials.demoToken, !demo.isEmpty {
      headers[APIHeader.demo] = demo
    }
    if let value = priority.headerValue {
      headers[APIHeader.priority] = value
    }
    return headers
  }
}

/// A decoded output with the response's headers (lowercased names).
public struct RPCResult<Output: Sendable>: Sendable {
  public let output: Output
  public let headers: [String: String]

  public init(output: Output, headers: [String: String]) {
    self.output = output
    self.headers = headers
  }
}

/// How a query or write function calls the API: `RPCClient` bound to the lane `QueryClient`
/// chose, so prefetches stay speculative until a screen needs them.
///
/// ```swift
/// queries.query(.planWindowHistory(dateKey: key)) { rpc in
///   try await rpc(RPC.People.planWindowHistory, PeoplePlanWindowHistoryInput(date: key))
/// }
/// ```
public struct RPCCaller: Sendable {
  public let client: RPCClient
  public let lane: RequestLane

  public init(client: RPCClient, lane: RequestLane) {
    self.client = client
    self.lane = lane
  }

  /// The lane's priority right now.
  public var priority: RequestPriority { lane.priority }

  public func callAsFunction<Input, Output>(
    _ procedure: Procedure<Input, Output>, _ input: Input
  ) async throws -> Output {
    try await client.call(procedure, input, lane: lane)
  }

  public func callAsFunction<Output>(_ procedure: Procedure<EmptyInput, Output>) async throws
    -> Output
  {
    try await client.call(procedure, EmptyInput(), lane: lane)
  }
}
