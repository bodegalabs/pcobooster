import SwiftUI

/// Motion tokens, matching the web (`apps/web/src/styles/globals.css`). Short, consistent, and
/// always with a Reduce Motion fallback: loops stop, movement becomes a fade or nothing.
/// Animate position, size, and opacity; selection and highlight colors change instantly.
enum Motion {
  // MARK: Curves

  /// The house curve, `--ease-snappy: cubic-bezier(0.23, 1, 0.32, 1)`: fast start, soft landing.
  nonisolated static let snappyCurve = UnitCurve.bezier(
    startControlPoint: UnitPoint(x: 0.23, y: 1),
    endControlPoint: UnitPoint(x: 0.32, y: 1)
  )
  /// `--ease-glide: cubic-bezier(0.77, 0, 0.175, 1)` for replays and deliberate moves.
  nonisolated static let glideCurve = UnitCurve.bezier(
    startControlPoint: UnitPoint(x: 0.77, y: 0),
    endControlPoint: UnitPoint(x: 0.175, y: 1)
  )
  /// Ease-in `cubic-bezier(0.55, 0, 1, 0.45)` for things that leave (the sign-in launch-away).
  nonisolated static let launchCurve = UnitCurve.bezier(
    startControlPoint: UnitPoint(x: 0.55, y: 0),
    endControlPoint: UnitPoint(x: 1, y: 0.45)
  )
  /// Material standard `cubic-bezier(0.4, 0, 0.2, 1)` for the skeleton sweep.
  nonisolated static let sweepCurve = UnitCurve.bezier(
    startControlPoint: UnitPoint(x: 0.4, y: 0),
    endControlPoint: UnitPoint(x: 0.2, y: 1)
  )

  // MARK: Durations (seconds)

  /// Rocket takeoff, start to settle (web `BRAND_ANIMATION_MS`, flight 280 ms inside it).
  nonisolated static let rocketTakeoffDuration: TimeInterval = 0.32
  /// Rocket replay on tap (web 340 ms, glide curve).
  nonisolated static let rocketReplayDuration: TimeInterval = 0.34
  /// Rocket launch-away before the Planning Center sign-in sheet (web 420 ms ease-in).
  nonisolated static let rocketLaunchDuration: TimeInterval = 0.42
  /// One status dot pulse; every dot shares the same phase (web 2.4 s).
  nonisolated static let statusPulsePeriod: TimeInterval = 2.4
  /// Skeletons wait this long before appearing so fast loads never flash (web 120 ms).
  nonisolated static let skeletonDelay: TimeInterval = 0.12
  /// Skeleton fade-in once the delay passes (web 240 ms).
  nonisolated static let skeletonFadeDuration: TimeInterval = 0.24
  /// One shimmer sweep across a skeleton (web 1.6 s).
  nonisolated static let skeletonSweepPeriod: TimeInterval = 1.6
  /// Indeterminate progress waits this long before showing (web loading bar, 200 ms).
  nonisolated static let progressDelay: TimeInterval = 0.2
  /// One indeterminate progress sweep (web 1.1 s).
  nonisolated static let progressSweepPeriod: TimeInterval = 1.1
  /// Content replacing a skeleton fades in over this long (web `content-enter`, 200 ms).
  nonisolated static let revealDuration: TimeInterval = 0.2
  /// Stale content dims after this delay while a refetch runs (web `stale-while-busy`).
  nonisolated static let staleDelay: TimeInterval = 0.15
  /// Opacity of stale content during a refetch.
  nonisolated static let staleOpacity: Double = 0.55
  /// Assign day bars grow over this long (web `day-bars-reveal`, 180 ms).
  nonisolated static let dayBarDuration: TimeInterval = 0.18
  /// Extra delay per day of distance from the plan day, so bars ripple outward (web 3 ms).
  nonisolated static let dayBarStagger: TimeInterval = 0.003
  /// Sign-in stagger: each child rises 8 pt and fades over 360 ms, 60 ms apart.
  nonisolated static let entranceDuration: TimeInterval = 0.36
  nonisolated static let entranceStagger: TimeInterval = 0.06
  /// How long an error toast stays before dismissing itself.
  nonisolated static let toastDuration: TimeInterval = 4.5

  // MARK: Animations

  /// The house curve over `duration` (default 200 ms, the web's most common transition).
  nonisolated static func snappy(_ duration: TimeInterval = 0.2) -> Animation {
    .timingCurve(snappyCurve, duration: duration)
  }

  /// The glide curve over `duration`.
  nonisolated static func glide(_ duration: TimeInterval = rocketReplayDuration) -> Animation {
    .timingCurve(glideCurve, duration: duration)
  }

  /// Content reveal and small layout changes (web `content-enter`, `history-collapse`).
  nonisolated static let reveal = snappy(revealDuration)
  /// Leaving motion (launch-away).
  nonisolated static let launch = Animation.timingCurve(launchCurve, duration: rocketLaunchDuration)
  /// Sign-in entrance for the child at `index`.
  nonisolated static func entrance(index: Int) -> Animation {
    snappy(entranceDuration).delay(Double(index) * entranceStagger)
  }

  /// Assign day bar at `distance` days from the plan day.
  nonisolated static func dayBar(distance: Int) -> Animation {
    snappy(dayBarDuration).delay(Double(abs(distance)) * dayBarStagger)
  }

  /// `animation`, or a plain fade-length ease when Reduce Motion is on (opacity-only changes
  /// should still read), or `nil` to change instantly when `instantWhenReduced` is set.
  nonisolated static func respecting(
    reduceMotion: Bool,
    _ animation: Animation,
    instantWhenReduced: Bool = false
  ) -> Animation? {
    guard reduceMotion else { return animation }
    return instantWhenReduced ? nil : .easeInOut(duration: revealDuration)
  }
}

extension View {
  /// Dims content to `Motion.staleOpacity` after a short delay while it refreshes, so quick
  /// refetches stay silent (web `stale-while-busy`).
  func staleWhileRefreshing(_ isRefreshing: Bool) -> some View {
    opacity(isRefreshing ? Motion.staleOpacity : 1)
      .animation(
        isRefreshing
          ? .easeInOut(duration: Motion.revealDuration).delay(Motion.staleDelay)
          : .easeInOut(duration: Motion.revealDuration),
        value: isRefreshing
      )
  }

  /// Sign-in style entrance: rises 8 pt and fades in, staggered by `index`. Reduce Motion fades only.
  func entrance(index: Int, isVisible: Bool) -> some View {
    modifier(EntranceModifier(index: index, isVisible: isVisible))
  }
}

private struct EntranceModifier: ViewModifier {
  let index: Int
  let isVisible: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .opacity(isVisible ? 1 : 0)
      .offset(y: isVisible || reduceMotion ? 0 : 8)
      .animation(
        Motion.respecting(reduceMotion: reduceMotion, Motion.entrance(index: index)),
        value: isVisible
      )
  }
}
