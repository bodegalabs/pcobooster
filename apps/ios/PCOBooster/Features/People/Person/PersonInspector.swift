import PCOBoosterCore
import SwiftUI

/// The person beside the dashboard on iPad, in the trailing inspector column: the same detail
/// as the pushed page in one column, with Close, Open as a page, and Open in Planning Center.
struct PersonInspector: View {
  let personId: String
  let onClose: () -> Void

  @ScreenModel private var model: PersonDetailModel
  @Environment(AppRouter.self) private var router

  init(personId: String, onClose: @escaping () -> Void) {
    self.personId = personId
    self.onClose = onClose
    _model = ScreenModel { app in
      PersonDetailModel(personId: personId, month: nil, queries: app.queries)
    }
  }

  var body: some View {
    ScrollView {
      PersonDetailContent(model: model, isInspector: true)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xxl)
        .environment(\.peopleLayout, .compact)
    }
    .background(.surfaceCanvas)
    .refreshable { await model.refresh() }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button(role: .close, action: onClose)
          .accessibilityIdentifier("person-inspector-close")
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button {
          router.push(.person(id: personId, month: model.monthKey))
        } label: {
          Label("Open as Page", systemImage: PeopleGlyph.fullPage)
        }
        OpenInPlanningCenterButton(personId: personId, name: model.name)
      }
    }
    .onAppear { model.appear() }
    .onDisappear { model.disappear() }
    .trackScreen(.person)
  }
}
