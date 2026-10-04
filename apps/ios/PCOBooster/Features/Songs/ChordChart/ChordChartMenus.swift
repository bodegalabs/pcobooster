import PCOBoosterCore
import SwiftUI

/// What the Insert menu and the keyboard bar put in a chart (the web's `SECTION_SNIPPETS` and
/// `CODE_SNIPPETS`), and the keys the key menus offer.
enum ChordChartSnippets {
  static let sections = ["VERSE 1", "PRE-CHORUS", "CHORUS", "BRIDGE", "TAG", "INSTRUMENTAL"]

  /// Planning Center codes, with the labels the web gives them.
  static let codes: [(label: LocalizedStringKey, text: String)] = [
    ("Column Break", "COLUMN_BREAK"),
    ("Page Break", "PAGE_BREAK"),
    ("Page Break (Charts Only)", "{{ PAGE_BREAK }}"),
    ("Note", "{ Note }"),
    ("Note (Charts Only)", "{{ Note }}"),
    ("Key Change Up a Step", "TRANSPOSE KEY +2"),
  ]

  /// `KEYS_PER_MODE`.
  static let keysPerMode = 12

  static var majorKeys: [String] { Array(ChordChords.chartKeys.prefix(keysPerMode)) }
  static var minorKeys: [String] { Array(ChordChords.chartKeys.dropFirst(keysPerMode)) }

  /// The chart's twelve keys in its own mode, for transposing (`keysInMode`).
  static func keysInMode(_ writtenKey: String?) -> [String] {
    guard let key = ChordChords.parseKey(writtenKey) else { return majorKeys }
    return (0..<keysPerMode).map { ChordChords.transposeKey(key, by: $0).name }
  }

  /// The written key's seven diatonic chords, for the keyboard bar; none without a key.
  static func diatonicChords(_ writtenKey: String?) -> [String] {
    guard let key = KeyTheory.parse(writtenKey) else { return [] }
    return KeyTheory.diatonicTriads(key).map(KeyTheory.chordName)
  }
}

/// The written key and Transpose in one menu (the web's written-key select and Transpose menu).
/// Choosing a written key only relabels the chart; Transpose rewrites every chord into another
/// key in the chart's mode and marks it written there. A key Planning Center holds that the list
/// lacks (such as Gb) stays shown as written.
struct ChordChartKeyMenu: View {
  let writtenKey: String?
  let isEnabled: Bool
  let setKey: @MainActor (String?) -> Void
  let transpose: @MainActor (String) -> Void

  var body: some View {
    Menu {
      Section("Written in") {
        Picker("Written in", selection: Binding(get: { writtenKey }, set: { setKey($0) })) {
          Text("No Key").tag(String?.none)
          if let writtenKey, !ChordChords.chartKeys.contains(writtenKey) {
            Text(verbatim: writtenKey).tag(Optional(writtenKey))
          }
        }
        .pickerStyle(.inline)
        Menu("Major") {
          keyPicker(ChordChartSnippets.majorKeys)
        }
        Menu("Minor") {
          keyPicker(ChordChartSnippets.minorKeys)
        }
      }
      Section {
        Menu {
          Section("Rewrite chords in") {
            ForEach(ChordChartSnippets.keysInMode(writtenKey), id: \.self) { key in
              Button {
                transpose(key)
              } label: {
                if key == ChordChords.parseKey(writtenKey)?.name {
                  Label(key, symbol: .checkmark)
                } else {
                  Text(verbatim: key)
                }
              }
            }
          }
        } label: {
          Label("Transpose", systemImage: "arrow.up.arrow.down")
        }
        .disabled(ChordChords.parseKey(writtenKey) == nil)
      }
    } label: {
      HStack(spacing: Spacing.xs) {
        Image(symbol: .songKey)
        Text(verbatim: writtenKey.map(KeyBadge.display) ?? String(localized: "Key"))
          .font(.subheadline.weight(.semibold))
          .monospacedDigit()
      }
    }
    .disabled(!isEnabled)
    .accessibilityLabel(Text("Key the chords are written in"))
    .accessibilityValue(Text(verbatim: writtenKey.map(KeyBadge.spoken) ?? String(localized: "No key")))
    .accessibilityIdentifier("chord-chart-key-menu")
  }

  private func keyPicker(_ keys: [String]) -> some View {
    Picker("Key", selection: Binding(get: { writtenKey }, set: { setKey($0) })) {
      ForEach(keys, id: \.self) { key in
        Text(verbatim: key).tag(Optional(key))
      }
    }
    .pickerStyle(.inline)
  }
}

/// Section headings and Planning Center codes, put at the caret on a line of their own
/// (the web's Insert menu).
struct ChordChartInsertMenu: View {
  let isEnabled: Bool
  let insert: (String) -> Void

  var body: some View {
    Menu {
      Section("Section") {
        ForEach(ChordChartSnippets.sections, id: \.self) { section in
          Button(section) { insert(section) }
        }
      }
      Section("Planning Center Codes") {
        ForEach(ChordChartSnippets.codes, id: \.text) { code in
          Button(code.label) { insert(code.text) }
        }
      }
    } label: {
      Label("Insert", systemImage: "text.badge.plus")
    }
    .disabled(!isEnabled)
    .accessibilityIdentifier("chord-chart-insert-menu")
  }
}
