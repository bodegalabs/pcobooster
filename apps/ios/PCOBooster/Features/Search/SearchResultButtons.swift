import PCOBoosterCore
import SwiftUI

/// A plan result as a list row: tap opens it; long press previews it (warming its header) and
/// offers Planning Center and the link.
struct PlanResultButton: View {
  let hit: PlanHit
  var query = ""
  let opener: SearchOpener
  @Environment(\.openURL) private var openURL

  var body: some View {
    Button {
      opener.open(hit)
    } label: {
      PlanResultRow(hit: hit, query: query)
    }
    .contextMenu {
      Button("Open Plan", systemImage: "calendar") { opener.open(hit) }
      if let url = opener.model.catalog.planningCenterURL(for: hit) {
        Button("Open in Planning Center", systemImage: "arrow.up.right.square") {
          openURL(url, prefersInApp: true)
        }
      }
      Button("Copy Link", systemImage: "link") {
        UIPasteboard.general.url = URL(string: "https://pcobooster.com\(hit.route.path)")
      }
    } preview: {
      PlanResultPreview(hit: hit)
        .onAppear { opener.prefetch(hit) }
    }
    .cardRowBackground()
  }
}

/// A person result as a list row: tap opens them (the person screen, or the blockouts sheet
/// while the People dashboard is off).
struct PersonResultButton: View {
  let person: SearchPerson
  var query = ""
  let opener: SearchOpener
  @Environment(\.openURL) private var openURL

  var body: some View {
    Button {
      opener.open(person)
    } label: {
      PersonResultRow(person: person, query: query)
    }
    .searchPersonPresentation(person, model: opener.model)
    .contextMenu {
      Button("Open", systemImage: "person.crop.circle") { opener.open(person) }
      if let url = planningCenterPersonURL(person.id) {
        Button("Open in Planning Center", systemImage: "arrow.up.right.square") {
          openURL(url, prefersInApp: true)
        }
      }
    } preview: {
      PersonResultPreview(person: person)
        .onAppear { opener.prefetch(person) }
    }
    .cardRowBackground()
  }
}

/// A song result as a list row: tap opens the song screen.
struct SongResultButton: View {
  let song: SongCatalogEntry
  var query = ""
  let opener: SearchOpener
  @Environment(\.openURL) private var openURL

  var body: some View {
    Button {
      opener.open(song)
    } label: {
      SongResultRow(song: song, query: query)
    }
    .contextMenu {
      Button("Open Song", systemImage: "music.note") { opener.open(song) }
      if let url = URL(string: planningCenterSongUrl(song.id)) {
        Button("Open in Planning Center", systemImage: "arrow.up.right.square") {
          openURL(url, prefersInApp: true)
        }
      }
    } preview: {
      SongResultPreview(song: song)
    }
    .cardRowBackground()
  }
}
