import SwiftUI

/// Spacing on a 4 pt grid (the web's Tailwind spacing). Screen gutters are `lg` (16).
enum Spacing {
  nonisolated static let xxs: CGFloat = 2
  nonisolated static let xs: CGFloat = 4
  nonisolated static let sm: CGFloat = 8
  nonisolated static let md: CGFloat = 12
  nonisolated static let lg: CGFloat = 16
  nonisolated static let xl: CGFloat = 20
  nonisolated static let xxl: CGFloat = 24
  nonisolated static let xxxl: CGFloat = 32
  nonisolated static let huge: CGFloat = 48
}

/// Corner radii from the web scale (`--radius` 10 px: sm 6, md 8, lg 10, xl 14, 2xl 18, 3xl 22,
/// 4xl 26). Always continuous corners. Buttons and badges are capsules.
enum Radius {
  /// Month grid days, focus outlines.
  nonisolated static let small: CGFloat = 6
  /// Chips with square corners, such as the key badge.
  nonisolated static let medium: CGFloat = 8
  /// Controls and skeleton controls.
  nonisolated static let control: CGFloat = 10
  /// Plan date tile.
  nonisolated static let tile: CGFloat = 14
  /// Panels nested inside cards; skeleton blocks.
  nonisolated static let inner: CGFloat = 18
  /// Cards on iPhone (web `max-md:rounded-3xl`).
  nonisolated static let card: CGFloat = 22
  /// Cards on iPad and wide layouts (web `rounded-4xl`).
  nonisolated static let cardWide: CGFloat = 26
}

/// Fixed sizes shared by components.
enum Metrics {
  /// Minimum tap target and row height.
  nonisolated static let minimumTapTarget: CGFloat = 44
  /// Status dot diameter (web `size-2.5`).
  nonisolated static let statusDot: CGFloat = 10
  /// Ring around a status dot that cuts it out of the avatar (web `ring-2`).
  nonisolated static let statusDotRing: CGFloat = 2
  /// Thickness of a capsule meter (fit score, people meters, progress).
  nonisolated static let meterHeight: CGFloat = 4
  /// Full-width bottom action height on iPhone (web `h-11`).
  nonisolated static let bottomActionHeight: CGFloat = 50
}

extension Shape where Self == RoundedRectangle {
  /// Card corners for the current width: 22 on iPhone, 26 when wide.
  nonisolated static func card(wide: Bool = false) -> RoundedRectangle {
    RoundedRectangle(cornerRadius: wide ? Radius.cardWide : Radius.card, style: .continuous)
  }

  /// Plan date tile corners.
  nonisolated static var tile: RoundedRectangle {
    RoundedRectangle(cornerRadius: Radius.tile, style: .continuous)
  }

  /// Panel corners for content nested inside a card.
  nonisolated static var inner: RoundedRectangle {
    RoundedRectangle(cornerRadius: Radius.inner, style: .continuous)
  }
}

extension Shape where Self == ConcentricRectangle {
  /// Corners concentric with the enclosing container (a sheet, a card, the display), never tighter
  /// than `minimum`. Use for content that sits flush inside a sheet or glass panel.
  nonisolated static func concentric(minimum: CGFloat = Radius.control) -> ConcentricRectangle {
    ConcentricRectangle(corners: .concentric(minimum: .fixed(minimum)), isUniform: true)
  }
}

/// A one-pixel line in the hairline color, horizontal by default. Unlike `Divider`, it keeps the
/// sage hairline token in both appearances and is exactly one device pixel thick.
struct Hairline: View {
  enum Axis {
    case horizontal
    case vertical
  }

  var axis: Axis = .horizontal
  var color: Color = .hairline
  @Environment(\.displayScale) private var displayScale

  var body: some View {
    let thickness = 1 / max(displayScale, 1)
    switch axis {
    case .horizontal:
      Rectangle().fill(color).frame(height: thickness).frame(maxWidth: .infinity)
    case .vertical:
      Rectangle().fill(color).frame(width: thickness).frame(maxHeight: .infinity)
    }
  }
}

extension View {
  /// A one-pixel hairline outline in the shape's outline. Used by outlined chips and inputs.
  func hairlineBorder(_ shape: some InsettableShape, color: Color = .hairline) -> some View {
    modifier(HairlineBorder(shape: shape, color: color))
  }
}

private struct HairlineBorder<S: InsettableShape>: ViewModifier {
  let shape: S
  let color: Color
  @Environment(\.displayScale) private var displayScale

  func body(content: Content) -> some View {
    let thickness = 1 / max(displayScale, 1)
    content.overlay(shape.strokeBorder(color, lineWidth: thickness))
  }
}
