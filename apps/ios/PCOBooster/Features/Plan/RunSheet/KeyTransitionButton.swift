import PCOBoosterCore
import SwiftUI

/// The key change into a song from the song before it in the same section, as a key glyph toned
/// by how rough it is: quiet when smooth (ideas only), amber when worth a look, red when rough.
/// Tapping it shows ways to connect the songs (`KeyTransitionPopover`). Hidden for a smooth
/// change with no ideas.
struct KeyTransitionButton: View {
  let transition: KeyTransition
  let item: PlanItem
  let serviceTypeId: String
  let canEdit: Bool
  @Binding var isPresented: Bool
  let onAddNote: (String) -> Void
  let onChangeKey: (ArrangementOption, KeyOption) -> Void

  static func isShown(_ transition: KeyTransition) -> Bool {
    transition.level != .smooth
      || !transitionSuggestions(transition.songs, kind: transition.kind).isEmpty
  }

  var body: some View {
    if Self.isShown(transition) {
      Button {
        isPresented = true
      } label: {
        KeyTransitionGlyph(level: transition.level)
          .frame(minWidth: 28, minHeight: 28)
          .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(Self.accessibilityLabel(transition))
      .accessibilityIdentifier("run-sheet-transition-\(item.id)")
      .popover(isPresented: $isPresented) {
        KeyTransitionAdviceView(
          transition: transition, item: item, serviceTypeId: serviceTypeId, canEdit: canEdit,
          onAddNote: onAddNote, onChangeKey: onChangeKey)
      }
    }
  }

  static func accessibilityLabel(_ transition: KeyTransition) -> Text {
    let from = KeyBadge.spoken(transition.from)
    let to = KeyBadge.spoken(transition.to)
    return transition.level == .smooth
      ? Text(
        "Key change from \(from) to \(to): \(transition.description). Show ideas to connect the songs."
      )
      : Text(
        "Key change from \(from) to \(to): \(transition.description). Show ways to connect the songs."
      )
  }
}

/// The key glyph, toned by the change's level.
struct KeyTransitionGlyph: View {
  let level: KeyTransitionLevel

  var body: some View {
    Image(symbol: .songKey)
      .font(.footnote.weight(.semibold))
      .foregroundStyle(tone)
      .accessibilityHidden(true)
  }

  private var tone: Color {
    switch level {
    case .smooth: .inkTertiary
    case .worthALook: .statusPendingText
    case .rough: .destructive
    }
  }
}

/// Ways to connect two songs: concrete chord moves (each one tap away from the song's notes)
/// and, for a change that isn't smooth, other keys the song already has that come in smoothly.
/// Facts about the keys, never a pick of songs.
struct KeyTransitionAdviceView: View {
  let transition: KeyTransition
  let item: PlanItem
  let serviceTypeId: String
  let canEdit: Bool
  let onAddNote: (String) -> Void
  let onChangeKey: (ArrangementOption, KeyOption) -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @State private var hasAppeared = false

  private var isTip: Bool { transition.level == .smooth }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.lg) {
        header
        if canEdit {
          Label("Tap an idea to add it to notes.", systemImage: "note.text.badge.plus")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.surfaceSecondary, in: .rect(cornerRadius: Radius.control, style: .continuous))
        }
        suggestions
        if !isTip, canEdit, let songId = item.song?.id {
          KeyTransitionAlternates(
            transition: transition, songId: songId, serviceTypeId: serviceTypeId
          ) { arrangement, key in
            dismiss()
            onChangeKey(arrangement, key)
          }
        }
      }
      .padding(Spacing.xl)
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(idealWidth: 360, maxWidth: horizontalSizeClass == .regular ? 380 : .infinity)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .onAppear { hasAppeared = true }
    .haptic(.warning, trigger: hasAppeared) { _, appeared in
      appeared && transition.level == .rough
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      Text(verbatim: "\(KeyBadge.display(transition.from)) \u{2192} \(KeyBadge.display(transition.to))")
        .font(.pageTitle)
        .foregroundStyle(.ink)
        .accessibilityLabel(
          Text("\(KeyBadge.spoken(transition.from)) to \(KeyBadge.spoken(transition.to))"))
      Text(verbatim: summary)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .combine)
  }

  /// "Morning Light into Steady Ground: closely related key." plus the bridging item.
  private var summary: String {
    let description = transition.description
    let lowered = description.prefix(1).lowercased() + description.dropFirst()
    var text = "\(transition.fromTitle) into \(transition.toTitle): \(lowered)."
    if let bridgedBy = transition.bridgedBy {
      text += " \(bridgedBy) gives the band room to change."
    }
    return text
  }

  private var suggestions: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      ForEach(transitionSuggestions(transition.songs, kind: transition.kind)) { suggestion in
        let note = suggestionNote(suggestion)
        let added = item.description.contains(note)
        Button {
          onAddNote(note)
        } label: {
          HStack(alignment: .top, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
              Text(verbatim: suggestion.title)
                .font(.rowTitleEmphasized)
                .foregroundStyle(.ink)
              Text(Self.attributed(suggestion.segments))
                .font(.rowDetail)
                .foregroundStyle(.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if canEdit {
              Image(systemName: added ? "checkmark" : "note.text.badge.plus")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.inkSecondary)
                .contentTransition(.symbolEffect(.replace))
                .padding(.top, 2)
            }
          }
          .padding(.vertical, Spacing.sm)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(added || !canEdit)
        .accessibilityLabel(
          added ? Text("\(suggestion.title): in notes") : Text("\(suggestion.title): add to notes"))
        .accessibilityHint(Text(Self.attributed(suggestion.segments)))
      }
    }
    .haptic(.selection, trigger: item.description)
  }

  /// The advice with chord and key names in bold ink.
  static func attributed(_ segments: [AdviceSegment]) -> AttributedString {
    var text = AttributedString()
    for segment in segments {
      var part = AttributedString(segment.text)
      if segment.isChord {
        part.inlinePresentationIntent = .stronglyEmphasized
        part.swiftUI.foregroundColor = Color.ink
      }
      text += part
    }
    return text
  }
}

/// "Or play Steady Ground in": keys on the song's live arrangements within a whole step of the
/// planned key that come in smoothly (`rankAlternateKeys`). Picking one changes the
/// arrangement and key.
private struct KeyTransitionAlternates: View {
  let transition: KeyTransition
  let onPick: (ArrangementOption, KeyOption) -> Void
  @ScreenModel private var model: SongOptionsModel

  init(
    transition: KeyTransition, songId: String, serviceTypeId: String,
    onPick: @escaping (ArrangementOption, KeyOption) -> Void
  ) {
    self.transition = transition
    self.onPick = onPick
    _model = ScreenModel { app in
      SongOptionsModel(queries: app.queries, songId: songId, serviceTypeId: serviceTypeId)
    }
  }

  private struct Alternate: Identifiable {
    let arrangement: ArrangementOption
    let key: KeyOption
    var id: String { "\(arrangement.id):\(key.id)" }
  }

  private var alternates: [Alternate] {
    var candidates: [(key: SpelledKey, value: Alternate)] = []
    for arrangement in model.options.value?.arrangements ?? [] where !arrangement.archived {
      for key in arrangement.keys {
        if let parsed = KeyTheory.parse(key.startingKey ?? key.name) {
          candidates.append((parsed, Alternate(arrangement: arrangement, key: key)))
        }
      }
    }
    let ranked = rankAlternateKeys(
      (from: transition.fromKey, to: transition.toKey), candidates: candidates)
    var seen = Set<String>()
    return ranked.filter { seen.insert($0.key.startingKey ?? "").inserted }
  }

  var body: some View {
    let alternates = alternates
    if !alternates.isEmpty {
      VStack(alignment: .leading, spacing: Spacing.xs) {
        Divider()
          .padding(.bottom, Spacing.sm)
        Text("Or play \(transition.toTitle) in")
          .font(.sectionLabel)
          .foregroundStyle(.inkSecondary)
        ForEach(alternates) { alternate in
          Button {
            onPick(alternate.arrangement, alternate.key)
          } label: {
            HStack(spacing: Spacing.md) {
              Text(verbatim: keyName(alternate))
                .font(.rowTitleEmphasized)
                .foregroundStyle(.ink)
                .frame(minWidth: 32, alignment: .leading)
              Text(verbatim: detail(alternate))
                .font(.rowDetail)
                .foregroundStyle(.inkSecondary)
                .lineLimit(1)
              Spacer(minLength: Spacing.sm)
              Image(symbol: .chevronRight)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.inkTertiary)
            }
            .frame(minHeight: Metrics.minimumTapTarget)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("Play in \(keyName(alternate)), \(detail(alternate))"))
        }
      }
      .queryLifecycle(model.options)
    } else {
      Color.clear
        .frame(height: 0)
        .queryLifecycle(model.options)
    }
  }

  private func keyName(_ alternate: Alternate) -> String {
    let parsed = KeyTheory.parse(alternate.key.startingKey ?? alternate.key.name)
    return KeyBadge.display(KeyTheory.name(parsed ?? transition.toKey))
  }

  private func detail(_ alternate: Alternate) -> String {
    let label = keyOptionLabel(alternate.key)
    return label == (alternate.key.startingKey ?? "")
      ? alternate.arrangement.name
      : "\(alternate.arrangement.name) \u{B7} \(label)"
  }
}
