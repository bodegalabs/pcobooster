import PCOBoosterCore
import SwiftUI

extension View {
  /// The one `navigationDestination` for `AppRoute`. Every tab's stack applies it at its root,
  /// so each route maps to the same screen wherever it is pushed.
  func appRouteDestinations() -> some View {
    navigationDestination(for: AppRoute.self) { route in
      AppRouteDestination(route: route)
    }
  }
}

/// Maps a route to its screen, behind its feature flag, and sends its screen event.
struct AppRouteDestination: View {
  let route: AppRoute
  @Environment(AppModel.self) private var app

  var body: some View {
    Group {
      if let flag = route.requiredFeature, !app.capabilities.isEnabled(flag) {
        FeatureUnavailableView()
      } else {
        screen
      }
    }
    .trackScreen(route.analyticsScreen)
    .offlineBanner()
  }

  @ViewBuilder private var screen: some View {
    switch route {
    case .plan(let plan):
      PlanScreen(route: plan)
    case .assign(let plan, let teamId, let positionId):
      AssignView(route: plan, teamId: teamId, positionId: positionId)
    case .person(let id, let month):
      PersonDetailView(personId: id, month: month)
    case .song(let id):
      SongDetailView(songId: id)
    case .chordChart(let songId, let arrangementId):
      ChordChartEditorView(songId: songId, arrangementId: arrangementId)
    }
  }
}

/// A pushed screen whose feature is off for this account (the web's not-found page).
struct FeatureUnavailableView: View {
  @Environment(AppRouter.self) private var router

  var body: some View {
    EmptyState(
      "Not available",
      symbol: .locked,
      description: "This page doesn't exist, or it isn't available to you."
    ) {
      Button("Go to Services") {
        router.show(.services)
      }
      .buttonStyle(.pill(.secondary))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.surfaceCanvas)
  }
}
