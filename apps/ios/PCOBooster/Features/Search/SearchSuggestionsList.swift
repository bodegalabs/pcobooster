import PCOBoosterCore
import SwiftUI

/// What Search shows before anything is typed: recent searches (queries and what was opened,
/// swipe to remove, Clear to forget them all) and the plans coming up next, from the catalog
/// the Services tab already loads.
struct SearchSuggestionsList: View {
  let model: SearchModel
  let opener: SearchOpener

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var isConfirmingClear = false

  /// How many upcoming plans the suggestions list.
  static let upcomingLimit = 5

  var body: some View {
    let upcoming = model.upcomingPlans(now: clock.now, timeZone: timeZone, limit: Self.upcomingLimit)
    let recents = model.recents.items
    let isBlank = recents.isEmpty && upcoming.isEmpty && !model.catalog.isLoadingFirstTime
      && model.catalog.failureMessage == nil
    List {
      if !recents.isEmpty {
        Section {
          ForEach(recents) { item in
            RecentButton(item: item, opener: opener)
              .swipeActions(edge: .trailing) {
                Button("Remove", systemImage: "xmark", role: .destructive) {
                  model.recents.remove(item)
                }
              }
              .contextMenu {
                Button("Remove from Recents", systemImage: "xmark", role: .destructive) {
                  model.recents.remove(item)
                }
              }
          }
        } header: {
          SectionHeader("Recent") {
            Button("Clear") { isConfirmingClear = true }
              .buttonStyle(.borderless)
              .accessibilityLabel(Text("Clear recent searches"))
          }
        }
      }
      upcomingSection(upcoming)
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .contentMargins(.top, Spacing.xs, for: .scrollContent)
    .overlay {
      if isBlank {
        EmptyState(
          "Search everything",
          symbol: .search,
          description: "Find plans by title, series, or date, people by name, and songs by title or writer."
        )
        .transition(.opacity)
      }
    }
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.25)), value: recents)
    .confirmationDialog(
      "Clear recent searches?", isPresented: $isConfirmingClear, titleVisibility: .visible
    ) {
      Button("Clear Recent Searches", role: .destructive) { model.recents.clear() }
    }
  }

  @ViewBuilder
  private func upcomingSection(_ upcoming: [PlanHit]) -> some View {
    if !upcoming.isEmpty {
      Section {
        ForEach(upcoming) { hit in
          PlanResultButton(hit: hit, opener: opener)
        }
      } header: {
        SectionHeader("Coming up")
      }
    } else if model.catalog.isLoadingFirstTime {
      Section {
        SearchSkeletonRows(count: 3)
      } header: {
        SectionHeader("Coming up")
      }
    } else if let message = model.catalog.failureMessage {
      Section {
        SearchStatusRow(verbatim: message) {
          Button("Retry") { model.catalog.retry() }
        }
      } header: {
        SectionHeader("Coming up")
      }
    }
  }
}

/// A recent search as a list row; a person opened while the People dashboard is off reopens
/// in the blockouts sheet beside it.
private struct RecentButton: View {
  let item: RecentSearchItem
  let opener: SearchOpener

  var body: some View {
    if case .person(let id, let name, let photoURL) = item {
      button.searchPersonPresentation(
        SearchPerson(id: id, name: name, photoURL: photoURL), model: opener.model)
    } else {
      button
    }
  }

  private var button: some View {
    Button {
      opener.open(item)
    } label: {
      RecentSearchRow(item: item)
    }
    .cardRowBackground()
  }
}
