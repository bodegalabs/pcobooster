import PCOBoosterCore
import SwiftUI

/// Opens what Search finds, inside the Search tab's stack (Back returns to the results), and
/// remembers it in recent searches. Destinations respect the feature flags: with the People
/// dashboard off, a person opens the blockouts sheet instead of the flagged person screen;
/// songs always open the song screen, which hides chord chart parts when that flag is off.
@MainActor
struct SearchOpener {
  let app: AppModel
  let router: AppRouter
  let model: SearchModel

  func open(_ hit: PlanHit) {
    model.recents.add(
      .plan(
        serviceTypeId: hit.row.serviceTypeId, planId: hit.row.planId,
        title: hit.row.serviceTypeName, detail: hit.row.detailText, date: hit.row.sortDate))
    router.push(.plan(hit.route))
  }

  func open(_ person: SearchPerson) {
    model.recents.add(.person(id: person.id, name: person.name, photoURL: person.photoURL))
    if app.capabilities.isEnabled(.people) {
      router.push(.person(id: person.id, month: nil))
    } else {
      model.presentedPerson = person
    }
  }

  func open(_ song: SongCatalogEntry) {
    model.recents.add(
      .song(id: song.id, title: song.title, author: song.author.isEmpty ? nil : song.author))
    router.push(.song(id: song.id))
  }

  func open(_ recent: RecentSearchItem) {
    switch recent {
    case .query(let text):
      model.text = text
    case .plan(let serviceTypeId, let planId, _, _, _):
      model.recents.add(recent)
      router.push(.plan(PlanRoute(serviceTypeId: serviceTypeId, planId: planId, view: .overview)))
    case .person(let id, let name, let photoURL):
      open(SearchPerson(id: id, name: name, photoURL: photoURL))
    case .song(let id, _, _):
      model.recents.add(recent)
      router.push(.song(id: id))
    }
  }

  /// Warms a plan's header on a deliberate long press, in the speculative lane.
  func prefetch(_ hit: PlanHit) {
    app.queries.prefetch(
      .planDetails(serviceTypeId: hit.row.serviceTypeId, planId: hit.row.planId),
      RPC.Catalog.plan, PlanInput(serviceTypeId: hit.row.serviceTypeId, planId: hit.row.planId))
  }

  /// Warms a person's blockouts on a deliberate long press when they will open in the sheet.
  func prefetch(_ person: SearchPerson) {
    guard !app.capabilities.isEnabled(.people) else { return }
    app.queries.prefetch(
      .blockouts(personId: person.id), RPC.People.blockouts, PeopleBlockoutsInput(personId: person.id))
  }
}

extension View {
  /// Presents the blockouts sheet for `person` when Search opens them: a popover beside the row
  /// on iPad, a sheet on iPhone.
  func searchPersonPresentation(_ person: SearchPerson, model: SearchModel) -> some View {
    popover(
      isPresented: Binding(
        get: { model.presentedPerson?.id == person.id },
        set: { isPresented in
          if !isPresented, model.presentedPerson?.id == person.id {
            model.presentedPerson = nil
          }
        }),
      arrowEdge: .leading
    ) {
      SearchPersonSheet(person: person)
        .frame(idealWidth: 420, idealHeight: 560)
        .presentationCompactAdaptation(.sheet)
    }
  }
}
