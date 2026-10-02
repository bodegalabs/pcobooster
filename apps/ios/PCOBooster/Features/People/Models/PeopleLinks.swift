import Foundation
import PCOBoosterCore

/// Links out of the People screens.
enum PeopleLinks {
  /// A person's own page in Planning Center People (the web's `planningCenterPersonUrl`).
  static func planningCenterPerson(_ personId: String) -> URL? {
    let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
    guard let encoded = personId.addingPercentEncoding(withAllowedCharacters: allowed) else {
      return nil
    }
    return URL(string: "https://people.planningcenteronline.com/people/AC\(encoded)")
  }

  /// The plan a commitment belongs to (`planUrl` is `/services/<st>/plans/<plan>/lineup`).
  static func planRoute(_ entry: PeopleDashboardMonthDay) -> PlanRoute? {
    entry.planUrl.flatMap(parsePlanRoute)
  }

  /// A person's photo, when Planning Center has one.
  static func photo(_ url: String?) -> URL? {
    guard let url, !url.isEmpty else { return nil }
    return URL(string: url)
  }
}
