import PCOBoosterCore
import SwiftUI

extension View {
  /// Sends `$screen` with the web route template when this view appears and when `screen`
  /// changes (a plan segment switch). Nil sends nothing. Tab roots and pushed routes are tracked
  /// by the shell; `PlanScreen` tracks its segment.
  func trackScreen(_ screen: AnalyticsScreen?) -> some View {
    modifier(ScreenTrackingModifier(screen: screen))
  }
}

private struct ScreenTrackingModifier: ViewModifier {
  let screen: AnalyticsScreen?
  @Environment(AppModel.self) private var app

  func body(content: Content) -> some View {
    content
      .onAppear { send(screen) }
      .onChange(of: screen) { _, new in send(new) }
  }

  private func send(_ screen: AnalyticsScreen?) {
    guard let screen else { return }
    app.analytics.capture(.screenViewed(screen))
  }
}
