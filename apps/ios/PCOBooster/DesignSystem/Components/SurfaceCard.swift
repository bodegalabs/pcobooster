import SwiftUI

/// The solid content surface: `surfaceCard` fill, continuous corners (22 pt on iPhone, 26 pt when
/// wide), a faint hairline ring, and a very soft shadow, like the web `Card`. Content inside sees
/// `surfaceColor == .surfaceCard`, so avatar status cutouts match the card.
///
/// Cards are content, never glass. `SurfaceCard { ... }` or `.surfaceCard()` on any view.
struct SurfaceCard<Content: View>: View {
  enum Padding: Hashable, Sendable {
    /// 16 pt (web phone card spacing).
    case regular
    /// 12 pt for dense cards such as a roster group.
    case compact
    /// No padding, for lists of rows that run edge to edge inside the card.
    case none

    nonisolated var length: CGFloat {
      switch self {
      case .regular: Spacing.lg
      case .compact: Spacing.md
      case .none: 0
      }
    }
  }

  private let padding: Padding
  private let content: Content

  init(padding: Padding = .regular, @ViewBuilder content: () -> Content) {
    self.padding = padding
    self.content = content()
  }

  var body: some View {
    content
      .padding(padding.length)
      .frame(maxWidth: .infinity, alignment: .leading)
      .surfaceCard()
  }
}

extension View {
  /// Puts the view on a card surface without adding padding.
  func surfaceCard() -> some View {
    modifier(SurfaceCardModifier())
  }

  /// The sage canvas behind a screen. On a `List` or `Form` it also hides the system grouped
  /// background, so every screen sits on the brand canvas instead of system gray.
  func canvasBackground() -> some View {
    scrollContentBackground(.hidden).background(.surfaceCanvas)
  }

  /// A `List` row on the card surface (use with `canvasBackground()` on the list), and tells the
  /// row's content it sits on a card so avatar cutouts match.
  func cardRowBackground() -> some View {
    listRowBackground(Color.surfaceCard).environment(\.surfaceColor, .surfaceCard)
  }
}

private struct SurfaceCardModifier: ViewModifier {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.displayScale) private var displayScale

  func body(content: Content) -> some View {
    let shape = RoundedRectangle.card(wide: horizontalSizeClass == .regular)
    content
      .environment(\.surfaceColor, .surfaceCard)
      .background(.surfaceCard, in: shape)
      .clipShape(shape)
      .overlay(shape.strokeBorder(.hairlineSubtle, lineWidth: max(1 / max(displayScale, 1), 0.5)))
      .shadow(color: .black.opacity(colorScheme == .dark ? 0.24 : 0.05), radius: 3, y: 1)
      .containerShape(shape)
  }
}

#Preview("Surface cards") {
  ScrollView {
    VStack(spacing: Spacing.lg) {
      SurfaceCard {
        VStack(alignment: .leading, spacing: Spacing.xs) {
          Text("Readiness").font(.cardTitle)
          Text("3 open positions, 2 people have not replied.").font(.rowDetail).foregroundStyle(.inkSecondary)
        }
      }
      SurfaceCard(padding: .none) {
        VStack(spacing: 0) {
          ForEach(["Taylor Lane", "Hayden Collins", "Quinn Clark"], id: \.self) { name in
            HStack(spacing: Spacing.md) {
              PersonAvatar(name: name, status: .confirmed)
              Text(verbatim: name).font(.rowTitle)
              Spacer()
            }
            .padding(.horizontal, Spacing.lg)
            .frame(minHeight: 52)
            if name != "Quinn Clark" {
              Hairline().padding(.leading, 60)
            }
          }
        }
      }
    }
    .padding(Spacing.lg)
  }
  .background(.surfaceCanvas)
}
