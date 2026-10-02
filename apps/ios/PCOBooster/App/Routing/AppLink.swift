import Foundation
import PCOBoosterCore

/// Something a URL or a launch argument asks the app to open.
///
/// Accepted forms (custom scheme or `https://pcobooster.com`, same paths):
/// - `/demo/<key>`: start the read-only demo.
/// - `/services`, `/people`, `/songs`, `/search`: a tab root.
/// - `/services/<serviceTypeId>/plans/<planId>[/<view>]`: a plan (`/assign` opens Lineup, then
///   Assign).
/// - `/people/<personId>[?month=YYYY-MM]`: a person.
/// - `/songs/<songId>`: a song; `/songs/<songId>/chart[?arrangement=<id>]`: its chord chart.
/// - `/account`: the account sheet.
enum AppLink: Hashable, Sendable {
  case demo(key: String)
  case tab(AppTab)
  case routes(AppTab, [AppRoute])
  case account

  static let webHosts: Set<String> = ["pcobooster.com", "www.pcobooster.com"]

  /// The link a URL carries, or nil for anything else (including sign-in callbacks, which
  /// `ASWebAuthenticationSession` handles itself).
  static func parse(_ url: URL, scheme: String) -> AppLink? {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let urlScheme = components.scheme?.lowercased()
    else {
      return nil
    }
    let host = components.host?.lowercased() ?? ""
    let path: String
    switch urlScheme {
    case scheme.lowercased():
      // `pcobooster://demo/<key>` reads as host "demo", path "/<key>".
      guard !host.isEmpty else { return nil }
      path = "/" + host + components.percentEncodedPath
    case "https" where webHosts.contains(host):
      path = components.percentEncodedPath
    default:
      return nil
    }
    var pathWithQuery = path
    if let query = components.percentEncodedQuery, !query.isEmpty {
      pathWithQuery += "?" + query
    }
    return parse(path: pathWithQuery)
  }

  /// The link an app path (with an optional query) names, or nil.
  static func parse(path rawPath: String) -> AppLink? {
    guard let components = URLComponents(string: rawPath) else { return nil }
    let path = components.percentEncodedPath
    let query = components.queryItems ?? []
    func queryValue(_ name: String) -> String? {
      query.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
    }
    let segments = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    let decoded = segments.map { $0.removingPercentEncoding ?? $0 }
    guard let first = decoded.first else { return nil }

    switch first {
    case "demo":
      guard decoded.count == 2, let key = DemoLink.key(from: decoded[1]) else { return nil }
      return .demo(key: key)
    case "account":
      return decoded.count == 1 ? .account : nil
    case "search":
      return decoded.count == 1 ? .tab(.search) : nil
    case "services":
      if decoded.count == 1 { return .tab(.services) }
      return planLink(segments: segments)
    case "people":
      if decoded.count == 1 { return .tab(.people) }
      guard decoded.count == 2 else { return nil }
      return .routes(.people, [.person(id: decoded[1], month: queryValue("month"))])
    case "songs":
      switch decoded.count {
      case 1: return .tab(.songs)
      case 2: return .routes(.songs, [.song(id: decoded[1])])
      case 3 where decoded[2] == "chart":
        let songId = decoded[1]
        return .routes(
          .songs,
          [.song(id: songId), .chordChart(songId: songId, arrangementId: queryValue("arrangement"))])
      default: return nil
      }
    default:
      return nil
    }
  }

  /// `/services/<st>/plans/<id>[/<view>]` through the `parsePlanRoute` port.
  private static func planLink(segments: [String]) -> AppLink? {
    var path = "/" + segments.joined(separator: "/")
    if segments.count == 4 {
      path += "/\(PlanView.overview.rawValue)"
    }
    guard let route = parsePlanRoute(path) else { return nil }
    guard route.view == .assign else { return .routes(.services, [.plan(route)]) }
    let lineup = PlanRoute(serviceTypeId: route.serviceTypeId, planId: route.planId, view: .lineup)
    return .routes(.services, [.plan(lineup), .assign(lineup, teamId: nil, positionId: nil)])
  }
}

/// Reads demo keys from what people paste: a full link (`https://pcobooster.com/demo/<key>`,
/// `pcobooster.com/demo/<key>`, `pcobooster://demo/<key>`) or the bare key. Keys are never
/// compiled into the app; they arrive only this way.
enum DemoLink {
  /// The shortest key accepted (production keys are at least 24 characters).
  static let minimumKeyLength = 8

  static func key(from text: String) -> String? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !trimmed.contains(where: \.isWhitespace) else { return nil }
    let candidate: Substring
    if let range = trimmed.range(of: "/demo/", options: .caseInsensitive) {
      candidate = trimmed[range.upperBound...].prefix { $0 != "/" && $0 != "?" && $0 != "#" }
    } else if trimmed.contains("/") || trimmed.contains(":") {
      return nil
    } else {
      candidate = Substring(trimmed)
    }
    let key = String(candidate).removingPercentEncoding ?? String(candidate)
    guard key.count >= minimumKeyLength,
      key.unicodeScalars.allSatisfy({ allowedScalars.contains($0) })
    else {
      return nil
    }
    return key
  }

  /// URL-safe ASCII, the alphabet the server's keys use.
  private static let allowedScalars = CharacterSet(
    charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~")
}
