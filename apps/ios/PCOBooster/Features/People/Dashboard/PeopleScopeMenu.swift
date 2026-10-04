import PCOBoosterCore
import SwiftUI

/// The scope choices: Teams I lead (when the viewer leads any), All teams, then every team
/// under its service type's heading with "Other teams" last (the web's `ScopeSelect` and its
/// optgroups). Used as the navigation title menu and inside the toolbar's scope menu. Each
/// choice is a checkmark toggle so the service type headings stay visible; two teams can share
/// a name across service types.
struct PeopleScopeMenu: View {
  let model: PeopleDashboardModel

  var body: some View {
    let teams = model.dashboard?.teams ?? model.roster.value?.teams ?? []
    let ledTeamIds = model.roster.value?.ledTeamIds ?? []
    Section {
      if !ledTeamIds.isEmpty {
        choice(.mine) {
          Label("Teams I lead", systemImage: PeopleGlyph.ledTeams)
        }
      }
      choice(.all) {
        Label("All teams", systemImage: PeopleGlyph.allTeams)
      }
    }
    ForEach(PeopleScreens.groupTeams(teams)) { group in
      Section(group.serviceType) {
        ForEach(group.teams) { team in
          choice(.team(team.id)) {
            Text(verbatim: team.name)
          }
          .accessibilityLabel(Text(verbatim: PeopleScreens.teamLabel(team)))
        }
      }
    }
  }

  private func choice<Title: View>(
    _ scope: PeopleDashboardScope, @ViewBuilder title: () -> Title
  ) -> some View {
    Toggle(
      isOn: Binding(
        get: { model.scope == scope },
        set: { isOn in
          if isOn { model.select(scope: scope) }
        })
    ) {
      title()
    }
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
        Image(systemName: PeopleGlyph.scope)
          .symbolEffect(.bounce, value: model.scope)
      }
    }
    .menuIndicator(.hidden)
    .accessibilityLabel(Text("Choose teams"))
    .accessibilityValue(Text(verbatim: model.scopeLabel))
    .accessibilityIdentifier("people-scope-menu")
  }
}
