import PCOBoosterCore
import SwiftUI

/// The window's root: the splash, the sign-in screen, or the app, with the app-wide environment
/// (model, router, org time zone, clock), error toasts, the offline banner, the appearance
/// override, deep links, and foreground refresh.
struct AppRootView: View {
  let app: AppModel
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      switch screen {
      case .launch:
        LaunchView()
          .transition(.opacity)
      case .signIn:
        SignInView()
          .transition(.opacity)
      case .main:
        MainView()
          // A new account context rebuilds every screen, so nothing from the last one lingers.
          .id(app.queries.scope)
          .transition(
            reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 1.02)))
      }
    }
    .animation(
      Motion.respecting(reduceMotion: reduceMotion, .smooth(duration: 0.45)), value: screen
    )
    .environment(app)
    .environment(app.router)
    .environment(\.orgTimeZone, app.timeZone)
    .environment(\.appClock, app.clock)
    .errorToasts(app.toasts)
    // The catalog accent is ink; UIKit-backed chrome (the tab bar after a push) needs it explicitly.
    .tint(.ink)
    .preferredColorScheme(app.appearance.colorScheme)
    .task { await app.launch() }
    .onOpenURL { url in app.open(url) }
    .onChange(of: scenePhase) { _, phase in app.scenePhaseChanged(phase) }
    .alert(
      "Open the demo?",
      isPresented: Binding(
        get: { app.pendingDemoKey != nil },
        set: { if !$0 { app.pendingDemoKey = nil } })
    ) {
      Button("Open Demo") {
        if let key = app.pendingDemoKey {
          Task { await app.openDemo(key: key) }
        }
      }
      Button("Cancel", role: .cancel) { app.pendingDemoKey = nil }
    } message: {
      Text("You'll stay signed in. Exit the demo from your account to come back.")
    }
  }

  private enum Screen: Hashable {
    case launch
    case signIn
    case main
  }

  private var screen: Screen {
    switch app.state {
    case .launching: .launch
    case .signedOut, .signingIn: .signIn
    case .signedIn, .demo: .main
    }
  }
}

extension View {
  /// Floats the offline notice at the bottom of the screen (above the tab bar) while the device
  /// has no network, clear of large titles and error toasts. The shell applies it to every tab
  /// root, pushed route, and the sign-in screen.
  func offlineBanner() -> some View {
    modifier(OfflineBannerModifier())
  }
}

private struct OfflineBannerModifier: ViewModifier {
  @Environment(AppModel.self) private var app
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .safeAreaBar(edge: .bottom, spacing: 0) {
        if app.network.isOffline {
          OfflineBanner()
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
      }
      .animation(
        Motion.respecting(reduceMotion: reduceMotion, .snappy), value: app.network.isOffline)
  }
}

/// Shown when the device has no network path. Cached screens stay usable; writes fail with an
/// error toast.
struct OfflineBanner: View {
  var body: some View {
    Label("You're offline. Showing saved data.", systemImage: "wifi.slash")
      .font(.meta.weight(.medium))
      .foregroundStyle(.ink)
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.sm)
      .glassEffect(.regular, in: .capsule)
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.sm)
      .frame(maxWidth: .infinity)
      .accessibilityElement(children: .combine)
  }
}

/// A configuration problem at launch (a broken build setting). Release builds never get here.
struct ConfigurationErrorView: View {
  let error: AppConfigurationError

  var body: some View {
    EmptyState(
      "PCOBooster can't start",
      artwork: .symbol(.alert),
      description: Text(verbatim: error.description)
    ) {}
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.surfaceCanvas)
  }
}
