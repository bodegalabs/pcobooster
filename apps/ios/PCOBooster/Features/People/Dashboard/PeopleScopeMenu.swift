import PCOBoosterCore
import SwiftUI

/// The scope choices: Teams I lead (when the viewer leads any), All teams, then every team
/// grouped by service type with "Other teams" last (the web's `ScopeSelect`). Used as the
/// navigation title menu.
struct PeopleScopeMenu: View {
  let model: PeopleDashboardModel

  var body: some View {
    let teams = model.dashboard?.teams ?? model.roster.value?.teams ?? []
    let ledTeamIds = model.roster.value?.ledTeamIds ?? []
    Picker(selection: Binding(get: { model.scope }, set: { model.select(scope: $0) })) {
      Section {
        if !ledTeamIds.isEmpty {
          Label("Teams I lead", systemImage: PeopleGlyph.ledTeams)
            .tag(PeopleDashboardScope.mine)
        }
        Label("All teams", systemImage: PeopleGlyph.allTeams)
          .tag(PeopleDashboardScope.all)
      }
      ForEach(PeopleScreens.groupTeams(teams)) { group in
        Section(group.serviceType) {
          ForEach(group.teams) { team in
            Text(verbatim: team.name)
              .tag(PeopleDashboardScope.team(team.id))
          }
        }
      }
    } label: {
      Text("Teams")
    }
    .pickerStyle(.inline)
  }
}

/// The toolbar button that opens the scope menu, labeled with the scope in effect.
struct PeopleScopeButton: View {
  let model: PeopleDashboardModel

  var body: some View {
    Menu {
      PeopleScopeMenu(model: model)
    } label: {
      Label {
        Text("Choose teams")
      } icon: {
        Image(systemName: "line.3.horizontal.decrease")
      }
    }
    .menuIndicator(.hidden)
    .accessibilityLabel(Text("Choose teams"))
    .accessibilityValue(Text(verbatim: model.scopeLabel))
    .accessibilityIdentifier("people-scope-menu")
  }
}
