import Foundation

/// The congregation's IANA zone, which every congregation date is labeled in (never the
/// device's). It comes from `catalog.organization`; the persisted copy answers on a cold launch,
/// and `America/Los_Angeles` stands in only when no valid zone has ever loaded.
public enum OrganizationTimeZone {
  /// The zone used when nothing better is known.
  public static let lastResort = "America/Los_Angeles"

  /// The first candidate that names a real zone, else `lastResort`. Empty strings are skipped
  /// (`OrgCalendar` would read them as UTC).
  public static func resolve(_ candidates: String?...) -> String {
    resolve(candidates)
  }

  public static func resolve(_ candidates: [String?]) -> String {
    for candidate in candidates {
      guard let zone = candidate?.trimmingCharacters(in: .whitespacesAndNewlines), !zone.isEmpty,
        OrgCalendar.isValidTimeZone(zone)
      else {
        continue
      }
      return zone
    }
    return lastResort
  }
}

extension QueryClient {
  /// The organization's zone as a cached read (`catalog.organization`, fresh for an hour,
  /// persisted). Read `timeZone` from the state.
  public func organizationTimeZone() -> QueryState<OrganizationOutput> {
    query(.organizationTimeZone, RPC.Catalog.organization)
  }

  /// The organization's zone for code outside a view: the cached value when fresh, else
  /// loaded now. Falls back to the saved zone, then `OrganizationTimeZone.lastResort`, when the
  /// call fails.
  public func resolveOrganizationTimeZone() async -> String {
    let cached = value(for: .organizationTimeZone, as: OrganizationOutput.self)?.timeZone
    let loaded = try? await fetch(.organizationTimeZone, RPC.Catalog.organization, EmptyInput())
    return OrganizationTimeZone.resolve(loaded?.timeZone, cached)
  }
}

extension QueryState where Value == OrganizationOutput {
  /// The organization's zone, validated; `OrganizationTimeZone.lastResort` until one loads.
  public var timeZone: String {
    OrganizationTimeZone.resolve(value?.timeZone)
  }

  /// The validated zone once one has loaded (or was restored from disk), else nil.
  public var loadedTimeZone: String? {
    guard let zone = value?.timeZone, OrganizationTimeZone.resolve(zone) == zone else {
      return nil
    }
    return zone
  }
}
