import PCOBoosterCore
import SwiftUI

/// A song's arrangement and key, saved as soon as one is picked (`SongFields` in
/// `plan-item-pane.tsx`). Changing the arrangement keeps the key when it has it, else takes the
/// suggested key, else its first (`pickKeyId`). Under them: the key change into the song, and a
/// line with its tempo and how its key meets the song before it.
struct PlanItemSongFields: View {
  let item: PlanItem
  let options: QueryState<SongOptionSet>?
  let context: PlanItemDetailContext
  let currentDraft: () -> PlanItemDraft
  let actions: PlanItemDetailActions

  @State private var showsTransition = false

  private var canEdit: Bool { context.editing.canEdit }
  private var songOptions: SongOptionSet? { options?.value }

  /// The draft repaired against the loaded options, as the pickers show it.
  private var draft: PlanItemDraft {
    synchronizeDraft(currentDraft(), with: songOptions)
  }

  private var arrangements: [ArrangementOption] { songOptions?.arrangements ?? [] }

  private var selectedArrangement: ArrangementOption? {
    arrangements.first { $0.id == draft.arrangementId }
  }

  var body: some View {
    Section {
      if songOptions == nil, options?.isLoading == true {
        HStack {
          Text("Arrangement")
          Spacer()
          Skeleton(.text, width: 120)
        }
        HStack {
          Text("Key")
          Spacer()
          Skeleton(.text, width: 60)
        }
      } else {
        if let message = options?.errorMessage, songOptions == nil {
          HStack(alignment: .firstTextBaseline) {
            Text(verbatim: message)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
            Spacer()
            Button("Try Again") { options?.retry() }
              .buttonStyle(.pill(.outline, size: .small))
          }
        }
        arrangementPicker
        keyPicker
      }
      if let transition = context.transition, KeyTransitionButton.isShown(transition) {
        transitionRow(transition)
      }
      if let hint {
        Text(verbatim: hint)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
    } header: {
      SectionHeader("Arrangement and key")
    }
  }

  private var arrangementPicker: some View {
    Picker("Arrangement", selection: arrangementBinding) {
      Text("None").tag("")
      ForEach(arrangements) { arrangement in
        Text(
          verbatim: arrangement.archived
            ? String(localized: "\(arrangement.name) (archived)") : arrangement.name
        )
        .tag(arrangement.id)
      }
      // A saved arrangement the options don't list still shows by name.
      if let current = item.arrangement, !arrangements.contains(where: { $0.id == current.id }) {
        Text(verbatim: current.name).tag(current.id)
      }
    }
    .pickerStyle(.menu)
    .tint(.inkSecondary)
    .disabled(!canEdit || songOptions == nil)
    .accessibilityIdentifier("plan-item-arrangement")
  }

  private var keyPicker: some View {
    let keys = selectedArrangement?.keys ?? []
    return Picker("Key", selection: keyBinding) {
      Text("No key").tag("")
      ForEach(keys) { key in
        Text(verbatim: KeyBadge.display(keyOptionLabel(key))).tag(key.id)
      }
      if let current = item.key, !keys.contains(where: { $0.id == current.id }) {
        Text(verbatim: KeyBadge.display(keyOptionLabel(current))).tag(current.id)
      }
    }
    .pickerStyle(.menu)
    .tint(.inkSecondary)
    .disabled(!canEdit || selectedArrangement == nil || keys.isEmpty)
    .accessibilityIdentifier("plan-item-key")
  }

  private func transitionRow(_ transition: KeyTransition) -> some View {
    Button {
      showsTransition = true
    } label: {
      HStack(spacing: Spacing.md) {
        KeyTransitionGlyph(level: transition.level)
          .frame(width: 22)
        VStack(alignment: .leading, spacing: 1) {
          Text(
            verbatim:
              "\(KeyBadge.display(transition.from)) \u{2192} \(KeyBadge.display(transition.to))"
          )
          .font(.rowTitle)
          .foregroundStyle(.ink)
          Text(verbatim: transition.description)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
        Spacer(minLength: Spacing.sm)
        Text(transition.level == .smooth ? "Ideas" : "Ways to connect")
          .font(.meta)
          .foregroundStyle(.inkSecondary)
        Image(symbol: .chevronRight)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(KeyTransitionButton.accessibilityLabel(transition))
    .accessibilityIdentifier("plan-item-transition")
    .popover(isPresented: $showsTransition) {
      KeyTransitionAdviceView(
        transition: transition, item: item, serviceTypeId: context.serviceTypeId,
        canEdit: canEdit,
        onAddNote: { note in actions.addNote(item, note) },
        onChangeKey: { arrangement, key in actions.changeKey(item, arrangement, key) })
    }
  }

  /// "78 bpm · 6/8 · from F, up a whole step": tempo, and how the key meets the song before.
  private var hint: String? {
    var parts: [String] = []
    let tempo = tempoLabel(selectedArrangement)
    if !tempo.isEmpty {
      parts.append(tempo)
    }
    if let previous = context.previousSong, let start = item.key?.startingKey,
      let change = describeKeyChange(from: previous.endKey, to: start)
    {
      parts.append(String(localized: "from \(KeyBadge.display(previous.endKey)), \(change)"))
    }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }

  private var arrangementBinding: Binding<String> {
    Binding {
      draft.arrangementId
    } set: { arrangementId in
      let arrangement = arrangements.first { $0.id == arrangementId }
      let keyId =
        arrangement.map {
          pickKeyId($0, currentKeyId: draft.keyId, suggestedKeyId: songOptions?.suggestedKeyId)
        } ?? ""
      var next = currentDraft()
      next.arrangementId = arrangementId
      next.keyId = keyId
      actions.save(
        item, next, item.length, arrangement.map(RunSheetModel.optimisticArrangement),
        arrangement?.keys.first { $0.id == keyId }.map(RunSheetModel.optimisticKey))
    }
  }

  private var keyBinding: Binding<String> {
    Binding {
      draft.keyId
    } set: { keyId in
      guard let arrangement = selectedArrangement,
        let key = arrangement.keys.first(where: { $0.id == keyId })
      else { return }
      actions.changeKey(item, arrangement, key)
    }
  }
}
