import PCOBoosterCore
import SwiftUI

/// The navigation title's menu: what the plan is (series and service type), then the nearby plans
/// of the service type on each side to jump to on the same segment.
struct PlanTitleMenu: View {
  let shell: PlanShellModel
  let header: PlanHeaderText
  let segment: PlanSegment
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
    Section("Earlier") {
      PlanNeighborItems(direction: .previous, shell: shell) { plan in
        shell.open(plan, segment: segment)
      }
    }
    Section("Later") {
      PlanNeighborItems(direction: .next, shell: shell) { plan in
        shell.open(plan, segment: segment)
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
