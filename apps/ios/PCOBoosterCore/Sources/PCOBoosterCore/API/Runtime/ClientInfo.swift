import Foundation

/// The build and OS this client runs, sent on every request: `User-Agent:
/// PCOBooster/<version> (iOS <os version>)` (stored with activity events server-side) and
/// `x-pcobooster-client: ios/<build>` (lets Workers Logs attribute errors to builds).
public struct ClientInfo: Sendable, Hashable {
  /// `CFBundleShortVersionString`, for example `1.0.2`.
  public var appVersion: String
  /// `CFBundleVersion`, for example `42`.
  public var build: String
  /// `iOS` on iPhone and iPad.
  public var platform: String
  /// For example `26.0.1`.
  public var osVersion: String

  public init(appVersion: String, build: String, platform: String, osVersion: String) {
    self.appVersion = appVersion
    self.build = build
    self.platform = platform
    self.osVersion = osVersion
  }

  /// This process: the bundle's version and build, and the running OS.
  public static func current(bundle: Bundle = .main) -> ClientInfo {
    let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    let os = ProcessInfo.processInfo.operatingSystemVersion
    var osVersion = "\(os.majorVersion).\(os.minorVersion)"
    if os.patchVersion > 0 {
      osVersion += ".\(os.patchVersion)"
    }
    return ClientInfo(
      appVersion: version ?? "0", build: build ?? "0", platform: currentPlatform,
      osVersion: osVersion)
  }

  private static var currentPlatform: String {
    #if os(iOS)
    "iOS"
    #elseif os(macOS)
    "macOS"
    #else
    "Apple"
    #endif
  }

  public var userAgent: String {
    "PCOBooster/\(appVersion) (\(platform) \(osVersion))"
  }

  /// The `x-pcobooster-client` value.
  public var clientHeader: String {
    "ios/\(build)"
  }
}

/// Header names the native client sends. The API reads `x-pcobooster-account` and
/// `x-pcobooster-demo` before the web's cookies.
public enum APIHeader {
  public static let authorization = "Authorization"
  public static let contentType = "Content-Type"
  public static let accept = "Accept"
  public static let userAgent = "User-Agent"
  /// The selected Planning Center account (organization) id.
  public static let account = "x-pcobooster-account"
  /// The demo token from `demo.start`'s `Set-Cookie: pcobooster-demo=<token>`.
  public static let demo = "x-pcobooster-demo"
  /// `speculative` on prefetches; absent means interactive.
  public static let priority = "x-pcobooster-priority"
  /// `ios/<build>`.
  public static let client = "x-pcobooster-client"
  /// A UUID per request, used as the request id in Workers Logs.
  public static let requestID = "x-request-id"
}
