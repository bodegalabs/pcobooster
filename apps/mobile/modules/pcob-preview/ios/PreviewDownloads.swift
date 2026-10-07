import Foundation

/// Why a preview download stopped.
enum PreviewDownloadError: LocalizedError {
  case insecureLink
  case outsidePreviews
  case status(Int)

  var errorDescription: String? {
    switch self {
    case .insecureLink: "The file's link is not a secure one."
    case .outsidePreviews: "Previews are saved only in the app's preview folder."
    case .status(let code): "The file host answered \(code)."
    }
  }
}

/// Refuses a redirect that leaves https or adds a user name or password, so the session never
/// follows a signed link anywhere a credential could be sent or read in the clear.
final class SecureRedirects: NSObject, URLSessionTaskDelegate, Sendable {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest
  ) async -> URLRequest? {
    guard let url = request.url, PreviewLink.isSecure(url) else { return nil }
    return request
  }
}

/// Downloads a file from Planning Center's signed link into the previews folder.
///
/// The session is ephemeral and keeps nothing: no disk or memory cache (which would store the
/// signed link on disk), no cookies sent or kept, no stored credentials. Each download has an id
/// so the caller can cancel it when its screen leaves; a cancel that arrives before its download
/// starts still stops it.
actor PreviewDownloads {
  private let session: URLSession
  private var running: [String: Task<Void, any Error>] = [:]
  private var cancelledEarly: Set<String> = []

  init() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.urlCredentialStorage = nil
    session = URLSession(configuration: configuration)
  }

  func download(id: String, from source: URL, to destination: URL) async throws {
    guard PreviewLink.isSecure(source) else { throw PreviewDownloadError.insecureLink }
    guard PreviewFolder.contains(destination) else { throw PreviewDownloadError.outsidePreviews }
    if cancelledEarly.remove(id) != nil { throw CancellationError() }
    let task = Task { [session] in
      try await Self.fetch(session: session, from: source, to: destination)
    }
    running[id] = task
    defer { running[id] = nil }
    try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      task.cancel()
    }
  }

  func cancel(id: String) {
    if let task = running[id] {
      task.cancel()
    } else {
      cancelledEarly.insert(id)
    }
  }

  private static func fetch(
    session: URLSession, from source: URL, to destination: URL
  ) async throws {
    let (location, response) = try await session.download(
      for: URLRequest(url: source), delegate: SecureRedirects())
    // The system leaves the temporary file to the caller: move it, or remove it on failure.
    defer { try? FileManager.default.removeItem(at: location) }
    try Task.checkCancellation()
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else { throw PreviewDownloadError.status(status) }
    if FileManager.default.fileExists(atPath: destination.path) {
      try FileManager.default.removeItem(at: destination)
    }
    try FileManager.default.moveItem(at: location, to: destination)
  }
}
