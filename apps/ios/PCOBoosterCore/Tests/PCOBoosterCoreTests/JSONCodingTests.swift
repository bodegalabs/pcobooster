import Foundation
import PCOBoosterCore
import Testing

struct JSONCodingTests {
  @Test func decodesMillisecondAndWholeSecondTimestamps() throws {
    let decoder = JSONCoding.makeDecoder()
    let withMillis = try decoder.decode(Date.self, from: Data(#""2026-10-01T17:00:00.250Z""#.utf8))
    let whole = try decoder.decode(Date.self, from: Data(#""2026-10-01T17:00:00Z""#.utf8))
    #expect(withMillis.timeIntervalSince(whole) == 0.25)
  }

  @Test func encodesLikeToISOString() throws {
    let date = Date(timeIntervalSince1970: 1_790_000_000.5)
    #expect(JSONCoding.isoString(date) == "2026-09-21T14:13:20.500Z")
  }
}
