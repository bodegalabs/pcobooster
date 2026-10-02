import PCOBoosterCore
import SwiftUI

/// Search Planning Center for anyone not in the candidate list and schedule them as a one-off
/// (`AssignSomeoneElseRow`): at least 2 characters, a 150 ms pause, then `people.search`. Picking a
/// person closes the search at once; the lineup shows them while the write lands.
struct AssignSomeoneElseSheet: View {
  let positionName: String
  let teamName: String
  let onPick: (PeopleSearchResult) -> Void

  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var results: [PeopleSearchResult] = []
  @State private var searchedQuery = ""
  @State private var phase = Phase.idle

  private enum Phase: Equatable {
    case idle
    case searching
    case done
    case failed
  }

  static let debounce: Duration = .milliseconds(150)
  static let minimumQueryLength = 2

  private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    NavigationStack {
      List {
        content
      }
      .listStyle(.insetGrouped)
      .canvasBackground()
      .navigationTitle("Someone Else")
      .navigationSubtitle(Text(verbatim: rosterSlotCaption(team: teamName, position: positionName)))
      .navigationBarTitleDisplayMode(.inline)
      .searchable(
        text: $query, placement: .navigationBarDrawer(displayMode: .always),
        prompt: Text("Search people"))
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
      }
      .task(id: trimmed) {
        await search(trimmed)
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  @ViewBuilder private var content: some View {
    if trimmed.count < Self.minimumQueryLength {
      Text("Type at least 2 characters.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .cardRowBackground()
    } else if phase == .searching, results.isEmpty || searchedQuery != trimmed {
      ForEach(0..<3, id: \.self) { index in
        SkeletonRow(titleWidth: [130, 100, 150][index], detailWidth: 0)
          .cardRowBackground()
      }
      .accessibilityLabel(Text("Searching people"))
    } else if phase == .failed {
      Text("Search failed.")
        .font(.rowDetail)
        .foregroundStyle(.destructive)
        .cardRowBackground()
    } else if results.isEmpty {
      Text("No people found.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .cardRowBackground()
    } else {
      Section {
        ForEach(results) { person in
          Button {
            onPick(person)
            dismiss()
          } label: {
            HStack(spacing: Spacing.md) {
              PersonAvatar(
                name: person.fullName,
                photoURL: person.photoThumbnailUrl.flatMap(URL.init(string:)))
              Text(verbatim: person.fullName)
                .font(.rowTitleEmphasized)
                .foregroundStyle(.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
              Image(symbol: .addToSchedule)
                .font(.subheadline)
                .foregroundStyle(.inkSecondary)
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("Add \(person.fullName) to \(positionName)"))
          .cardRowBackground()
        }
      }
    }
  }

  private func search(_ text: String) async {
    guard text.count >= Self.minimumQueryLength else {
      phase = .idle
      return
    }
    phase = .searching
    do {
      try await Task.sleep(for: Self.debounce)
    } catch {
      return
    }
    do {
      let found = try await app.queries.fetch(
        .peopleSearch(query: text), RPC.People.search, PeopleSearchInput(query: text))
      guard !Task.isCancelled else { return }
      results = found
      searchedQuery = text
      phase = .done
    } catch {
      guard !Task.isCancelled, !error.isCancellation else { return }
      phase = .failed
    }
  }
}
