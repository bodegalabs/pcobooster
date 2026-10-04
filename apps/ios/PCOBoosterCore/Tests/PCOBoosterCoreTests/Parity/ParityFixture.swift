import Foundation
import PCOBoosterCore

/// One input and the output the TypeScript produced for it.
struct ParityCase<Input: Decodable & Sendable, Output: Decodable & Sendable>: Decodable, Sendable {
  let input: Input
  let output: Output
}

private struct ParityFile<Input: Decodable & Sendable, Output: Decodable & Sendable>: Decodable {
  let suite: String
  let cases: [ParityCase<Input, Output>]
}

/// Loads the fixtures `scripts/parity/parity.test.ts` writes. Use as the
/// arguments of a parameterized test:
///
///     @Test(arguments: Parity.cases("calendar.dayKey", DayKeyInput.self, String.self))
///     func dayKey(_ c: ParityCase<DayKeyInput, String>) { #expect(...) }
enum Parity {
  static func cases<Input, Output>(
    _ suite: String, _ input: Input.Type, _ output: Output.Type
  ) -> [ParityCase<Input, Output>] {
    guard
      let url = Bundle.module.url(
        forResource: suite, withExtension: "json", subdirectory: "Fixtures/parity")
    else {
      fatalError("Missing parity fixture \(suite).json; run `bun run parity:update`.")
    }
    do {
      let file = try JSONCoding.makeDecoder().decode(
        ParityFile<Input, Output>.self, from: Data(contentsOf: url))
      return file.cases
    } catch {
      fatalError("Unreadable parity fixture \(suite).json: \(error)")
    }
  }
}
