// Port of `getInitials` in apps/web/src/lib/format/initials.ts. Pinned by the
// `text.initials` parity suite.

/// Avatar initials: the first two characters of a one-word name, otherwise the first letter
/// of each of the first two words, uppercased; "?" for a blank name.
///
/// Like the TypeScript, "characters" are UTF-16 code units, so a decomposed accent is
/// dropped and half of an emoji becomes U+FFFD (JavaScript shows its lone surrogate the
/// same way).
public func initials(_ name: String) -> String {
  let parts = JSParity.words(JSParity.trim(name))
  guard let first = parts.first else {
    return "?"
  }
  guard parts.count > 1 else {
    let prefix = JSParity.utf16Prefix(first, 2).uppercased()
    return prefix.isEmpty ? "?" : prefix
  }
  return (JSParity.utf16Prefix(first, 1) + JSParity.utf16Prefix(parts[1], 1)).uppercased()
}
