import Foundation
import Observation
import PCOBoosterCore

/// One song's arrangements, keys, and suggested ids for a service type (`songs.options`), read
/// where it is on screen: the key picker, the item details, the song preview.
@MainActor
@Observable
final class SongOptionsModel {
  let options: QueryState<SongOptionSet>

  init(queries: QueryClient, songId: String, serviceTypeId: String) {
    options = queries.query(
      .songOptions(songId: songId, serviceTypeId: serviceTypeId), RPC.Songs.options,
      SongsOptionsInput(serviceTypeId: serviceTypeId, songId: songId))
  }
}

/// Where and when one song was sung across every service over the past year (`songs.history`),
/// plus the service type names its rows show. History loads only once it is asked for.
@MainActor
@Observable
final class SongHistoryModel {
  let history: QueryState<[SongHistoryEntry]>
  let serviceTypes: QueryState<[ServiceType]>

  init(queries: QueryClient, songId: String) {
    history = queries.query(
      .songHistory(songId: songId), RPC.Songs.history, SongsHistoryInput(songId: songId))
    serviceTypes = queries.query(.serviceTypes, RPC.Catalog.serviceTypes)
  }

  func serviceTypeName(_ serviceTypeId: String?) -> String? {
    guard let serviceTypeId else { return nil }
    return serviceTypes.value?.first { $0.id == serviceTypeId }?.name
  }
}
