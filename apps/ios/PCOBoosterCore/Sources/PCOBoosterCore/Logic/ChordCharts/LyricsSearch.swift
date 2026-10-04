// Port of apps/web/src/lib/lyrics-search.ts, pinned by the
// `chordcharts.lyricsSearchQuery` and `chordcharts.fuzz.lines` parity suites
// (scripts/parity/chord-charts.parity.ts).

/// The song's title and first writer, the best first lyrics search. Credits
/// often list several writers ("A, B & C and D"); the first narrows a search best.
public func lyricsSearchQuery(title: String, author: String) -> String {
  let firstAuthor = MusicText.string(firstAuthorScalars(MusicText.scalars(author)))
  return MusicText.trim("\(title) \(MusicText.trim(firstAuthor))")
}

/// Everything before the first `/,|&|\band\b/u`, where `\b` is an ASCII word boundary.
private func firstAuthorScalars(_ author: [Unicode.Scalar]) -> ArraySlice<Unicode.Scalar> {
  let and: [Unicode.Scalar] = ["a", "n", "d"]
  for index in author.indices {
    if author[index] == "," || author[index] == "&" {
      return author[..<index]
    }
    let end = index + and.count
    if end <= author.count, author[index..<end].elementsEqual(and),
      index == 0 || !MusicText.isWordCharacter(author[index - 1]),
      end == author.count || !MusicText.isWordCharacter(author[end])
    {
      return author[..<index]
    }
  }
  return author[...]
}
