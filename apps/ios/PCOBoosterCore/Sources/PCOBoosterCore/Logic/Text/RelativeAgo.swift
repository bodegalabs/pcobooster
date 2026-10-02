import Foundation

// Ports of `formatCompactAgo` (apps/web/src/lib/song-library.ts) and `formatPlayedAgo`
// (apps/web/src/lib/plan-set-insights.ts). Pinned by the `text.formatCompactAgo` and
// `text.formatPlayedAgo` parity suites.
//
// Both count elapsed 24-hour periods, not organization calendar days, exactly like the
// TypeScript: a song sung at 7 PM last night is "0d" at 9 AM. Keep them in step with the web
// if it moves to calendar days.

private let dayMilliseconds = 86_400_000
private let weekDays = 7
private let monthDays = 30
private let yearDays = 365

/// Whole 24-hour periods from `start` to `end`, never negative.
private func elapsedDays(from start: Date, to end: Date) -> Int {
  max(0, JSParity.floorDivide(JSParity.time(end) - JSParity.time(start), dayMilliseconds))
}

/// "3d", "4w", "5mo", "2y": how long before `reference` something happened.
public func formatCompactAgo(_ at: Date, reference: Date) -> String {
  let days = elapsedDays(from: at, to: reference)
  if days < weekDays {
    return "\(days)d"
  }
  if days < monthDays * 2 {
    return "\(days / weekDays)w"
  }
  if days < yearDays {
    return "\(days / monthDays)mo"
  }
  return "\(days / yearDays)y"
}

/// "This week", "3 wk ago", "5 mo ago", or "2 yr ago": how long a song has rested.
public func formatPlayedAgo(_ playedAt: Date, now: Date) -> String {
  let days = elapsedDays(from: playedAt, to: now)
  if days < weekDays {
    return "This week"
  }
  if days < monthDays * 2 {
    return "\(days / weekDays) wk ago"
  }
  if days < yearDays {
    return "\(days / monthDays) mo ago"
  }
  return "\(days / yearDays) yr ago"
}
