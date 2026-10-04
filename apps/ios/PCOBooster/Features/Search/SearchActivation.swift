import Observation

/// Asks the Search tab to focus its field: the "Search" keyboard command (⌘F) selects the tab
/// and calls `requestFocus()`, and `SearchHomeView` presents its search field, now or as soon
/// as it first appears. Commands live outside the view tree, so this small shared signal
/// connects them.
@MainActor
@Observable
final class SearchActivation {
  static let shared = SearchActivation()

  private(set) var focusRequest = 0
  @ObservationIgnored private var isPending = false

  func requestFocus() {
    isPending = true
    focusRequest += 1
  }

  /// Whether a focus request is waiting; clears it.
  func consumeRequest() -> Bool {
    defer { isPending = false }
    return isPending
  }
}
