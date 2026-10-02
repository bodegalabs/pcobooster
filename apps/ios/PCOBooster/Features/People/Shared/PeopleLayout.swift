import SwiftUI

/// How much room the People screens have, measured from the content itself (an iPad with the
/// person inspector open is narrower than one without), so cards pick their columns from the
/// width they really get.
nonisolated enum PeopleLayout: Comparable, Sendable {
  /// iPhone, or a narrow iPad column: one column, compact rows.
  case compact
  /// About 600 pt: metric tiles four across, the roster as a table, two attention columns.
  case medium
  /// About 920 pt: three attention columns and side panels.
  case wide

  init(width: CGFloat) {
    switch width {
    case ..<600: self = .compact
    case ..<920: self = .medium
    default: self = .wide
    }
  }
}

extension EnvironmentValues {
  @Entry var peopleLayout: PeopleLayout = .compact
}

extension View {
  /// Measures this view's width and publishes it to its content as `peopleLayout`.
  func measuresPeopleLayout() -> some View {
    modifier(PeopleLayoutReader())
  }
}

private struct PeopleLayoutReader: ViewModifier {
  @State private var layout = PeopleLayout.compact

  func body(content: Content) -> some View {
    content
      .environment(\.peopleLayout, layout)
      .onGeometryChange(for: PeopleLayout.self) { proxy in
        PeopleLayout(width: proxy.size.width)
      } action: { newValue in
        layout = newValue
      }
  }
}

/// Glyphs the People screens use that the shared `AppSymbol` set does not have yet.
enum PeopleGlyph {
  /// Blockouts: dates someone can't serve.
  static let blockout = "calendar.badge.minus"
  /// The roster's sort menu.
  static let sort = "arrow.up.arrow.down"
  /// Teams I lead in the scope menu.
  static let ledTeams = "star"
  /// All teams in the scope menu.
  static let allTeams = "person.3"
  /// One team in the scope menu.
  static let team = "person.2"
  /// Opens the person as a full page from the iPad inspector.
  static let fullPage = "arrow.up.left.and.arrow.down.right"
  /// The month card and the heatmap.
  static let month = "calendar"
  /// The "Who serves when" matrix.
  static let matrix = "tablecells"
  /// Rotation: when someone serves.
  static let rotation = "clock.arrow.trianglehead.counterclockwise.rotate.90"
}
