import Network
import Observation

/// Whether the device has a network path, from `NWPathMonitor`. Drives the offline banner and
/// refetches stale data when the connection comes back.
@MainActor
@Observable
final class NetworkMonitor {
  /// No usable path (airplane mode, no signal). Starts false so the banner never flashes at launch.
  private(set) var isOffline = false

  /// Called on the main actor when a path returns after being offline.
  @ObservationIgnored var onReconnect: (@MainActor () -> Void)?

  @ObservationIgnored private let monitor = NWPathMonitor()
  @ObservationIgnored private var isStarted = false

  init() {}

  func start() {
    guard !isStarted else { return }
    isStarted = true
    monitor.pathUpdateHandler = { @Sendable [weak self] path in
      let offline = path.status != .satisfied
      Task { @MainActor in self?.update(offline: offline) }
    }
    monitor.start(queue: DispatchQueue(label: "com.pcobooster.network-monitor", qos: .utility))
  }

  #if DEBUG
  /// Shows the offline banner without touching the network (`-PCOBOffline YES`), for layout
  /// checks. Requests still go out.
  func simulateOffline() {
    isStarted = true
    isOffline = true
  }
  #endif

  private func update(offline: Bool) {
    guard offline != isOffline else { return }
    isOffline = offline
    if !offline {
      onReconnect?()
    }
  }

  deinit {
    monitor.cancel()
  }
}
