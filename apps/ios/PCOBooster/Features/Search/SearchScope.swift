import SwiftUI

/// The search scopes under the field while searching: everything, or one kind of result.
enum SearchScope: String, CaseIterable, Hashable, Identifiable {
  case all
  case plans
  case people
  case songs

  var id: String { rawValue }

  var title: LocalizedStringKey {
    switch self {
    case .all: "All"
    case .plans: "Plans"
    case .people: "People"
    case .songs: "Songs"
    }
  }

  /// How many results a section shows in the All scope before "Show All".
  static let previewLimit = 3

  /// A section's results in the All scope: the first few, or every one when only one more
  /// would hide behind "Show All".
  static func preview<Item>(_ items: [Item]) -> [Item] {
    items.count <= previewLimit + 1 ? items : Array(items.prefix(previewLimit))
  }
}

/// A person a search result or a recent search points at.
struct SearchPerson: Hashable, Identifiable, Codable {
  var id: String
  var name: String
  var photoURL: String?

  var photo: URL? { photoURL.flatMap(URL.init(string:)) }
}

/// Where a person's Planning Center page lives (`planningCenterPersonUrl` in
/// apps/web/src/lib/people/planning-center-person-url.ts).
func planningCenterPersonURL(_ personId: String) -> URL? {
  let encoded = personId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? personId
  return URL(string: "https://people.planningcenteronline.com/people/AC\(encoded)")
}
