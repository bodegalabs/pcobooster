import SwiftUI

/// A loading placeholder with the web's choreography: invisible for the first 120 ms so fast
/// loads never flash, a 240 ms fade in, then a soft shimmer sweep every 1.6 s. Reduce Motion
/// keeps the delayed fade and drops the sweep. Replace it with content using `Motion.reveal`.
///
/// `Skeleton(.text, width: 140)`, `Skeleton(.round, width: 32, height: 32)`, `Skeleton(.block, height: 120)`.
struct Skeleton: View {
  enum Shape: Hashable, Sendable {
    /// Cards, panels, and other large surfaces.
    case block
    /// Buttons, inputs, and calendar cells.
    case control
    /// A single line of text.
    case text
    /// Avatars, dots, and capsule badges.
    case round
  }

  private let shape: Shape
  private let width: CGFloat?
  private let height: CGFloat?

  @State private var isVisible = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.surfaceColor) private var surfaceColor

  init(_ shape: Shape = .block, width: CGFloat? = nil, height: CGFloat? = nil) {
    self.shape = shape
    self.width = width
    self.height = height
  }

  var body: some View {
    Rectangle()
      .fill(.surfaceMuted)
      .overlay {
        if isVisible, !reduceMotion {
          shimmer
        }
      }
      .clipShape(clipShape)
      .frame(width: width, height: height ?? defaultHeight)
      .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
      .opacity(isVisible ? 1 : 0)
      .task {
        try? await Task.sleep(for: .seconds(Motion.skeletonDelay))
        withAnimation(.timingCurve(Motion.snappyCurve, duration: Motion.skeletonFadeDuration)) {
          isVisible = true
        }
      }
      .accessibilityHidden(true)
  }

  private var defaultHeight: CGFloat {
    switch shape {
    case .block: 96
    case .control: 36
    case .text: 12
    case .round: 32
    }
  }

  private var clipShape: AnyShape {
    switch shape {
    case .block: AnyShape(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous))
    case .control: AnyShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
    case .text: AnyShape(RoundedRectangle(cornerRadius: Radius.small, style: .continuous))
    case .round: AnyShape(Capsule())
    }
  }

  private var shimmer: some View {
    GeometryReader { proxy in
      let width = proxy.size.width
      TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
        let progress = Self.sweepProgress(at: context.date)
        // The highlight's center travels from half a width left of the view to half a width right.
        let center = -0.5 * width + progress * 2 * width
        LinearGradient(
          stops: [
            .init(color: .clear, location: 0.2),
            .init(color: surfaceColor.opacity(0.55), location: 0.5),
            .init(color: .clear, location: 0.8),
          ],
          startPoint: .leading,
          endPoint: .trailing
        )
        .frame(width: width * 2)
        .offset(x: center - width)
      }
    }
  }

  /// Eased 0 to 1 position within the shared sweep, so every skeleton shimmers in step.
  nonisolated static func sweepProgress(at date: Date) -> Double {
    let period = Motion.skeletonSweepPeriod
    let t = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
    return Motion.sweepCurve.value(at: t)
  }
}

/// A placeholder for a person or song row: a round avatar and two text lines.
struct SkeletonRow: View {
  var showsAvatar = true
  var titleWidth: CGFloat = 140
  var detailWidth: CGFloat = 90

  var body: some View {
    HStack(spacing: Spacing.md) {
      if showsAvatar {
        Skeleton(.round, width: PersonAvatar.Size.regular.diameter, height: PersonAvatar.Size.regular.diameter)
      }
      VStack(alignment: .leading, spacing: Spacing.sm) {
        Skeleton(.text, width: titleWidth, height: 12)
        Skeleton(.text, width: detailWidth, height: 10)
      }
      Spacer(minLength: 0)
    }
    .frame(minHeight: Metrics.minimumTapTarget + Spacing.sm)
  }
}

#Preview("Skeletons") {
  VStack(alignment: .leading, spacing: Spacing.lg) {
    Skeleton(.block, height: 120)
    SurfaceCard {
      VStack(spacing: 0) {
        SkeletonRow()
        SkeletonRow(titleWidth: 110, detailWidth: 70)
        SkeletonRow(titleWidth: 160, detailWidth: 100)
      }
    }
    HStack {
      Skeleton(.control, width: 96)
      Skeleton(.round, width: 64, height: 22)
    }
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
