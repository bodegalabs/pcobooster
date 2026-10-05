import Foundation
import PCOBoosterCore
import Testing

@testable import PCOBoosterCore

struct RPCClientTests {
  private func client(
    _ transport: StubTransport,
    credentials: SessionCredentials = SessionCredentials(),
    analytics: any AnalyticsSink = NoAnalytics()
  ) -> RPCClient {
    RPCClient(
      transport: transport, scheduler: RequestScheduler(quietPeriod: .zero),
      clientInfo: testClientInfo, credentials: credentials, analytics: analytics)
  }

  // MARK: - Request envelope

  @Test func wrapsInputInJSONEnvelope() async throws {
    let transport = StubTransport(rpc: { _ in .ok("[]") })
    let plans = try await client(transport).call(RPC.Catalog.plans, PlansInput(serviceTypeId: "1101"))
    #expect(plans.isEmpty)
    let request = try #require(transport.requests.first)
    #expect(request.path == "catalog/plans")
    #expect(try json(request.body) == ["json": ["serviceTypeId": "1101"]])
  }

  @Test func sendsEmptyObjectInputForEmptyInputProcedures() async throws {
    let transport = StubTransport(rpc: { _ in .ok(#"{"authenticated":true}"#) })
    let status = try await client(transport).call(RPC.Session.status)
    #expect(status.authenticated)
    #expect(try json(#require(transport.requests.first).body) == ["json": [:]])
  }

  @Test func sendsBareObjectForProceduresWithoutInput() async throws {
    let transport = StubTransport(rpc: { _ in .ok(#"{"people":true,"chordCharts":false}"#) })
    let features = try await client(transport).call(RPC.Features.status)
    #expect(features[.people] == true)
    #expect(String(decoding: try #require(transport.requests.first).body, as: UTF8.self) == "{}")
  }

  @Test func encodesDatesLikeToISOString() async throws {
    let transport = StubTransport(rpc: { _ in .ok(#"{"success":true}"#) })
    let input = PlanItemsDeleteInput(serviceTypeId: "1", planId: "2", itemId: "3")
    _ = try await client(transport).call(RPC.PlanItems.delete, input)
    #expect(
      try json(#require(transport.requests.first).body)
        == ["json": ["serviceTypeId": "1", "planId": "2", "itemId": "3"]])
  }

  // MARK: - Response envelope

  @Test func decodesNullJSONAsNilForOptionalOutputs() async throws {
    let transport = StubTransport(rpc: { _ in .ok("null") })
    let plan = try await client(transport).call(
      RPC.Catalog.plan, PlanInput(serviceTypeId: "1", planId: "missing"))
    #expect(plan == nil)
  }

  @Test func decodesPresentOptionalOutput() async throws {
    let body = #"{"id":"9","title":"Deep Roots","createdAt":"2026-09-01T12:00:00.000Z"}"#
    let transport = StubTransport(rpc: { _ in .ok(body) })
    let plan = try await client(transport).call(
      RPC.Catalog.plan, PlanInput(serviceTypeId: "1", planId: "9"))
    #expect(plan?.title == "Deep Roots")
    #expect(plan?.createdAt == JSONCoding.parseISODate("2026-09-01T12:00:00.000Z"))
  }

  @Test func decodesBodyWithoutJSONAsEmptyOutput() async throws {
    let transport = StubTransport(rpc: { _ in RPCResponse(status: 200, body: Data("{}".utf8)) })
    let output = try await client(transport).call(
      RPC.PlanTimes.delete, PlanTimesDeleteInput(serviceTypeId: "1", planId: "2", planTimeId: "3"))
    #expect(output == EmptyOutput())
  }

  @Test func treatsMissingJSONForRequiredOutputAsDecodingFailure() async throws {
    let transport = StubTransport(rpc: { _ in RPCResponse(status: 200, body: Data("{}".utf8)) })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Session.status)
    }
    #expect(error?.kind == .decoding)
    #expect(error?.isRetryable == true)
    #expect(error?.shouldRetryAutomatically == true)
  }

  @Test func treatsHTMLSuccessAsDecodingFailure() async throws {
    let transport = StubTransport(rpc: { _ in
      RPCResponse(status: 200, body: Data("<html>challenge</html>".utf8))
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Session.status)
    }
    #expect(error?.kind == .decoding)
  }

  // MARK: - Errors

  @Test func mapsUnauthorizedAndReportsTheCredentialsItCarried() async throws {
    let credentials = SessionCredentials(
      RequestCredentials(bearerToken: "tok.sig", planningCenterAccountID: "acct"))
    let reported = Recorder<RequestCredentials>()
    credentials.setUnauthorizedHandler { reported.append($0) }
    let transport = StubTransport(rpc: { _ in
      .orpcError(
        status: 401, code: "UNAUTHORIZED", message: "Unauthorized",
        data: #"{"message":"Sign in required"}"#)
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport, credentials: credentials).call(RPC.Access.me)
    }
    #expect(error?.isUnauthorized == true)
    #expect(error?.code == .unauthorized)
    #expect(error?.status == 401)
    #expect(error?.message == "Sign in required")
    #expect(error?.isRetryable == false)
    #expect(reported.values == [credentials.current])
  }

  @Test func mapsUndefinedValidationErrors() async throws {
    let transport = StubTransport(rpc: { _ in
      .orpcError(
        status: 400, code: "BAD_REQUEST", message: "Input validation failed",
        data: #"{"issues":[{"path":["personId"],"message":"Too small"}]}"#, defined: false)
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
    #expect(error?.code == .badRequest)
    #expect(error?.defined == false)
    #expect(error?.message == "Input validation failed")
    #expect(error?.data?["issues"]?[0]?["message"] == "Too small")
    #expect(error?.shouldRetryAutomatically == false)
  }

  @Test func prefersDataMessageForDefinedForbidden() async throws {
    let transport = StubTransport(rpc: { _ in
      .orpcError(
        status: 403, code: "FORBIDDEN", message: "Forbidden",
        data: #"{"message":"Demo is read-only."}"#)
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
    #expect(error?.code == .forbidden)
    #expect(error?.defined == true)
    #expect(error?.message == "Demo is read-only.")
    #expect(error?.userFacingMessage == "Demo is read-only.")
    #expect(error?.data(as: MessageErrorData.self) == MessageErrorData(message: "Demo is read-only."))
  }

  @Test func mapsRateLimitsWithRetryAfter() async throws {
    let transport = StubTransport(rpc: { _ in
      .orpcError(
        status: 429, code: "TOO_MANY_REQUESTS", message: "Too Many Requests",
        data: #"{"message":"Planning Center is busy","service":"planning-center","retryAfterSeconds":7.5}"#)
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
    #expect(error?.code == .tooManyRequests)
    #expect(error?.isRetryable == true)
    #expect(error?.shouldRetryAutomatically == false)
    #expect(error?.retryAfter == .milliseconds(7500))
  }

  @Test func keepsUnknownCodes() async throws {
    let transport = StubTransport(rpc: { _ in
      .orpcError(status: 405, code: "METHOD_NOT_SUPPORTED", message: "Method Not Supported", defined: false)
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
    #expect(error?.code == .unknown("METHOD_NOT_SUPPORTED"))
  }

  @Test func derivesCodesForPlainBodies() async throws {
    let transport = StubTransport(rpc: { _ in
      RPCResponse(status: 404, body: Data(#"{"error":"Not found"}"#.utf8))
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
    #expect(error?.code == .notFound)
    #expect(error?.message == "That couldn't be found.")
  }

  @Test func treatsServerErrorsAsRetryable() async throws {
    let transport = StubTransport(rpc: { _ in
      RPCResponse(status: 502, body: Data("<html>Bad gateway</html>".utf8))
    })
    let error = await #expect(throws: APIError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
    #expect(error?.code == .badGateway)
    #expect(error?.shouldRetryAutomatically == true)
  }

  @Test func mapsOfflineAndNetworkFailures() async throws {
    let offline = StubTransport(rpc: { _ in throw URLError(.notConnectedToInternet) })
    let offlineError = await #expect(throws: APIError.self) {
      _ = try await client(offline).call(RPC.Access.me)
    }
    #expect(offlineError?.kind == .offline)
    #expect(offlineError?.isRetryable == true)
    #expect(offlineError?.shouldRetryAutomatically == false)

    let timeout = StubTransport(rpc: { _ in throw URLError(.timedOut) })
    let timeoutError = await #expect(throws: APIError.self) {
      _ = try await client(timeout).call(RPC.Access.me)
    }
    #expect(timeoutError?.kind == .network)
    #expect(timeoutError?.shouldRetryAutomatically == true)
  }

  @Test func turnsCancelledRequestsIntoCancellationError() async throws {
    let transport = StubTransport(rpc: { _ in throw URLError(.cancelled) })
    await #expect(throws: CancellationError.self) {
      _ = try await client(transport).call(RPC.Access.me)
    }
  }

  // MARK: - Headers

  @Test func sendsEveryHeader() async throws {
    let credentials = SessionCredentials(
      RequestCredentials(bearerToken: "tok+/=.sig", planningCenterAccountID: "acct-2", demoToken: "demo"))
    let transport = StubTransport(rpc: { _ in .ok(#"{"authenticated":true}"#) })
    let rpc = client(transport, credentials: credentials)
    _ = try await rpc.call(RPC.Session.status)
    _ = try await rpc.call(RPC.Session.status, priority: .speculative)

    let interactive = transport.requests[0].headers
    #expect(interactive["Authorization"] == "Bearer tok+/=.sig")
    #expect(interactive["x-pcobooster-account"] == "acct-2")
    #expect(interactive["x-pcobooster-demo"] == "demo")
    #expect(interactive["x-pcobooster-client"] == "ios/45")
    #expect(interactive["User-Agent"] == "PCOBooster/1.2.3 (iOS 26.0)")
    #expect(interactive["Content-Type"] == "application/json")
    #expect(interactive["x-pcobooster-priority"] == nil)
    let requestID = try #require(interactive["x-request-id"])
    #expect(UUID(uuidString: requestID) != nil)

    let speculative = transport.requests[1].headers
    #expect(speculative["x-pcobooster-priority"] == "speculative")
    #expect(speculative["x-request-id"] != requestID)
  }

  @Test func leavesOutCredentialHeadersWhenSignedOut() async throws {
    let transport = StubTransport(rpc: { _ in .ok(#"{"authenticated":false}"#) })
    _ = try await client(transport).call(RPC.Session.status)
    let headers = try #require(transport.requests.first).headers
    #expect(headers["Authorization"] == nil)
    #expect(headers["x-pcobooster-account"] == nil)
    #expect(headers["x-pcobooster-demo"] == nil)
  }

  @Test func returnsResponseHeaders() async throws {
    let transport = StubTransport(rpc: { _ in
      .ok(#"{"demo":true}"#, headers: ["set-cookie": "pcobooster-demo=abc; Path=/; HttpOnly"])
    })
    let result = try await client(transport).callWithHeaders(RPC.Demo.start, DemoStartInput(key: "k"))
    #expect(result.output.demo)
    #expect(result.headers["set-cookie"]?.hasPrefix("pcobooster-demo=abc") == true)
  }

  // MARK: - Analytics

  @Test func measuresTrackedWrites() async throws {
    let analytics = RecordingAnalytics()
    let transport = StubTransport(rpc: { request in
      request.path == "planItems/delete"
        ? .ok(#"{"success":true}"#)
        : .orpcError(
          status: 409, code: "ALREADY_SCHEDULED", message: "ALREADY_SCHEDULED",
          data: #"{"message":"Already scheduled"}"#)
    })
    let rpc = client(transport, analytics: analytics)
    _ = try await rpc.call(
      RPC.PlanItems.delete, PlanItemsDeleteInput(serviceTypeId: "1", planId: "2", itemId: "3"))
    _ = try? await rpc.call(
      RPC.Schedule.assign,
      ScheduleAssignInput(serviceTypeId: "1", personId: "5", planId: "2", teamId: "3", positionId: "4"))
    _ = try? await rpc.call(RPC.Access.me)

    #expect(analytics.events.count == 2)
    guard case .workflowCompleted(.planItemsDelete, _) = analytics.events.first else {
      Issue.record("Expected workflow completed, got \(analytics.events)")
      return
    }
    #expect(analytics.events.last == .workflowFailed(.scheduleAssign, errorCode: .alreadyScheduled))
    #expect(analytics.events.last?.properties["error_code"] == .string("ALREADY_SCHEDULED"))
  }
}

struct URLSessionTransportTests {
  @Test func configuresACookielessEphemeralSession() {
    let configuration = URLSessionTransport.makeConfiguration()
    #expect(configuration.httpCookieStorage == nil)
    #expect(configuration.httpShouldSetCookies == false)
    #expect(configuration.httpCookieAcceptPolicy == .never)
    #expect(configuration.urlCache == nil)
    #expect(configuration.timeoutIntervalForRequest == 30)
    #expect(configuration.waitsForConnectivity == false)
  }

  @Test func resolvesPathsAgainstTheOrigin() throws {
    let base = try #require(URL(string: "https://pcobooster.com"))
    let transport = URLSessionTransport(baseURL: base)
    #expect(transport.url(for: "/api/rpc/people/search").absoluteString
      == "https://pcobooster.com/api/rpc/people/search")
    let local = URLSessionTransport(baseURL: try #require(URL(string: "http://127.0.0.1:3001/")))
    #expect(local.url(for: "/api/auth/sign-out").absoluteString
      == "http://127.0.0.1:3001/api/auth/sign-out")
  }

  @Test func lowercasesHeaderNames() {
    let headers = URLSessionTransport.lowercasedHeaders([
      "Set-Cookie": "pcobooster-demo=abc", "Content-Type": "application/json",
    ])
    #expect(headers == ["set-cookie": "pcobooster-demo=abc", "content-type": "application/json"])
  }
}

/// Answers every request in a `URLSession` it is installed in, recording what was sent.
private final class StubURLProtocol: URLProtocol {
  struct Captured: Sendable {
    let method: String?
    let url: URL?
    let headers: [String: String]
    let body: Data
  }

  static let captured = Recorder<Captured>()

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.captured.append(
      Captured(
        method: request.httpMethod, url: request.url,
        headers: request.allHTTPHeaderFields ?? [:], body: Self.body(of: request)))
    guard let url = request.url,
      let response = HTTPURLResponse(
        url: url, statusCode: 200, httpVersion: "HTTP/1.1",
        headerFields: [
          "Content-Type": "application/json",
          "Set-Cookie": "pcobooster-demo=abc; Path=/; HttpOnly",
        ])
    else {
      client?.urlProtocol(self, didFailWithError: URLError(.badURL))
      return
    }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(#"{"json":{"authenticated":true},"meta":[]}"#.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func body(of request: URLRequest) -> Data {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return Data() }
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      guard count > 0 else { break }
      data.append(buffer, count: count)
    }
    return data
  }
}

struct URLSessionTransportRoundTripTests {
  @Test func postsRPCCallsThroughURLSession() async throws {
    let configuration = URLSessionTransport.makeConfiguration()
    configuration.protocolClasses = [StubURLProtocol.self]
    let transport = URLSessionTransport(
      baseURL: try #require(URL(string: "https://pcobooster.com")),
      session: URLSession(configuration: configuration))
    let rpc = RPCClient(
      transport: transport, scheduler: RequestScheduler(quietPeriod: .zero),
      clientInfo: testClientInfo,
      credentials: SessionCredentials(RequestCredentials(bearerToken: "tok.sig")))

    let result = try await rpc.callWithHeaders(RPC.Session.status, EmptyInput())
    #expect(result.output.authenticated)
    #expect(result.headers["set-cookie"] == "pcobooster-demo=abc; Path=/; HttpOnly")
    #expect(result.headers["content-type"] == "application/json")

    let sent = try #require(StubURLProtocol.captured.values.last)
    #expect(sent.method == "POST")
    #expect(sent.url?.absoluteString == "https://pcobooster.com/api/rpc/session/status")
    #expect(sent.headers["Authorization"] == "Bearer tok.sig")
    #expect(sent.headers["Cookie"] == nil)
    #expect(sent.headers["User-Agent"] == "PCOBooster/1.2.3 (iOS 26.0)")
    #expect(try json(sent.body) == ["json": [:]])
  }
}
