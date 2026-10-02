import PCOBoosterCore
import SwiftUI

/// Adds a song to Planning Center with a Default arrangement, then opens its chord chart
/// (`AddSongDialog`). A title of digits only is a CCLI number: Planning Center looks the song up
/// in SongSelect and fills in its title, writers, and copyright. Songs already in the library
/// with a similar title are offered first, so nobody adds a duplicate.
struct AddSongSheet: View {
  let initialTitle: String
  /// Opens an existing song instead of adding one.
  let openExisting: (String) -> Void
  /// The song was added; open its chart.
  let added: (ChordChartSongOutput) -> Void

  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var title: String
  @State private var author = ""
  @State private var copyright = ""
  @State private var ccliNumber = ""
  @State private var isAdding = false
  @State private var similar: QueryState<[SongCatalogEntry]>?
  @FocusState private var focusedField: Field?

  private enum Field: Hashable {
    case title, author, copyright, ccli
  }

  /// `MAX_SIMILAR_SONGS`.
  private static let similarCount = 3

  init(
    initialTitle: String, openExisting: @escaping (String) -> Void,
    added: @escaping (ChordChartSongOutput) -> Void
  ) {
    self.initialTitle = initialTitle
    self.openExisting = openExisting
    self.added = added
    _title = State(initialValue: initialTitle)
  }

  private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
  private var lookupNumber: Int? { Self.parseCCLINumber(trimmedTitle) }
  private var parsedCCLINumber: Int? { Self.parseCCLINumber(ccliNumber) }
  private var ccliInvalid: Bool {
    !ccliNumber.trimmingCharacters(in: .whitespaces).isEmpty && parsedCCLINumber == nil
  }
  private var access: ChordChartEditAccess {
    chordChartEditAccess(app.capabilities.access, demo: app.capabilities.isDemo)
  }
  private var canSubmit: Bool {
    access.canEdit && !trimmedTitle.isEmpty && !ccliInvalid && !isAdding
  }

  var body: some View {
    NavigationStack {
      Form {
        if let reason = access.reason {
          Section {
            InfoBanner(verbatim: app.capabilities.isDemo
              ? String(localized: "This demo is read-only, so songs can\u{2019}t be added.")
              : reason)
          }
          .listRowInsets(EdgeInsets())
          .listRowBackground(Color.clear)
        }
        Section {
          TextField("Build My Life", text: $title)
            .focused($focusedField, equals: .title)
            .submitLabel(.done)
            .onSubmit(submit)
            .accessibilityIdentifier("add-song-title")
        } header: {
          SectionHeader("Title or CCLI number")
        } footer: {
          if let lookupNumber {
            Text(
              "Planning Center looks up CCLI song \(String(lookupNumber)) and fills in its title, writers, and copyright."
            )
          }
        }
        .cardRowBackground()
        similarSection
        if lookupNumber == nil {
          Section {
            TextField("Writers", text: $author, prompt: Text("Writers (optional)"))
              .focused($focusedField, equals: .author)
              .textContentType(.name)
            TextField("Copyright", text: $copyright, prompt: Text("Copyright (optional)"))
              .focused($focusedField, equals: .copyright)
            TextField("CCLI number", text: $ccliNumber, prompt: Text("CCLI number (optional)"))
              .focused($focusedField, equals: .ccli)
              .keyboardType(.numberPad)
          } header: {
            SectionHeader("Details")
          } footer: {
            if ccliInvalid {
              Text("A CCLI number is digits only.")
                .foregroundStyle(.destructive)
            }
          }
          .cardRowBackground()
        }
      }
      .canvasBackground()
      .navigationTitle("Add Song")
      .navigationBarTitleDisplayMode(.inline)
      .navigationSubtitle("Adds it with a Default arrangement, then opens its chart.")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
      }
      .bottomActionBar {
        Button(action: submit) {
          HStack(spacing: Spacing.sm) {
            if isAdding { ProgressView().tint(.onInkFill) }
            Text("Add to Planning Center")
          }
        }
        .disabled(!canSubmit)
        .accessibilityIdentifier("add-song-submit")
      }
      .task(id: similarQuery) { await searchSimilar() }
    }
    .onAppear { focusedField = .title }
  }

  @ViewBuilder private var similarSection: some View {
    if let songs = similar?.value, !songs.isEmpty, similarQuery != nil {
      Section {
        ForEach(songs.prefix(Self.similarCount)) { song in
          Button {
            openExisting(song.id)
          } label: {
            HStack {
              VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text(verbatim: songDisplayTitle(song.title)).font(.rowTitle).foregroundStyle(.ink)
                if !song.author.isEmpty {
                  Text(verbatim: song.author).font(.rowDetail).foregroundStyle(.inkSecondary)
                }
              }
              Spacer()
              Image(symbol: .chevronRight)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.inkTertiary)
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("Open \(songDisplayTitle(song.title)) instead"))
        }
      } header: {
        SectionHeader("Already in Planning Center")
      }
      .cardRowBackground()
    }
  }

  /// The title to look for similar songs with; nil for a CCLI number, which Services looks up.
  private var similarQuery: String? {
    trimmedTitle.isEmpty || lookupNumber != nil ? nil : trimmedTitle
  }

  private func searchSimilar() async {
    guard let query = similarQuery else { return }
    // A short pause so each keystroke doesn't search (the web defers the value).
    try? await Task.sleep(for: .milliseconds(300))
    guard !Task.isCancelled else { return }
    similar = app.queries.query(.songSearch(query: query), RPC.Songs.search, SongsSearchInput(query: query))
  }

  private func submit() {
    guard canSubmit else { return }
    isAdding = true
    let input = ChordChartSongCreateInput(
      title: trimmedTitle,
      author: author.trimmingCharacters(in: .whitespacesAndNewlines),
      copyright: copyright.trimmingCharacters(in: .whitespacesAndNewlines),
      ccliNumber: parsedCCLINumber ?? lookupNumber)
    Task {
      defer { isAdding = false }
      do {
        let created = try await app.queries.perform(RPC.ChordCharts.createSong, input)
        app.queries.setValue(created, for: .chordChartSong(songId: created.song.id))
        RecentSongsStore.shared.remember(
          RecentSong(id: created.song.id, title: created.song.title, author: created.song.author))
        added(created)
      } catch let error where !error.isCancellation {
        app.toasts.showError(
          songsErrorMessage(error, fallback: String(localized: "Planning Center didn\u{2019}t add the song. Try again.")))
      }
    }
  }

  /// One to nine digits (`CCLI_NUMBER_PATTERN`).
  static func parseCCLINumber(_ value: String) -> Int? {
    let trimmed = value.trimmingCharacters(in: .whitespaces)
    guard (1...9).contains(trimmed.count), trimmed.allSatisfy({ $0.isASCII && $0.isNumber }) else {
      return nil
    }
    return Int(trimmed)
  }
}
