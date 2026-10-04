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

  /// `Date.toISOString()`: UTC with exactly three fractional digits. Rounds to
  /// the nearest millisecond first: a decoded `...20.123Z` is stored as a
  /// binary double just below .123, and the formatter truncates, so without
  /// rounding the same instant would go back out as `.122Z` (and miss the
  /// server cache keyed by that string).
  public static func isoString(_ date: Date) -> String {
    let totalMilliseconds = Int64((date.timeIntervalSince1970 * 1000).rounded())
    let (wholeSeconds, milliseconds) = floorDivision(totalMilliseconds, by: 1000)
    let seconds = Date(timeIntervalSince1970: TimeInterval(wholeSeconds))
      .formatted(Date.ISO8601FormatStyle(timeZone: .gmt))  // 2026-10-01T17:00:20Z
    let fraction = String(milliseconds + 1000).dropFirst()  // zero-padded to 3 digits
    return "\(seconds.dropLast()).\(fraction)Z"
  }

  private static func floorDivision(_ value: Int64, by divisor: Int64) -> (Int64, Int64) {
    let remainder = ((value % divisor) + divisor) % divisor
    return ((value - remainder) / divisor, remainder)
  }
}
