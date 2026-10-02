import PCOBoosterCore
import SwiftUI

/// One person: serving numbers and signals, the month calendar (`month` is `YYYY-MM`, nil for
/// this month) with its schedule, rotation, and blockouts, titled with their name. Paints from
/// what the dashboard already knows, then refines when `people.dashboardPerson` answers.
struct PersonDetailView: View {
  let personId: String
  let month: String?

  @ScreenModel private var model: PersonDetailModel
  @Environment(\.scenePhase) private var scenePhase

  init(personId: String, month: String?) {
    self.personId = personId
    self.month = month
    _model = ScreenModel { app in
      PersonDetailModel(personId: personId, month: month, queries: app.queries)
    }
  }

  var body: some View {
    ScrollView {
      PersonDetailContent(model: model)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xxl)
        .frame(maxWidth: 1100)
        .frame(maxWidth: .infinity)
        .measuresPeopleLayout()
    }
    .background(.surfaceCanvas)
    .refreshable { await model.refresh() }
    .navigationTitle(Text(verbatim: model.name ?? ""))
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        OpenInPlanningCenterButton(personId: personId, name: model.name)
      }
    }
    .onAppear { model.appear() }
    .onDisappear { model.disappear() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { model.appear() }
    }
  }
}

/// The toolbar button that opens a person in Planning Center People.
struct OpenInPlanningCenterButton: View {
  let personId: String
  let name: String?
  @Environment(\.openURL) private var openURL

  var body: some View {
    if let url = PeopleLinks.planningCenterPerson(personId) {
      Button {
        openURL(url)
      } label: {
        Label("Open in Planning Center", symbol: .openExternal)
      }
      .accessibilityLabel(Text("Open \(name ?? "this person") in Planning Center"))
      .accessibilityIdentifier("person-open-planning-center")
    }
  }
}
