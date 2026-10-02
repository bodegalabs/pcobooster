// Port of the plan workspace routes in apps/web/src/lib/app-routes.ts. Pinned by the
// `routes.*` parity suites. The API hands out web paths (`PeopleDashboardMonthDay.planUrl` is
// `/services/<serviceTypeId>/plans/<planId>/lineup`), so the app reads them back into a plan
// and view.

/// A plan workspace view, in the web's tab order.
public enum PlanView: String, CaseIterable, Codable, Sendable {
  case overview
  case assign
  case lineup
  case plan
  case times

  /// "Overview", "Assign", "Lineup", "Plan", or "Times" (`getPlanViewLabel`).
  public var label: String {
    switch self {
    case .overview: "Overview"
    case .assign: "Assign"
    case .lineup: "Lineup"
    case .plan: "Plan"
    case .times: "Times"
    }
  }
}

/// A plan and the view it opens on.
public struct PlanRoute: Hashable, Codable, Sendable {
  public var serviceTypeId: String
  public var planId: String
  public var view: PlanView

  public init(serviceTypeId: String, planId: String, view: PlanView) {
    self.serviceTypeId = serviceTypeId
    self.planId = planId
    self.view = view
  }

  /// The web path, `/services/<serviceTypeId>/plans/<planId>/<view>`, with the ids encoded
  /// like `encodeURIComponent`. `parsePlanRoute` reads it back.
  public var path: String {
    let serviceType = PlanRouteEncoding.encodeComponent(serviceTypeId)
    let plan = PlanRouteEncoding.encodeComponent(planId)
    return "/services/\(serviceType)/plans/\(plan)/\(view.rawValue)"
  }
}

/// Reads a plan workspace path, such as a `planUrl` from the API, into its plan and view
/// (`parsePlanRoute`). Nil for other paths, unknown views, a query or fragment after the view,
/// and ids that are not valid percent-encoded UTF-8.
public func parsePlanRoute(_ path: String) -> PlanRoute? {
  // `^/services/([^/]+)/plans/([^/]+)/([^/]+)$`, split on the "/" code unit.
  let segments = path.utf8.split(separator: UInt8(ascii: "/"), omittingEmptySubsequences: false)
    .map { String(decoding: $0, as: UTF8.self) }
  guard segments.count == 6, segments[0].isEmpty, segments[1] == "services",
    segments[3] == "plans", !segments[2].isEmpty, !segments[4].isEmpty,
    let serviceTypeId = PlanRouteEncoding.decodeComponent(segments[2]),
    let planId = PlanRouteEncoding.decodeComponent(segments[4]),
    let view = PlanView(rawValue: segments[5])
  else {
    return nil
  }
  return PlanRoute(serviceTypeId: serviceTypeId, planId: planId, view: view)
}

private enum PlanRouteEncoding {
  /// `encodeURIComponent`: UTF-8, percent-encoding everything but ASCII letters, digits, and
  /// `-_.!~*'()`, with uppercase hex digits.
  static func encodeComponent(_ text: String) -> String {
    var encoded = ""
    for byte in text.utf8 {
      if isUnreserved(byte) {
        encoded.unicodeScalars.append(Unicode.Scalar(byte))
      } else {
        encoded.unicodeScalars.append("%")
        encoded.unicodeScalars.append(hexDigits[Int(byte >> 4)])
        encoded.unicodeScalars.append(hexDigits[Int(byte & 0x0F)])
      }
    }
    return encoded
  }

  /// `decodeURIComponent`: decodes every `%XX`, nil (where JavaScript throws `URIError`) for
  /// a `%` without two hex digits or bytes that are not valid UTF-8.
  static func decodeComponent(_ text: String) -> String? {
    let input = Array(text.utf8)
    var bytes: [UInt8] = []
    bytes.reserveCapacity(input.count)
    var index = 0
    while index < input.count {
      guard input[index] == UInt8(ascii: "%") else {
        bytes.append(input[index])
        index += 1
        continue
      }
      guard index + 2 < input.count, let high = hexValue(input[index + 1]),
        let low = hexValue(input[index + 2])
      else {
        return nil
      }
      bytes.append(high << 4 | low)
      index += 3
    }
    // Strict validation rejects overlong forms, surrogates, and truncated sequences, the same
    // inputs JavaScript rejects. Mixing raw and escaped bytes changes nothing: a raw
    // character's encoding never starts with a continuation byte.
    return String(validating: bytes, as: UTF8.self)
  }

  private static func isUnreserved(_ byte: UInt8) -> Bool {
    switch byte {
    case UInt8(ascii: "A")...UInt8(ascii: "Z"), UInt8(ascii: "a")...UInt8(ascii: "z"),
      UInt8(ascii: "0")...UInt8(ascii: "9"):
      true
    default:
      "-_.!~*'()".utf8.contains(byte)
    }
  }

  private static let hexDigits = Array("0123456789ABCDEF".unicodeScalars)

  private static func hexValue(_ byte: UInt8) -> UInt8? {
    switch byte {
    case UInt8(ascii: "0")...UInt8(ascii: "9"): byte - UInt8(ascii: "0")
    case UInt8(ascii: "A")...UInt8(ascii: "F"): byte - UInt8(ascii: "A") + 10
    case UInt8(ascii: "a")...UInt8(ascii: "f"): byte - UInt8(ascii: "a") + 10
    default: nil
    }
  }
}
