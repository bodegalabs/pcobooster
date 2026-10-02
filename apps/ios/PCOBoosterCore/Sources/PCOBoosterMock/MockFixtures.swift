import Foundation

/// Locates the bundled fictional API fixtures.
public enum MockFixtures {
  public static func url(for procedurePath: String) -> URL? {
    let name = procedurePath.replacingOccurrences(of: "/", with: ".")
    return Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
  }
}
