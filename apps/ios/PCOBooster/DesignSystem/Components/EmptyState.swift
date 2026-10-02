import SwiftUI

/// An empty or unavailable state built on `ContentUnavailableView`, styled for the product:
/// a quiet symbol in secondary ink (or the rocket for "all set" moments), a short title, one
/// line of description, and at most one or two actions. Few words (low-noise rule).
///
/// ```swift
/// EmptyState("No open positions", symbol: .readiness, description: "Everyone has a spot this Sunday.")
/// EmptyState("Couldn't load the lineup", symbol: .alert, description: message) {
///   Button("Try again") { retry() }.buttonStyle(.pill(.secondary))
/// }
/// ```
struct EmptyState<Actions: View>: View {
  enum Artwork {
    case symbol(AppSymbol)
    /// The brand rocket, for celebratory or onboarding states.
    case rocket
  }

  private let title: Text
  private let artwork: Artwork
  private let description: Text?
  private let actions: Actions

  init(
    _ title: LocalizedStringKey,
    symbol: AppSymbol,
    description: LocalizedStringKey? = nil,
    @ViewBuilder actions: () -> Actions
  ) {
    self.title = Text(title)
    artwork = .symbol(symbol)
    self.description = description.map { Text($0) }
    self.actions = actions()
  }

  init(
    _ title: LocalizedStringKey,
    artwork: Artwork,
    description: Text?,
    @ViewBuilder actions: () -> Actions
  ) {
    self.title = Text(title)
    self.artwork = artwork
    self.description = description
    self.actions = actions()
  }

  var body: some View {
    ContentUnavailableView {
      VStack(spacing: Spacing.md) {
        artworkView
        title
          .font(.cardTitle)
          .foregroundStyle(.ink)
      }
    } description: {
      if let description {
        description
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
    } actions: {
      actions
    }
  }

  @ViewBuilder private var artworkView: some View {
    switch artwork {
    case .symbol(let symbol):
      symbol.image
        .font(.system(size: 28, weight: .regular))
        .foregroundStyle(.inkSecondary)
        .frame(width: 56, height: 56)
        .background(.surfaceMuted, in: .rect(cornerRadius: Radius.tile, style: .continuous))
        .accessibilityHidden(true)
    case .rocket:
      RocketMark(size: 56)
        .accessibilityHidden(true)
    }
  }
}

extension EmptyState where Actions == EmptyView {
  init(_ title: LocalizedStringKey, symbol: AppSymbol, description: LocalizedStringKey? = nil) {
    self.init(title, symbol: symbol, description: description) { EmptyView() }
  }

  init(_ title: LocalizedStringKey, artwork: Artwork, description: Text? = nil) {
    self.init(title, artwork: artwork, description: description) { EmptyView() }
  }
}

#Preview("Empty states") {
  VStack {
    EmptyState("No open positions", symbol: .readiness, description: "Everyone has a spot this Sunday.")
    EmptyState("Couldn't load the lineup", symbol: .alert, description: "Check your connection and try again.") {
      Button("Try again") {}.buttonStyle(.pill(.secondary))
    }
  }
  .background(.surfaceCanvas)
}
