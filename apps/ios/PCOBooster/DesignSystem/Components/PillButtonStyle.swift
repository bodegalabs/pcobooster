import SwiftUI

/// Capsule buttons for the content layer (inside cards, rows, and empty states), matching the web
/// button variants: `.primary` is the ink pill, `.secondary` a quiet sage fill, `.outline` a
/// hairline capsule (the web's "Add" buttons), `.destructive` red text on a soft red fill.
///
/// On the control layer (toolbars, floating bars, sheet bottom actions) the system glass styles
/// are more native; `.actionStyle(_:)` picks glass there and pills in content.
///
/// Press feedback moves the button, never its color (colors change instantly). Disabled is 50% opacity.
struct PillButtonStyle: ButtonStyle {
  enum Kind: Hashable, Sendable {
    case primary
    case secondary
    case outline
    case destructive
  }

  enum Size: Hashable, Sendable {
    /// 28 pt, inline row actions (web `size="sm"` to `xs`).
    case small
    /// 36 pt (web default `h-9`).
    case regular
    /// 50 pt, full width bottom actions on iPhone.
    case large

    nonisolated var minHeight: CGFloat {
      switch self {
      case .small: 28
      case .regular: 36
      case .large: Metrics.bottomActionHeight
      }
    }

    nonisolated var horizontalPadding: CGFloat {
      switch self {
      case .small: Spacing.md
      case .regular: Spacing.lg
      case .large: Spacing.xl
      }
    }

    nonisolated var font: Font {
      switch self {
      case .small: .subheadline.weight(.medium)
      case .regular: .subheadline.weight(.medium)
      case .large: .body.weight(.semibold)
      }
    }
  }

  var kind: Kind = .primary
  var size: Size = .regular

  func makeBody(configuration: Configuration) -> some View {
    PillButton(configuration: configuration, kind: kind, size: size)
  }
}

private struct PillButton: View {
  let configuration: ButtonStyleConfiguration
  let kind: PillButtonStyle.Kind
  let size: PillButtonStyle.Size

  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.displayScale) private var displayScale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let role = configuration.role
    let effectiveKind: PillButtonStyle.Kind = role == .destructive && kind != .primary ? .destructive : kind
    configuration.label
      .font(size.font)
      .lineLimit(1)
      .labelStyle(PillLabelStyle())
      .foregroundStyle(foreground(effectiveKind))
      .padding(.horizontal, size.horizontalPadding)
      .frame(minHeight: size.minHeight)
      .background(background(effectiveKind), in: .capsule)
      .overlay {
        if effectiveKind == .outline {
          Capsule().strokeBorder(.hairline, lineWidth: 1 / max(displayScale, 1))
        }
      }
      .contentShape(.capsule)
      .opacity(isEnabled ? 1 : 0.5)
      // Only the press movement animates; the pressed fill changes instantly.
      .animation(reduceMotion ? nil : Motion.snappy(0.15)) { content in
        content
          .offset(y: configuration.isPressed ? 1 : 0)
          .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
      }
  }

  private func foreground(_ kind: PillButtonStyle.Kind) -> Color {
    switch kind {
    case .primary: .onInkFill
    case .secondary, .outline: .ink
    case .destructive: .destructive
    }
  }

  private func background(_ kind: PillButtonStyle.Kind) -> Color {
    switch kind {
    case .primary: configuration.isPressed ? Color.inkFill.opacity(0.85) : .inkFill
    case .secondary: configuration.isPressed ? .surfaceHighlight : .surfaceSecondary
    case .outline: configuration.isPressed ? .surfaceHighlight : .clear
    case .destructive: Color.destructive.opacity(configuration.isPressed ? 0.2 : 0.1)
    }
  }
}

/// Icon and title with the web's tight 6 pt gap.
private struct PillLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 6) {
      configuration.icon.imageScale(.small)
      configuration.title
    }
  }
}

extension ButtonStyle where Self == PillButtonStyle {
  /// `Button("Add") {}.buttonStyle(.pill(.outline, size: .small))`.
  static func pill(_ kind: PillButtonStyle.Kind = .primary, size: PillButtonStyle.Size = .regular) -> PillButtonStyle {
    PillButtonStyle(kind: kind, size: size)
  }
}

/// Where a button lives, which decides between a solid pill and Liquid Glass.
enum ButtonLayer: Hashable, Sendable {
  /// Inside content: cards, rows, empty states. Solid pills.
  case content
  /// Floating over content: toolbars, floating bars, sheet bottom actions. Glass.
  case control
}

/// Liquid Glass buttons for the control layer that respect the button's role: prominent actions
/// use `.glassProminent` tinted ink, others `.glass`. A destructive role (or `isDestructive`)
/// always gets destructive text on plain glass, never a prominent red slab, and a cancel role is
/// never prominent.
struct GlassActionButtonStyle: PrimitiveButtonStyle {
  var isProminent: Bool
  var isDestructive = false

  func makeBody(configuration: Configuration) -> some View {
    let destructive = isDestructive || configuration.role == .destructive
    if isProminent, !destructive, configuration.role != .cancel {
      // The ink tint flips light in dark mode, so the label follows `onInkFill` rather than white.
      Button(configuration)
        .buttonStyle(.glassProminent)
        .tint(.inkFill)
        .foregroundStyle(.onInkFill)
        .buttonBorderShape(.capsule)
    } else {
      Button(configuration)
        .buttonStyle(.glass)
        .tint(destructive ? .destructive : .ink)
        .buttonBorderShape(.capsule)
    }
  }
}

extension View {
  /// The product's button styling for `kind` on `layer`: `PillButtonStyle` in content,
  /// `GlassActionButtonStyle` on the control layer (primary is prominent ink glass).
  @ViewBuilder
  func actionStyle(_ kind: PillButtonStyle.Kind, layer: ButtonLayer = .content, size: PillButtonStyle.Size = .regular) -> some View {
    switch layer {
    case .content:
      buttonStyle(.pill(kind, size: size))
    case .control:
      buttonStyle(GlassActionButtonStyle(isProminent: kind == .primary, isDestructive: kind == .destructive))
    }
  }
}

#Preview("Pill buttons") {
  VStack(spacing: Spacing.md) {
    HStack {
      Button("Confirm") {}.buttonStyle(.pill())
      Button("Skip") {}.buttonStyle(.pill(.secondary))
      Button("Add", systemImage: "calendar.badge.plus") {}.buttonStyle(.pill(.outline, size: .small))
    }
    HStack {
      Button("Remove", role: .destructive) {}.buttonStyle(.pill(.destructive))
      Button("Disabled") {}.buttonStyle(.pill()).disabled(true)
    }
    Button("Add to plan") {}.actionStyle(.primary, layer: .control).controlSize(.large)
    Button("Remove", role: .destructive) {}.actionStyle(.destructive, layer: .control).controlSize(.large)
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
