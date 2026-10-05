import Foundation
import Synchronization

/// Where product analytics go. The package has no third-party dependency: the app adapts
/// PostHog (`PostHogSDK.shared.capture(event.name, properties: event.properties)`, with
/// `screenViewed` as `screen(_:)` and `readFailed` as `$exception`), and gates it to production
/// builds, a non-demo signed-in person, and the analytics opt-in.
///
/// Events mirror the web's allowlist (`packages/analytics/src/privacy.ts`) so dashboards and
/// Slack destinations keep working. Properties never carry names, emails, ids, search text, or
/// API messages.
public protocol AnalyticsSink: Sendable {
  func capture(_ event: AnalyticsEvent)
}

/// One allowlisted event.
public enum AnalyticsEvent: Sendable, Hashable {
  /// `app opened`: a cold launch with a session, after sign-in, and after switching to another
  /// person.
  case appOpened
  /// `sign in started`: the Planning Center sheet opens.
  case signInStarted
  /// `sign in failed`, with the native sign-in error code when there is one.
  case signInFailed(errorCode: String?)
  /// `workflow completed` for one of the tracked writes.
  case workflowCompleted(WorkflowOperation, duration: Duration)
  /// `workflow failed` for one of the tracked writes.
  case workflowFailed(WorkflowOperation, errorCode: WorkflowErrorCode)
  /// `$screen`, named by the web route template.
  case screenViewed(AnalyticsScreen)
  /// `$exception` named `DataLoadError` for a read that failed after its retry, like the web's
  /// `createReadErrorCache`.
  case readFailed(QueryFamily?, errorCode: WorkflowErrorCode)

  /// The PostHog event name.
  public var name: String {
    switch self {
    case .appOpened: "app opened"
    case .signInStarted: "sign in started"
    case .signInFailed: "sign in failed"
    case .workflowCompleted: "workflow completed"
    case .workflowFailed: "workflow failed"
    case .screenViewed: "$screen"
    case .readFailed: "$exception"
    }
  }

  /// The event's properties, all on the web's safe list.
  public var properties: [String: AnalyticsValue] {
    switch self {
    case .appOpened, .signInStarted:
      return [:]
    case .signInFailed(let errorCode):
      guard let errorCode else { return [:] }
      return ["error_code": .string(errorCode)]
    case .workflowCompleted(let operation, let duration):
      return [
        "operation": .string(operation.rawValue),
        "duration_ms": .int(Self.milliseconds(duration)),
      ]
    case .workflowFailed(let operation, let errorCode):
      return ["operation": .string(operation.rawValue), "error_code": .string(errorCode.rawValue)]
    case .screenViewed(let screen):
      return ["$screen_name": .string(screen.routeTemplate)]
    case .readFailed(let family, let errorCode):
      return [
        "operation": .string(Self.readOperation(family)),
        "error_code": .string(errorCode.rawValue),
        "outcome": .string("read_failed"),
      ]
    }
  }

  /// For `readFailed`: the synthetic exception's type and message, which never include ids or
  /// provider messages.
  public var exception: (type: String, message: String)? {
    guard case .readFailed(let family, let errorCode) = self else { return nil }
    return ("DataLoadError", "Failed to load \(Self.readOperation(family)) (\(errorCode.rawValue))")
  }

  private static func readOperation(_ family: QueryFamily?) -> String {
    family?.rawValue ?? "unknown-read"
  }

  private static func milliseconds(_ duration: Duration) -> Int {
    let (seconds, attoseconds) = duration.components
    return Int(seconds) * 1000 + Int((Double(attoseconds) / 1e15).rounded())
  }
}

/// A property value PostHog accepts.
public enum AnalyticsValue: Sendable, Hashable {
  case string(String)
  case int(Int)
  case bool(Bool)

  /// The plain value, for SDKs that take `[String: Any]`.
  public var rawValue: any Sendable {
    switch self {
    case .string(let value): value
    case .int(let value): value
    case .bool(let value): value
    }
  }
}

/// A screen, named by the web route it matches so web and iOS land in the same reports
/// (`analyticsPath` in `packages/analytics/src/privacy.ts`). Ids never leave the device.
public enum AnalyticsScreen: Sendable, Hashable {
  case signIn
  case services
  case plan(PlanView)
  case people
  case person
  case songs
  case song
  /// Screens with no web route (settings, account switcher).
  case other

  public var routeTemplate: String {
    switch self {
    case .signIn: "/auth"
    case .services: "/services"
    case .plan(let view): "/services/:serviceTypeId/plans/:planId/\(view.rawValue)"
    case .people: "/people"
    case .person: "/people/:personId"
    case .songs: "/songs"
    case .song: "/songs/:songId"
    case .other: "/other"
    }
  }
}

/// The writes the web measures (`apps/web/src/lib/workflow-analytics.ts`), named
/// `<namespace>.<procedure>`. `RPCClient` measures them automatically.
public enum WorkflowOperation: String, Sendable, Hashable, CaseIterable {
  case scheduleAssign = "schedule.assign"
  case scheduleRemove = "schedule.remove"
  case scheduleUpdateStatus = "schedule.updateStatus"
  case planItemsCreate = "planItems.create"
  case planItemsUpdate = "planItems.update"
  case planItemsDelete = "planItems.delete"
  case planItemsReorder = "planItems.reorder"
  case planTimesCreate = "planTimes.create"
  case planTimesUpdate = "planTimes.update"
  case planTimesDelete = "planTimes.delete"
  case accountsSelect = "accounts.select"
  case neededPositionsAdjust = "neededPositions.adjust"
  case planPeopleUpdateTimes = "planPeople.updateTimes"
  case chordChartsUpdate = "chordCharts.update"
  case chordChartsCreate = "chordCharts.create"
  case chordChartsCreateSong = "chordCharts.createSong"
  case feedbackSubmit = "feedback.submit"

  /// The operation a procedure path (`schedule/assign`) stands for; nil for untracked calls.
  public init?(procedurePath: String) {
    self.init(rawValue: procedurePath.replacingOccurrences(of: "/", with: "."))
  }
}

/// The bounded `error_code` values the web reports; anything else is `UNKNOWN`.
public enum WorkflowErrorCode: String, Sendable, Hashable, CaseIterable {
  case unauthorized = "UNAUTHORIZED"
  case forbidden = "FORBIDDEN"
  case notFound = "NOT_FOUND"
  case badRequest = "BAD_REQUEST"
  case alreadyScheduled = "ALREADY_SCHEDULED"
  case positionMismatch = "POSITION_MISMATCH"
  case conflict = "CONFLICT"
  case serviceUnavailable = "SERVICE_UNAVAILABLE"
  case gatewayTimeout = "GATEWAY_TIMEOUT"
  case tooManyRequests = "TOO_MANY_REQUESTS"
  case badGateway = "BAD_GATEWAY"
  case internalServerError = "INTERNAL_SERVER_ERROR"
  case unknown = "UNKNOWN"

  /// The code for any error: an API response's oRPC code when it is on the list, else
  /// `UNKNOWN` (network failures included, as on the web).
  public init(_ error: any Error) {
    guard let apiError = error as? APIError, apiError.kind == .response,
      let code = apiError.code
    else {
      self = .unknown
      return
    }
    self = WorkflowErrorCode(rawValue: code.rawValue) ?? .unknown
  }
}

/// Drops every event: previews, tests, debug builds, and people who opted out.
public struct NoAnalytics: AnalyticsSink {
  public init() {}
  public func capture(_ event: AnalyticsEvent) {}
}

/// Keeps every event in memory, for tests and the Debug menu.
public final class RecordingAnalytics: AnalyticsSink {
  private let storage = Mutex<[AnalyticsEvent]>([])

  public init() {}

  public func capture(_ event: AnalyticsEvent) {
    storage.withLock { $0.append(event) }
  }

  public var events: [AnalyticsEvent] {
    storage.withLock { $0 }
  }

  public func removeAll() {
    storage.withLock { $0.removeAll() }
  }
}
