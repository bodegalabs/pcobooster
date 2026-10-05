import PCOBoosterCore
import SwiftUI

/// A song's key as a badge; tapping it lists the song's arrangements and their keys, and picking
/// one saves right away (`SongKeyPicker` in `plan-item-inline-editors.tsx`). Read-only rows show
/// the badge alone.
struct SongKeyButton: View {
  let item: PlanItem
  let serviceTypeId: String
  let canEdit: Bool
  @Binding var isPresented: Bool
  let onChange: (ArrangementOption, KeyOption) -> Void

  var body: some View {
    if canEdit, let songId = item.song?.id {
      Button {
        isPresented = true
      } label: {
        RunSheetKeyBadge(key: item.key)
          .padding(.vertical, Spacing.xs)
          .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(accessibilityLabel)
      .accessibilityIdentifier("run-sheet-key-\(item.id)")
      .popover(isPresented: $isPresented, arrowEdge: .top) {
        SongKeyPickerList(
          item: item, songId: songId, serviceTypeId: serviceTypeId, onChange: onChange
        )
        .presentationCompactAdaptation(.popover)
      }
    } else {
      RunSheetKeyBadge(key: item.key)
    }
  }

  private var accessibilityLabel: Text {
    switch RunSheetFormatting.keyDisplay(item.key) {
    case .none:
      Text("Choose a key for \(RunSheetFormatting.title(item))")
    case .key(let key), .named(let key):
      Text("Key \(KeyBadge.spoken(key)), change key for \(RunSheetFormatting.title(item))")
    case .change(let from, let to):
      Text(
        "Key \(KeyBadge.spoken(from)) to \(KeyBadge.spoken(to)), change key for \(RunSheetFormatting.title(item))"
      )
    }
  }
}

/// The badge for a plan item's key: "G", "G → A", the key's name, or an amber "No key".
struct RunSheetKeyBadge: View {
  let key: PlanItemKey?

  var body: some View {
    switch RunSheetFormatting.keyDisplay(key) {
    case .none: KeyBadge(nil)
    case .key(let start): KeyBadge(start)
    case .change(let from, let to): KeyBadge(from: from, to: to)
    case .named(let name): KeyBadge(name)
    }
  }
}

/// The song's live arrangements with their keys ("Bb", then "Jordan's key" under it); the
/// item's current pick carries a checkmark.
struct SongKeyPickerList: View {
  let item: PlanItem
  let onChange: (ArrangementOption, KeyOption) -> Void
  @ScreenModel private var model: SongOptionsModel
  @Environment(\.dismiss) private var dismiss
  @State private var contentHeight: CGFloat = 0

  init(
    item: PlanItem, songId: String, serviceTypeId: String,
    onChange: @escaping (ArrangementOption, KeyOption) -> Void
  ) {
    self.item = item
    self.onChange = onChange
    _model = ScreenModel { app in
      SongOptionsModel(queries: app.queries, songId: songId, serviceTypeId: serviceTypeId)
    }
  }

  var body: some View {
    ScrollView {
      content
        .padding(.vertical, Spacing.sm)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(width: 280, height: min(max(contentHeight, 44), 420))
    .queryLifecycle(model.options)
  }

  @ViewBuilder private var content: some View {
    if let options = model.options.value {
      let arrangements = options.arrangements.filter { !$0.archived && !$0.keys.isEmpty }
      if arrangements.isEmpty {
        Text("No arrangements with keys.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .frame(maxWidth: .infinity)
          .padding(Spacing.lg)
      } else {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(arrangements) { arrangement in
            arrangementGroup(arrangement)
          }
        }
      }
    } else if let message = model.options.errorMessage {
      VStack(spacing: Spacing.sm) {
        Text(verbatim: message)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .multilineTextAlignment(.center)
        Button("Try Again") { model.options.retry() }
          .buttonStyle(.pill(.outline, size: .small))
      }
      .frame(maxWidth: .infinity)
      .padding(Spacing.lg)
    } else {
      VStack(alignment: .leading, spacing: Spacing.md) {
        Skeleton(.text, width: 96)
        Skeleton(.text, width: 140)
        Skeleton(.text, width: 120)
      }
      .padding(Spacing.lg)
    }
  }

  private func arrangementGroup(_ arrangement: ArrangementOption) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(verbatim: arrangement.name)
        .capsLabelStyle()
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xs)
        .accessibilityAddTraits(.isHeader)
      ForEach(arrangement.keys) { key in
        keyRow(key, in: arrangement)
      }
    }
  }

  private func keyRow(_ key: KeyOption, in arrangement: ArrangementOption) -> some View {
    let parts = keyOptionParts(key)
    let isCurrent = item.arrangement?.id == arrangement.id && item.key?.id == key.id
    return Button {
      dismiss()
      if !isCurrent {
        onChange(arrangement, key)
      }
    } label: {
      HStack(spacing: Spacing.md) {
        VStack(alignment: .leading, spacing: 1) {
          Text(verbatim: KeyBadge.display(parts.label))
            .font(.rowTitle)
            .foregroundStyle(.ink)
          if let description = parts.description {
            Text(verbatim: description)
              .font(.meta)
              .foregroundStyle(.inkSecondary)
          }
        }
        Spacer(minLength: Spacing.sm)
        if isCurrent {
          Image(symbol: .checkmark)
            .font(.body.weight(.semibold))
            .foregroundStyle(.ink)
        }
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.sm)
      .frame(minHeight: Metrics.minimumTapTarget)
      .contentShape(.rect)
    }
    .buttonStyle(KeyRowButtonStyle())
    .accessibilityAddTraits(isCurrent ? .isSelected : [])
  }
}

/// Rows in a picker popover: the press fill shows and clears instantly.
private struct KeyRowButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed ? Color.surfaceHighlight : Color.clear)
  }
}
