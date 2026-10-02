import Foundation

/// JSON coders matching the API's wire format. Dates arrive as ISO 8601 UTC
/// strings, usually with milliseconds (`2026-10-01T17:00:00.000Z`, what
/// `Date.toISOString()` writes), and are sent the same way: `planTimes`
/// inputs reject offsets other than `Z`, and `people.*` inputs use the exact
/// string as part of the server cache key.
public enum JSONCoding {
  public static func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let container = try decoder.singleValueContainer()
      let text = try container.decode(String.self)
      guard let date = parseISODate(text) else {
        throw DecodingError.dataCorruptedError(
          in: container, debugDescription: "Expected an ISO 8601 date, got \(text)")
      }
      return date
    }
    return decoder
  }

  public static func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .custom { date, encoder in
      var container = encoder.singleValueContainer()
      try container.encode(isoString(date))
    }
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return encoder
  }

  /// Parses `...Z` or offset timestamps, with or without fractional seconds.
  public static func parseISODate(_ text: String) -> Date? {
    if let date = try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
      return date
    }
    return try? Date(text, strategy: Date.ISO8601FormatStyle())
  }

  /// `Date.toISOString()`: UTC with exactly three fractional digits.
  public static func isoString(_ date: Date) -> String {
    date.formatted(
      Date.ISO8601FormatStyle(includingFractionalSeconds: true, timeZone: TimeZone(identifier: "UTC")!))
  }
}
