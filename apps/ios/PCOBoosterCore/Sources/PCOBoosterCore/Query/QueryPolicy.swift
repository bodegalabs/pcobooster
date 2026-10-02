import Foundation

/// How long a cached read stays fresh, whether it retries, and whether it is kept on disk.
/// Each family's default copies the web (`staleTime` per hook, `retry: false` for lyrics and
/// PDFs, and the families the web keeps in `localStorage`).
public struct QueryPolicy: Sendable, Hashable {
  /// How long after `updatedAt` the value counts as fresh; nil never goes stale on its own
  /// (only invalidation refetches it). `.zero` refetches every time a screen appears.
  public var staleTime: Duration?
  /// Whether a failed read retries once on a transient failure
  /// (`APIError.shouldRetryAutomatically`).
  public var retries: Bool
  /// Kept on disk between launches when set.
  public var persistence: Persistence?

  public init(staleTime: Duration?, retries: Bool = true, persistence: Persistence? = nil) {
    self.staleTime = staleTime
    self.retries = retries
    self.persistence = persistence
  }

  /// Disk caching for one family. Persisted values seed a cold query with their saved time, so
  /// normal staleness decides whether to refetch (persist, then revalidate).
  public struct Persistence: Sendable, Hashable {
    /// Bumped when the cached shape or meaning changes; older files are misses.
    public var version: Int
    /// Saved values older than this are misses (and are deleted).
    public var retention: Duration?
    /// Only the newest this many keys of the family are kept.
    public var maxEntries: Int?

    public init(version: Int, retention: Duration? = nil, maxEntries: Int? = nil) {
      self.version = version
      self.retention = retention
      self.maxEntries = maxEntries
    }
  }

  /// Unused cached reads leave memory this long after their last screen goes away (`gcTime`).
  public static let memoryRetention: Duration = .seconds(30 * 60)
}

extension QueryFamily {
  /// The web's settings for this family.
  public var policy: QueryPolicy {
    switch self {
    case .accounts:
      // `account-panel-cache.ts`; always revalidated.
      QueryPolicy(staleTime: .zero, persistence: .init(version: 1))
    case .access:
      QueryPolicy(staleTime: .minutes(10))
    case .features:
      // The web answers from SSR; a saved answer plays that part on a cold launch, and any
      // cached answer decides at once while it refreshes (`feature-query.ts`).
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 1))
    case .organizationTimeZone:
      QueryPolicy(staleTime: .minutes(60), persistence: .init(version: 1))
    case .serviceTypes:
      QueryPolicy(staleTime: .minutes(10), persistence: .init(version: 1))
    case .plans:
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 1, maxEntries: 50))
    case .planDetails, .adjacentPlans:
      QueryPolicy(staleTime: .minutes(5))
    case .teamPositions:
      QueryPolicy(staleTime: .minutes(10), persistence: .init(version: 1, maxEntries: 50))
    case .positionCandidates:
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 4, maxEntries: 50))
    case .planWindowHistory:
      // About 150 KB per date, so only the latest three dates are kept.
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 4, maxEntries: 3))
    case .candidateDetails:
      QueryPolicy(
        staleTime: .minutes(5),
        persistence: .init(version: 4, retention: .hours(24), maxEntries: 200))
    case .peopleSearch:
      QueryPolicy(staleTime: .seconds(30), persistence: .init(version: 1, maxEntries: 50))
    case .peopleDashboardRoster:
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 3))
    case .peopleDashboardActivity:
      QueryPolicy(
        staleTime: .minutes(2),
        persistence: .init(version: 3, retention: .hours(24), maxEntries: 200))
    case .peopleDashboardPerson:
      QueryPolicy(staleTime: .minutes(2), persistence: .init(version: 3, maxEntries: 50))
    case .blockouts:
      // The web never reads it; the server caches blockouts for five minutes.
      QueryPolicy(staleTime: .minutes(5))
    case .myScheduledPlans:
      QueryPolicy(staleTime: .minutes(1), persistence: .init(version: 2))
    case .planItems:
      QueryPolicy(staleTime: .minutes(1), persistence: .init(version: 1, maxEntries: 50))
    case .planTimes:
      QueryPolicy(staleTime: .minutes(1))
    case .songSearch:
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 2, maxEntries: 50))
    case .songLibrary, .songSuggestions, .songHistory:
      QueryPolicy(staleTime: .minutes(10))
    case .songOptions:
      QueryPolicy(staleTime: .minutes(5), persistence: .init(version: 1, maxEntries: 100))
    case .chordChartSong:
      QueryPolicy(staleTime: .seconds(30))
    case .lyricsSearch:
      QueryPolicy(staleTime: .minutes(60), retries: false)
    case .chordChartPdf:
      QueryPolicy(staleTime: nil, retries: false)
    }
  }
}

extension Duration {
  static func minutes(_ minutes: Int) -> Duration { .seconds(minutes * 60) }
  static func hours(_ hours: Int) -> Duration { .seconds(hours * 3600) }
}
