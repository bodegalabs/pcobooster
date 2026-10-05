import PCOBoosterCore
import SwiftUI

/// The navigation title's menu, as in Files or Notes: what the plan is (its series), the link
/// actions (Planning Center, share, copy), then the nearby plans of the service type on each
/// side to jump to on the same segment, and the way back to the agenda.
struct PlanTitleMenu: View {
  let shell: PlanShellModel
  let header: PlanHeaderText
  let route: PlanRoute
  let plan: Plan?
  @Environment(AppRouter.self) private var router

  var body: some View {
    if let series = header.series {
      Section {
        Label {
          Text("\(series) series")
        } icon: {
          Image(systemName: "books.vertical")
        }
      }
    }
    Section {
      PlanLinkActions(route: route, plan: plan, title: header.title)
    }
    Section("Earlier plans") {
      PlanNeighborItems(direction: .previous, shell: shell) { plan in
        shell.open(plan, segment: PlanSegment(route.view))
      }
    }
    Section("Later plans") {
      PlanNeighborItems(direction: .next, shell: shell) { plan in
        shell.open(plan, segment: PlanSegment(route.view))
      }
    }
    Section {
      Button {
        router.show(.services)
      } label: {
        Label("All services", symbol: .services)
      }
    }
  }
}
