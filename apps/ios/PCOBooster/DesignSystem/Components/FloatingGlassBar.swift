import SwiftUI

/// A floating group of Liquid Glass buttons over content, such as the run sheet's add bar.
/// Buttons share one `GlassEffectContainer`, so neighbors blend, and each carries a
/// `glassEffectID`, so adding or removing buttons inside `withAnimation` morphs the glass
/// instead of popping. Control layer only; never put this inside a card.
///
/// ```swift
/// List { ... }
///   .floatingGlassBar(alignment: .trailing) {
///     if isAdding {
///       FloatingGlassButton("Header", symbol: .header, id: "header") { addHeader() }
///       FloatingGlassButton("Song", symbol: .song, id: "song") { addSong() }
///     }
///     FloatingGlassButton(isAdding ? "Close" : "Add", symbol: isAdding ? .close : .add, id: "toggle",
///                         showsTitle: false, isProminent: !isAdding) {
///       withAnimation(.bouncy) { isAdding.toggle() }
///     }
///   }
/// ```
struct FloatingGlassBar<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content
  @Namespace private var namespace

  init(spacing: CGFloat = Spacing.sm + 2, @ViewBuilder content: () -> Content) {
    self.spacing = spacing
    self.content = content()
  }

  var body: some View {
    // Blend only closer than half the gap: separate capsules at rest, liquid while they morph.
    GlassEffectContainer(spacing: spacing / 2) {
      HStack(spacing: spacing) {
        content
      }
    }
    .environment(\.floatingGlassNamespace, namespace)
  }
}

/// A glass button for `FloatingGlassBar`. Icon and title by default, icon-only with
/// `showsTitle: false` (the title stays the VoiceOver label). `isProminent` tints it ink for the
/// one primary action. `id` must be stable and unique within the bar; it drives the morph.
struct FloatingGlassButton: View {
  private let title: Text
  private let symbol: AppSymbol
  private let id: String
  private let showsTitle: Bool
  private let isProminent: Bool
  private let action: () -> Void

  @Environment(\.floatingGlassNamespace) private var namespace

  init(
    _ title: LocalizedStringKey,
    symbol: AppSymbol,
    id: String,
    showsTitle: Bool = true,
    isProminent: Bool = false,
    action: @escaping () -> Void
  ) {
    self.title = Text(title)
    self.symbol = symbol
    self.id = id
    self.showsTitle = showsTitle
    self.isProminent = isProminent
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.sm) {
        symbol.image
          .font(.body.weight(.semibold))
          .contentTransition(.symbolEffect(.replace))
        if showsTitle {
          title.font(.body.weight(.medium))
        }
      }
      .padding(.horizontal, showsTitle ? Spacing.lg + 2 : 0)
      .frame(minWidth: 50, minHeight: 50)
      .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .foregroundStyle(isProminent ? Color.onInkFill : Color.ink)
    .glassEffect(isProminent ? .regular.tint(.inkFill).interactive() : .regular.interactive(), in: .capsule)
    .modifier(GlassMorphID(id: id, namespace: namespace))
    .accessibilityLabel(title)
  }
}

private struct GlassMorphID: ViewModifier {
  let id: String
  let namespace: Namespace.ID?

  func body(content: Content) -> some View {
    if let namespace {
      content.glassEffectID(id, in: namespace)
    } else {
      content
    }
  }
}

extension EnvironmentValues {
  /// The glass morph namespace of the enclosing `FloatingGlassBar`.
  @Entry var floatingGlassNamespace: Namespace.ID?
}

extension View {
  /// Floats a `FloatingGlassBar` at the bottom edge, above the home indicator. Uses `safeAreaBar`
  /// so scroll content can reach the last row and fades under the bar.
  func floatingGlassBar(
    alignment: HorizontalAlignment = .center,
    @ViewBuilder _ content: () -> some View
  ) -> some View {
    safeAreaBar(edge: .bottom, alignment: alignment, spacing: 0) {
      FloatingGlassBar(content: content)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.sm)
    }
  }
}

#Preview("Floating glass bar") {
  @Previewable @State var isAdding = false
  List(0..<30, id: \.self) { index in
    Text(verbatim: "Plan item \(index + 1)")
  }
  .floatingGlassBar(alignment: .trailing) {
    if isAdding {
      FloatingGlassButton("Header", symbol: .header, id: "header") {}
      FloatingGlassButton("Song", symbol: .song, id: "song") {}
    }
    FloatingGlassButton(isAdding ? "Close" : "Add", symbol: isAdding ? .close : .add, id: "toggle", showsTitle: false, isProminent: !isAdding) {
      withAnimation(.bouncy) { isAdding.toggle() }
    }
  }
}
