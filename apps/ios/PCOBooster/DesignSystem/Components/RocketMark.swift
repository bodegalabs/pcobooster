import SwiftUI

/// The pcobooster rocket, drawn from the logo's geometry (`apps/web/public/icon.svg`) so its
/// parts can move like the web mark:
///
/// - Takeoff (320 ms window, `--ease-snappy`): the rocket flies in from down-left with a small
///   overshoot while the exhaust shoots out behind it, trails then dots, staggered.
/// - Replay (340 ms, `--ease-glide`): on tap when `replaysOnTap`, it pulls back and re-launches.
/// - Launch-away (420 ms ease-in): set `isLaunching` before presenting Planning Center sign-in;
///   it flies off up-right, shrinking and fading.
///
/// Reduce Motion skips takeoff and replay and turns launch-away into a fade. Decorative for
/// VoiceOver; pair it with `Wordmark` (see `BrandLockup`).
///
/// `RocketMark(size: 40, playsTakeoffOnAppear: true, isLaunching: isSigningIn)`.
struct RocketMark: View {
  var size: CGFloat = 32
  var playsTakeoffOnAppear = false
  var isLaunching = false
  var replaysOnTap = false
  /// Changing this replays the takeoff (after an account switch, for example).
  var takeoffTrigger = 0
  var tint: Color = .brandRocket

  @State private var flight: Flight?
  @State private var hasAppeared = false
  @State private var tapCount = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(
    size: CGFloat = 32,
    playsTakeoffOnAppear: Bool = false,
    isLaunching: Bool = false,
    replaysOnTap: Bool = false,
    takeoffTrigger: Int = 0,
    tint: Color = .brandRocket
  ) {
    self.size = size
    self.playsTakeoffOnAppear = playsTakeoffOnAppear
    self.isLaunching = isLaunching
    self.replaysOnTap = replaysOnTap
    self.takeoffTrigger = takeoffTrigger
    self.tint = tint
  }

  var body: some View {
    TimelineView(.animation(paused: flight == nil)) { context in
      RocketCanvas(pose: pose(at: context.date), tint: tint)
        .frame(width: size * RocketCanvas.overflow, height: size * RocketCanvas.overflow)
    }
    .frame(width: size, height: size)
    .offset(x: isLaunching && !reduceMotion ? size * 0.7 : 0, y: isLaunching && !reduceMotion ? -size * 0.7 : 0)
    .scaleEffect(isLaunching && !reduceMotion ? 0.9 : 1)
    .opacity(isLaunching ? 0 : 1)
    .animation(isLaunching ? Motion.launch : Motion.snappy(), value: isLaunching)
    .contentShape(.rect)
    .gesture(
      TapGesture().onEnded {
        tapCount += 1
        start(.replay)
      },
      including: replaysOnTap ? .all : .subviews
    )
    .sensoryFeedback(.impact(weight: .light), trigger: tapCount)
    .onAppear {
      guard !hasAppeared else { return }
      hasAppeared = true
      if playsTakeoffOnAppear { start(.takeoff) }
    }
    .onChange(of: takeoffTrigger) { start(.takeoff) }
    // Coming back from a launch (sign-in cancelled) takes off again rather than fading in place.
    .onChange(of: isLaunching) { wasLaunching, launching in
      if wasLaunching, !launching { start(.takeoff) }
    }
    .task(id: flight?.id) {
      guard let current = flight else { return }
      try? await Task.sleep(for: .seconds(current.mode.duration + 0.05))
      if flight?.id == current.id { flight = nil }
    }
    .accessibilityHidden(true)
  }

  private func start(_ mode: Flight.Mode) {
    guard !reduceMotion else { return }
    flight = Flight(mode: mode, start: .now)
  }

  private func pose(at date: Date) -> RocketPose {
    if let flight {
      let elapsed = date.timeIntervalSince(flight.start)
      return flight.mode == .takeoff ? .takeoff(at: elapsed) : .replay(at: elapsed)
    }
    // Before the first appearance, hold the takeoff's first frame so the rocket never flashes at rest.
    if playsTakeoffOnAppear, !hasAppeared, !reduceMotion {
      return .takeoff(at: 0)
    }
    return .rest
  }
}

/// The wordmark beside the rocket, as on the web sidebar and sign-in screen.
/// `BrandLockup(size: .large, playsTakeoffOnAppear: true, isLaunching: isSigningIn)`.
struct BrandLockup: View {
  var size: Wordmark.Size = .regular
  var playsTakeoffOnAppear = false
  var isLaunching = false

  var body: some View {
    HStack(spacing: size == .large ? 10 : Spacing.sm) {
      Wordmark(size: size)
      RocketMark(
        size: size == .large ? 40 : 28,
        playsTakeoffOnAppear: playsTakeoffOnAppear,
        isLaunching: isLaunching,
        replaysOnTap: true
      )
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "PCOBooster"))
  }
}

// MARK: - Animation model

private struct Flight: Equatable {
  enum Mode {
    case takeoff
    case replay

    var duration: TimeInterval {
      switch self {
      case .takeoff: Motion.rocketTakeoffDuration
      case .replay: Motion.rocketReplayDuration
      }
    }
  }

  let id = UUID()
  let mode: Mode
  let start: Date
}

/// Where every part of the rocket is at one instant. Offsets are in the logo's 256-unit space.
struct RocketPose: Equatable {
  /// Whole-rocket offset along the screen diagonal, in viewBox units: -15 is down-left, 0 at rest.
  var flight: Double = 0
  var opacity: Double = 1
  /// Exhaust group reveal, 0 (tucked under the hull) to 1.
  var exhaust: Double = 1
  /// Each trail capsule, 0 to 1, top to bottom.
  var trails: [Double] = [1, 1, 1]
  /// Each dot, 0 to 1, top to bottom.
  var dots: [Double] = [1, 1, 1]

  static let rest = RocketPose()

  /// The web's `sidebar-brand-rocket-takeoff` keyframes, per part, each segment on the snappy curve.
  static func takeoff(at seconds: TimeInterval) -> RocketPose {
    let ms = seconds * 1000
    let curve = Motion.snappyCurve
    return RocketPose(
      flight: Keyframes.value(at: ms, [(0, -15), (229.6, 2), (280, 0)], curve: curve),
      opacity: Keyframes.value(at: ms, [(0, 0), (50.4, 1)], curve: curve),
      exhaust: Keyframes.value(at: ms, [(0, 0), (150, 1)], curve: curve),
      trails: [0.0, 12, 24].map { delay in
        Keyframes.value(at: ms, [(delay, 0), (delay + 160, 1)], curve: curve)
      },
      dots: [18.0, 32, 46].map { delay in
        Keyframes.value(at: ms, [(delay, 0), (delay + 170, 1)], curve: curve)
      }
    )
  }

  /// The web's `sidebar-brand-rocket-replay` keyframes (fractions of 340 ms, glide curve).
  static func replay(at seconds: TimeInterval) -> RocketPose {
    let t = seconds / Motion.rocketReplayDuration
    let curve = Motion.glideCurve
    return RocketPose(
      flight: Keyframes.value(at: t, [(0, 0), (0.12, 0), (0.24, -15), (0.84, 2), (1, 0)], curve: curve),
      opacity: 1,
      exhaust: Keyframes.value(at: t, [(0, 1), (0.12, 1), (0.24, 0), (1, 1)], curve: curve),
      trails: [0.28, 0.32, 0.36].map { hold in
        Keyframes.value(at: t, [(0, 1), (0.12, 1), (0.24, 0), (hold, 0), (1, 1)], curve: curve)
      },
      dots: [0.30, 0.34, 0.38].map { hold in
        Keyframes.value(at: t, [(0, 1), (0.12, 1), (0.24, 0), (hold, 0), (1, 1)], curve: curve)
      }
    )
  }
}

/// CSS-style keyframe evaluation: hold before the first stop and after the last, ease each segment.
private enum Keyframes {
  static func value(at time: Double, _ stops: [(Double, Double)], curve: UnitCurve) -> Double {
    guard let first = stops.first, let last = stops.last else { return 0 }
    if time <= first.0 { return first.1 }
    if time >= last.0 { return last.1 }
    for (start, end) in zip(stops, stops.dropFirst()) where time <= end.0 {
      let span = end.0 - start.0
      guard span > 0 else { return end.1 }
      let progress = curve.value(at: (time - start.0) / span)
      return start.1 + (end.1 - start.1) * progress
    }
    return last.1
  }
}

// MARK: - Drawing

/// Draws a `RocketPose` with the logo's transforms: the 168-unit viewBox at (46, 42), the flight
/// offset in screen space, then the rocket group rotated -45 degrees and scaled 1.12 about (128, 128).
struct RocketCanvas: View {
  /// The canvas is larger than the mark so the flight and exhaust can travel past its frame.
  static let overflow: CGFloat = 1.5

  let pose: RocketPose
  let tint: Color

  var body: some View {
    Canvas { context, canvasSize in
      let markSize = canvasSize.width / Self.overflow
      let scale = markSize / 168
      let inset = (canvasSize.width - markSize) / 2
      context.opacity = pose.opacity
      context.translateBy(x: inset, y: inset)
      context.scaleBy(x: scale, y: scale)
      context.translateBy(x: -46 + pose.flight, y: -42 - pose.flight)
      context.translateBy(x: 128, y: 128)
      context.rotate(by: .degrees(-45))
      context.scaleBy(x: 1.12, y: 1.12)
      context.translateBy(x: -128, y: -128)

      let shading = GraphicsContext.Shading.color(tint)
      context.fill(RocketGeometry.body, with: shading)
      drawExhaust(in: context, shading: shading)
    }
  }

  private func drawExhaust(in parent: GraphicsContext, shading: GraphicsContext.Shading) {
    var context = parent
    let reveal = pose.exhaust
    guard reveal > 0 else { return }
    // The group reveals from the hull outward and grows from 30% width, anchored at the hull end.
    let right = RocketGeometry.exhaustRightEdge
    let left = RocketGeometry.exhaustLeftEdge
    context.clip(to: Path(CGRect(x: left + (1 - reveal) * (right - left), y: 0, width: 256, height: 256)))
    context.translateBy(x: (1 - reveal) * 7 * 2.squareRoot() + right, y: 128)
    context.scaleBy(x: 0.3 + 0.7 * reveal, y: 1)
    context.translateBy(x: -right, y: -128)

    for (index, rect) in RocketGeometry.trails.enumerated() {
      let progress = pose.trails[index]
      guard progress > 0 else { continue }
      var trail = context
      trail.opacity = progress
      // Each trail starts tucked toward the hull at a quarter length and extends backward.
      trail.translateBy(x: (1 - progress) * 9 * 2.squareRoot() + rect.maxX, y: rect.midY)
      trail.scaleBy(x: 0.25 + 0.75 * progress, y: 1)
      trail.translateBy(x: -rect.maxX, y: -rect.midY)
      trail.fill(Path(roundedRect: rect, cornerRadius: rect.height / 2), with: shading)
    }

    for (index, dot) in RocketGeometry.dots.enumerated() {
      let progress = pose.dots[index]
      guard progress > 0 else { continue }
      var context = context
      let travel = RocketGeometry.dotTravel[index] * 2.squareRoot()
      let startScale = RocketGeometry.dotStartScale[index]
      let scale = startScale + (1 - startScale) * progress
      context.opacity = progress
      context.translateBy(x: dot.x + (1 - progress) * travel, y: dot.y)
      context.scaleBy(x: scale, y: scale)
      context.fill(Path(ellipseIn: CGRect(x: -6, y: -6, width: 12, height: 12)), with: shading)
    }
  }
}

/// The logo in its unrotated 256-unit frame, nose toward +x.
enum RocketGeometry {
  private nonisolated static func makeHull() -> CGPath {
    let path = CGMutablePath()
    path.move(to: CGPoint(x: 121, y: 103))
    path.addCurve(to: CGPoint(x: 219, y: 122), control1: CGPoint(x: 158, y: 89), control2: CGPoint(x: 196, y: 100))
    path.addQuadCurve(to: CGPoint(x: 219, y: 134), control: CGPoint(x: 225, y: 128))
    path.addCurve(to: CGPoint(x: 121, y: 153), control1: CGPoint(x: 196, y: 156), control2: CGPoint(x: 158, y: 167))
    path.addQuadCurve(to: CGPoint(x: 112, y: 140), control: CGPoint(x: 112, y: 149))
    path.addLine(to: CGPoint(x: 112, y: 116))
    path.addQuadCurve(to: CGPoint(x: 121, y: 103), control: CGPoint(x: 112, y: 107))
    path.closeSubpath()
    return path
  }

  private nonisolated static func makeFins() -> CGPath {
    let path = CGMutablePath()
    path.move(to: CGPoint(x: 150, y: 104))
    path.addCurve(to: CGPoint(x: 118, y: 82), control1: CGPoint(x: 137, y: 90), control2: CGPoint(x: 127, y: 83))
    path.addQuadCurve(to: CGPoint(x: 112, y: 89), control: CGPoint(x: 112, y: 82))
    path.addLine(to: CGPoint(x: 112, y: 104))
    path.closeSubpath()
    path.move(to: CGPoint(x: 150, y: 152))
    path.addCurve(to: CGPoint(x: 118, y: 174), control1: CGPoint(x: 137, y: 166), control2: CGPoint(x: 127, y: 173))
    path.addQuadCurve(to: CGPoint(x: 112, y: 167), control: CGPoint(x: 112, y: 174))
    path.addLine(to: CGPoint(x: 112, y: 152))
    path.closeSubpath()
    return path
  }

  /// Hull minus the window, plus the fins kept 6 units clear of the hull (the logo's two masks).
  nonisolated static let body: Path = {
    let window = CGPath(ellipseIn: CGRect(x: 163, y: 115, width: 26, height: 26), transform: nil)
    let hull = makeHull()
    let clearance = hull.union(hull.copy(strokingWithWidth: 12, lineCap: .butt, lineJoin: .round, miterLimit: 10))
    return Path(hull.subtracting(window).union(makeFins().subtracting(clearance)))
  }()

  nonisolated static let trails = [
    CGRect(x: 71, y: 104, width: 33, height: 12),
    CGRect(x: 65, y: 122, width: 33, height: 12),
    CGRect(x: 71, y: 140, width: 33, height: 12),
  ]
  nonisolated static let dots = [CGPoint(x: 59, y: 110), CGPoint(x: 53, y: 128), CGPoint(x: 59, y: 146)]
  /// How far each dot starts toward the hull (web 10, 13, 16 along the diagonal) and its start scale.
  nonisolated static let dotTravel: [Double] = [10, 13, 16]
  nonisolated static let dotStartScale: [Double] = [0.3, 0.25, 0.2]
  nonisolated static let exhaustLeftEdge: Double = 47
  nonisolated static let exhaustRightEdge: Double = 104
}

#Preview("Rocket") {
  @Previewable @State var isLaunching = false
  @Previewable @State var trigger = 0
  VStack(spacing: Spacing.xxl) {
    BrandLockup(size: .large, playsTakeoffOnAppear: true, isLaunching: isLaunching)
    RocketMark(size: 120, playsTakeoffOnAppear: true, replaysOnTap: true, takeoffTrigger: trigger)
    HStack {
      Button("Takeoff") { trigger += 1 }.buttonStyle(.pill(.secondary))
      Button(isLaunching ? "Reset" : "Launch") { isLaunching.toggle() }.buttonStyle(.pill())
    }
  }
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(.surfaceCanvas)
}
