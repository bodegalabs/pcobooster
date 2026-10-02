import PCOBoosterCore
import SwiftUI

/// The signed-in app: the tabs (or the no-access notice) and the account sheet.
struct MainView: View {
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Namespace private var accountTransition

  var body: some View {
    Group {
      if app.capabilities.hasNoServicesAccess {
        NoServicesAccessView()
      } else {
        MainTabView()
      }
    }
    .environment(\.accountTransitionNamespace, accountTransition)
    .sheet(isPresented: accountSheetBinding) {
      AccountSheet()
        .navigationTransition(
          .zoom(sourceID: AccountToolbarItem.transitionID(router.accountSheetTab), in: accountTransition))
    }
  }

  private var accountSheetBinding: Binding<Bool> {
    Binding(
      get: { router.accountSheetTab != nil },
      set: { if !$0 { router.dismissAccount() } })
  }
}

/// The root `TabView`: Services, People and Songs (when their flags are on), and Search. On iPad
/// it adapts to a sidebar headed by the brand lockup.
struct MainTabView: View {
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router

  var body: some View {
    @Bindable var router = router
    let visible = app.visibleTabs
    TabView(selection: $router.selectedTab) {
      Tab(value: AppTab.services) {
        TabStack(tab: .services) { ServicesHomeView() }
      } label: {
        TabLabel(tab: .services)
      }
      if visible.contains(.people) {
        Tab(value: AppTab.people) {
          TabStack(tab: .people) { PeopleHomeView() }
        } label: {
          TabLabel(tab: .people)
        }
      }
      if visible.contains(.songs) {
        Tab(value: AppTab.songs) {
          TabStack(tab: .songs) { SongsHomeView() }
        } label: {
          TabLabel(tab: .songs)
        }
      }
      Tab(value: AppTab.search, role: .search) {
        TabStack(tab: .search) { SearchHomeView() }
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    .tabBarMinimizeBehavior(.onScrollDown)
    .tabViewSidebarHeader {
      BrandLockup()
        .padding(.vertical, Spacing.xs)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .openPlanAccessory()
    .onChange(of: visible) { _, tabs in router.ensureVisible(tabs) }
    .onAppear { router.ensureVisible(visible) }
  }
}

private struct TabLabel: View {
  let tab: AppTab

  var body: some View {
    Label {
      Text(tab.title)
    } icon: {
      tab.symbol.image
    }
  }
}

/// One tab's `NavigationStack`, bound to the router, with the shared route destinations, the
/// account button, and the root's screen event.
struct TabStack<Root: View>: View {
  let tab: AppTab
  @ViewBuilder let root: Root
  @Environment(AppRouter.self) private var router
  @Environment(\.accountTransitionNamespace) private var accountTransition
  @Namespace private var localTransition

  var body: some View {
    NavigationStack(path: router.binding(for: tab)) {
      root
        .toolbar { AccountToolbarItem(tab: tab, namespace: accountTransition ?? localTransition) }
        .trackScreen(tab.analyticsScreen)
        .offlineBanner()
        .appRouteDestinations()
    }
  }
}

/// Shown instead of the app when the account can't open Planning Center Services at all.
struct NoServicesAccessView: View {
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.accountTransitionNamespace) private var accountTransition
  @Namespace private var localTransition

  var body: some View {
    NavigationStack {
      EmptyState(
        "Your account can't open Planning Center Services",
        artwork: .symbol(.locked),
        description: Text(
          "pcobooster.com works on top of Services, so there's nothing to show yet. Ask a Planning Center admin to give you access to Services, then come back."
        )
      ) {
        if !app.capabilities.isDemo {
          Button("Use a different account") {
            router.accountSheetTab = .services
          }
          .buttonStyle(.pill(.secondary))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.surfaceCanvas)
      .toolbar {
        AccountToolbarItem(tab: .services, namespace: accountTransition ?? localTransition)
      }
    }
  }
}
