import PCOBoosterCore
import SwiftUI

/// The Search tab (`Tab(role: .search)`): one field across plans, people, and songs.
///
/// - Plans match on every keystroke against the catalog the Services agenda uses (same rule as
///   its search field). People (`people.search`, two characters or more, with People access)
///   and songs (`songs.search`) go to the server once typing settles.
/// - Before typing: recent searches and the plans coming up next.
/// - Results open inside this tab; flags decide the destination (see `SearchOpener`).
/// - ⌘F focuses the field from anywhere (`SearchActivation`).
struct SearchHomeView: View {
  @ScreenModel private var model: SearchModel
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @State private var isSearchPresented = false

  init() {
    _model = ScreenModel { app in SearchModel(queries: app.queries) }
  }

  var body: some View {
    @Bindable var model = model
    let opener = SearchOpener(app: app, router: router, model: model)
    let canSearchPeople = app.capabilities.canSearchPeople
    Group {
      if model.isSearching {
        SearchResultsList(
          model: model, opener: opener, canSearchPeople: canSearchPeople,
          peopleAccess: AccessReview(app: app).features.first { $0.feature == .peopleSearch })
      } else {
        SearchSuggestionsList(model: model, opener: opener)
      }
    }
    .background(.surfaceCanvas)
    .navigationTitle("Search")
    .searchable(
      text: $model.text, isPresented: $isSearchPresented, prompt: Text("Plans, people, and songs")
    )
    .searchScopes($model.scope, activation: .onSearchPresentation) {
      ForEach(SearchScope.allCases) { scope in
        Text(scope.title).tag(scope)
      }
    }
    .onSubmit(of: .search) {
      model.recents.add(.query(model.trimmedText))
      model.settle(canSearchPeople: canSearchPeople)
    }
    .refreshable { await model.refresh() }
    .task(id: model.text) {
      guard model.isSearching else {
        model.settle(canSearchPeople: canSearchPeople)
        return
      }
      do {
        try await Task.sleep(for: SearchModel.settleDelay)
      } catch {
        return
      }
      model.settle(canSearchPeople: canSearchPeople)
    }
    .onChange(of: canSearchPeople) { _, allowed in
      model.settle(canSearchPeople: allowed)
    }
    .onChange(of: model.catalog.serviceTypes.value) {
      model.catalog.syncPlans()
    }
    .onChange(of: SearchActivation.shared.focusRequest) {
      if SearchActivation.shared.consumeRequest() { isSearchPresented = true }
    }
    .onAppear {
      model.appear()
      if SearchActivation.shared.consumeRequest() { isSearchPresented = true }
    }
    .onDisappear { model.disappear() }
    .haptic(.selection, trigger: model.scope)
  }
}
