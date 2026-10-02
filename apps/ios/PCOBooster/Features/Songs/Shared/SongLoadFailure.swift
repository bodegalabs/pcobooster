import PCOBoosterCore
import SwiftUI

/// Why a song didn't open, so the screen can say what would help (`chordChartLoadFailure`).
enum SongLoadFailure: Equatable {
  case notFound
  case noAccess(message: String)
  case failed

  init(_ error: (any Error)?) {
    guard let apiError = error as? APIError else {
      self = .failed
      return
    }
    switch apiError.code {
    case .notFound:
      self = .notFound
    case .forbidden:
      let message = apiError.message.isEmpty
        ? String(localized: "Your Planning Center account can\u{2019}t view songs in Services.")
        : apiError.message
      self = .noAccess(message: message)
    default:
      self = .failed
    }
  }

  var title: String {
    switch self {
    case .notFound: String(localized: "Song not found")
    case .noAccess: String(localized: "You can\u{2019}t open this song")
    case .failed: String(localized: "This song didn\u{2019}t load")
    }
  }

  var message: String {
    switch self {
    case .notFound:
      String(
        localized:
          "Planning Center has no song at this link. It may have been deleted, or it belongs to another organization."
      )
    case .noAccess(let message): message
    case .failed: String(localized: "Planning Center didn\u{2019}t answer. Try again in a moment.")
    }
  }

  var canRetry: Bool { self == .failed }
}

/// The full-screen state for a song that didn't load, with Try again when it might help and a
/// way back to the library.
struct SongLoadErrorView: View {
  let failure: SongLoadFailure
  let retry: () -> Void
  @Environment(AppRouter.self) private var router

  var body: some View {
    EmptyState(
      LocalizedStringKey(failure.title), artwork: .symbol(.alert),
      description: Text(failure.message)
    ) {
      VStack(spacing: Spacing.sm) {
        if failure.canRetry {
          Button("Try again", action: retry)
            .buttonStyle(.pill(.primary))
        }
        Button("Back to Songs") {
          router.popToRoot(.songs)
          router.selectedTab = .songs
        }
        .buttonStyle(.pill(.secondary))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.surfaceCanvas)
  }
}

/// The API's own message for a failed song or chart write, or `fallback` for network and
/// unexpected failures (the web's `chordChartErrorMessage`).
func songsErrorMessage(_ error: any Error, fallback: String) -> String {
  if let apiError = error as? APIError, apiError.kind == .response, !apiError.message.isEmpty {
    return apiError.message
  }
  return fallback
}
