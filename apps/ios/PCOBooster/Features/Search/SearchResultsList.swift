import PCOBoosterCore
import SwiftUI

/// Results while the field has text: Plans, People, and Songs sections in the All scope (a few
/// each, with "Show all"), or one full section in a scope. Sections with nothing to say stay out
/// of All; when nothing matches anywhere the system "No Results" state shows instead.
struct SearchResultsList: View {
  let model: SearchModel
  let opener: SearchOpener
  /// `people.search` is allowed (People access granted).
  let canSearchPeople: Bool
  /// What the access review says about searching people, for the People scope's note.
  let peopleAccess: FeatureAccess?

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock
  @Environment(\.openAccessReview) private var openAccessReview
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let plans = model.planHits(now: clock.now, timeZone: timeZone)
    let people = model.peopleSection
    let songs = model.songsSection
    let showsNoResults = isEmpty(plans: plans, people: people, songs: songs)
    List {
      if !showsNoResults {
        if model.scope == .all || model.scope == .plans {
          plansSection(plans)
        }
        if model.scope == .people || (model.scope == .all && canSearchPeople) {
          peopleSection(people)
        }
        if model.scope == .all || model.scope == .songs {
          songsSection(songs)
        }
      }
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .contentMargins(.top, Spacing.xs, for: .scrollContent)
    .overlay {
      if showsNoResults {
        ContentUnavailableView.search(text: model.trimmedText)
          .foregroundStyle(.inkSecondary)
          .transition(.opacity)
      }
    }
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: showsNoResults)
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: model.scope)
  }

  // MARK: Plans

  @ViewBuilder
  private func plansSection(_ hits: [PlanHit]) -> some View {
    let isAll = model.scope == .all
    let shown = isAll ? SearchScope.preview(hits) : hits
    if !hits.isEmpty {
      Section {
        ForEach(shown) { hit in
          PlanResultButton(hit: hit, query: model.trimmedText, opener: opener)
        }
      } header: {
        SectionHeader("Plans", count: hits.count) {
          if shown.count < hits.count {
            ShowAllButton(scope: .plans, model: model)
          }
        }
      }
    } else if model.catalog.isLoadingFirstTime {
      Section {
        SearchSkeletonRows(count: 2)
      } header: {
        SectionHeader("Plans")
      }
    } else if let message = model.catalog.failureMessage {
      Section {
        SearchStatusRow(verbatim: message) {
          Button("Retry") { model.catalog.retry() }
        }
      } header: {
        SectionHeader("Plans")
      }
    } else if !isAll {
      Section {
        SearchStatusRow("No matching plans.")
      } header: {
        SectionHeader("Plans")
      }
    }
  }

  // MARK: People

  @ViewBuilder
  private func peopleSection(_ section: ServerSection<PeopleSearchResult>) -> some View {
    let isAll = model.scope == .all
    if !canSearchPeople {
      Section {
        PeopleAccessNote(entry: peopleAccess, openAccessReview: openAccessReview)
      } header: {
        SectionHeader("People")
      }
    } else if model.trimmedText.count < SearchModel.minimumPeopleQuery {
      if !isAll {
        Section {
          SearchStatusRow("Type at least 2 characters.")
        } header: {
          SectionHeader("People")
        }
      }
    } else {
      switch section.phase {
      case .idle:
        EmptyView()
      case .loading:
        Section {
          SearchSkeletonRows(count: 2)
        } header: {
          SectionHeader("People")
        }
      case .results(let results, let isStale):
        let shown = isAll ? SearchScope.preview(results) : results
        Section {
          ForEach(shown) { result in
            PersonResultButton(person: SearchPerson(result), query: model.trimmedText, opener: opener)
          }
          .staleWhileRefreshing(isStale)
        } header: {
          SectionHeader("People", count: results.count) {
            if shown.count < results.count {
              ShowAllButton(scope: .people, model: model)
            }
          }
        }
      case .empty:
        if !isAll {
          Section {
            SearchStatusRow("No people found.")
          } header: {
            SectionHeader("People")
          }
        }
      case .failed(let message):
        Section {
          SearchStatusRow(verbatim: message) {
            Button("Retry") { section.retry?() }
          }
        } header: {
          SectionHeader("People")
        }
      }
    }
  }

  // MARK: Songs

  @ViewBuilder
  private func songsSection(_ section: ServerSection<SongCatalogEntry>) -> some View {
    let isAll = model.scope == .all
    switch section.phase {
    case .idle:
      EmptyView()
    case .loading:
      Section {
        SearchSkeletonRows(count: 2, showsAvatar: false)
      } header: {
        SectionHeader("Songs")
      }
    case .results(let results, let isStale):
      let shown = isAll ? SearchScope.preview(results) : results
      Section {
        ForEach(shown) { song in
          SongResultButton(song: song, query: model.trimmedText, opener: opener)
        }
        .staleWhileRefreshing(isStale)
      } header: {
        SectionHeader("Songs", count: results.count) {
          if shown.count < results.count {
            ShowAllButton(scope: .songs, model: model)
          }
        }
      }
    case .empty:
      if !isAll {
        Section {
          SearchStatusRow("No songs found.")
        } header: {
          SectionHeader("Songs")
        }
      }
    case .failed(let message):
      Section {
        SearchStatusRow(verbatim: message) {
          Button("Retry") { section.retry?() }
        }
      } header: {
        SectionHeader("Songs")
      }
    }
  }

  // MARK: Nothing found

  /// Every section that applies has answered with nothing (and the query has settled).
  private func isEmpty(
    plans: [PlanHit], people: ServerSection<PeopleSearchResult>, songs: ServerSection<SongCatalogEntry>
  ) -> Bool {
    guard !model.isAwaitingSettle else { return false }
    let plansEmpty =
      plans.isEmpty && !model.catalog.isLoadingFirstTime && model.catalog.failureMessage == nil
    let peopleEmpty: Bool = {
      guard canSearchPeople else { return model.scope != .people }
      switch people.phase {
      case .idle, .empty: return true
      default: return false
      }
    }()
    let songsEmpty: Bool = {
      switch songs.phase {
      case .idle, .empty: return true
      default: return false
      }
    }()
    switch model.scope {
    case .all: return plansEmpty && peopleEmpty && songsEmpty
    case .plans: return plansEmpty
    case .people:
      return canSearchPeople && peopleEmpty
        && model.trimmedText.count >= SearchModel.minimumPeopleQuery
    case .songs: return songsEmpty
    }
  }
}

/// Why the People scope can't search the directory, in the access review's words, with a way
/// to open the review.
private struct PeopleAccessNote: View {
  let entry: FeatureAccess?
  let openAccessReview: OpenAccessReviewAction?

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Text(verbatim: entry?.detail.isEmpty == false ? entry?.detail ?? "" : defaultDetail)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
      if let ask = entry?.ask {
        Text("Ask a Planning Center admin for \(Text(verbatim: ask).fontWeight(.medium).foregroundStyle(.ink)).")
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
      if let openAccessReview {
        Button("Your access") { openAccessReview() }
          .buttonStyle(.pill(.outline, size: .small))
          .padding(.top, Spacing.xxs)
      }
    }
    .padding(.vertical, Spacing.xs)
    .cardRowBackground()
  }

  private var defaultDetail: String {
    String(localized: "You can schedule team members, but can't search the rest of your church.")
  }
}
