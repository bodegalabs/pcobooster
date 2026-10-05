// Port of `formatDuration` in apps/web/src/lib/plan-overview.ts. Pinned by the
// `text.formatDuration` parity suite.

/// "1:05:00" or "42:10" for a length in seconds (fractions dropped); nil for no length.
/// Nil also for a non-finite length, which the TypeScript would print as "NaN:NaN".
public func formatDuration(seconds: Double) -> String? {
  guard seconds.isFinite else {
    return nil
  }
  let total = JSParity.clampedInt(max(0, seconds.rounded(.down)))
  guard total > 0 else {
    return nil
  }
  let hours = total / 3600
  let minutes = total % 3600 / 60
  let rest = JSParity.zeroPadded(total % 60, width: 2)
  return hours > 0
    ? "\(hours):\(JSParity.zeroPadded(minutes, width: 2)):\(rest)"
    : "\(minutes):\(rest)"
}

/// "1:05:00" or "42:10" for a whole number of seconds; nil for no length.
public func formatDuration(seconds: Int) -> String? {
  formatDuration(seconds: Double(seconds))
}
