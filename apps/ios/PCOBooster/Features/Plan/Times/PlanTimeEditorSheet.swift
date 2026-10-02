import PCOBoosterCore
import SwiftUI

/// The plan time form with its chrome: the iPhone edit sheet, the iPad inspector, and the add
/// sheet.
///
/// Editing saves when the form closes (swipe down, tap outside, the close button, or the next
/// time picked on iPad), with no Save button and no success toast. A form that can't save keeps
/// itself open: swiping down is held, and the close button asks to keep editing or discard,
/// with the reason shown inline. Delete sits at the bottom as a full-width destructive button on
/// iPhone and asks first. Adding is the one explicit action: "Add time" at the bottom, disabled
/// until the form is valid, with the close button discarding (after asking, once changed).
struct PlanTimeEditorSheet: View {
  @Bindable var editor: PlanTimeEditorModel
  let model: PlanTimesModel
  let access: PlanTimesAccess
  /// Closes the form; the owner saves the draft unless `editor.discarded`.
  let onClose: () -> Void
  let onDelete: (PlanTime) -> Void
  let onAdd: (EditablePlanTime) -> Void

  @State private var confirmingDelete = false
  @FocusState private var nameFocused: Bool

  private var planTime: PlanTime? {
    editor.planTimeId.flatMap(model.time(id:))
  }

  private var lockReason: String? {
    if let planTime {
      return access.lockReason(for: planTime.timeType)
    }
    return access.canAdd ? nil : access.lockReason(for: editor.timeType)
  }

  private var hasChanges: Bool {
    editor.hasChanges(against: planTime, groups: model.groups)
  }

  /// Swiping the sheet away is held while closing would lose work: an add with changes, or an
  /// edit that can't save.
  private var holdsDismiss: Bool {
    editor.isCreating ? hasChanges : hasChanges && !editor.isValid
  }

  var body: some View {
    NavigationStack {
      PlanTimeEditorForm(
        editor: editor, model: model, access: access, lockReason: lockReason,
        nameFocused: $nameFocused
      )
      .navigationTitle(title)
      .navigationSubtitle(Text(verbatim: subtitle))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { toolbar }
      .safeAreaBar(edge: .bottom, spacing: 0) {
        if showsActions {
          BottomActionBar { actions }
        }
      }
      .confirmationDialog(
        discardTitle, isPresented: $editor.isConfirmingDiscard, titleVisibility: .visible
      ) {
        Button(editor.isCreating ? "Discard time" : "Discard changes", role: .destructive) {
          editor.discarded = true
          onClose()
        }
        Button("Keep editing", role: .cancel) {}
      } message: {
        if !editor.isCreating, let message = editor.validationMessage {
          Text(verbatim: message)
        }
      }
    }
    .interactiveDismissDisabled(holdsDismiss)
    .onChange(of: model.groups) { _, groups in
      if let planTime {
        editor.syncAssignments(from: planTime, groups: groups)
      }
    }
    .haptic(.warning, trigger: editor.refusedCloses)
    .accessibilityIdentifier(editor.isCreating ? "time-add-sheet" : "time-editor")
  }

  /// "Add time", "Edit time", or just "Time" when the person can only look.
  private var title: Text {
    if editor.isCreating {
      return Text("Add time")
    }
    return lockReason == nil ? Text("Edit time") : Text("Time")
  }

  private var subtitle: String {
    TimeFacts.displayNameForDraft(editor.draft)
  }

  /// Delete steps aside while the name is being typed, so it never rides the keyboard; Add time
  /// stays, as the one way to finish the add sheet.
  private var showsActions: Bool {
    hasActions && (editor.isCreating || !nameFocused)
  }

  private var discardTitle: Text {
    editor.isCreating ? Text("Discard this time?") : Text("This time can't be saved")
  }

  // MARK: Toolbar

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    if editor.isCreating {
      ToolbarItem(placement: .cancellationAction) {
        Button(role: .close) {
          if hasChanges {
            editor.isConfirmingDiscard = true
          } else {
            editor.discarded = true
            onClose()
          }
        }
        .accessibilityIdentifier("time-add-close")
      }
    } else {
      ToolbarItem(placement: .topBarTrailing) {
        Button(role: .close) {
          attemptClose()
        }
        .accessibilityIdentifier("time-editor-close")
      }
    }
  }

  private func attemptClose() {
    if hasChanges, !editor.isValid {
      editor.refuseClose()
    } else {
      onClose()
    }
  }

  // MARK: Bottom actions

  private var hasActions: Bool {
    if editor.isCreating {
      return true
    }
    guard let planTime else { return false }
    return lockReason == nil && !TimeFacts.isPending(planTime)
  }

  @ViewBuilder private var actions: some View {
    if editor.isCreating {
      Button {
        editor.discarded = true
        onAdd(editor.draft)
      } label: {
        Text("Add time")
      }
      .disabled(!editor.isValid || lockReason != nil)
      .accessibilityIdentifier("time-add-confirm")
    } else if let planTime, lockReason == nil, !TimeFacts.isPending(planTime) {
      Button("Delete time", role: .destructive) {
        confirmingDelete = true
      }
      .accessibilityIdentifier("time-delete-button")
      .confirmationDialog(
        "Delete time?", isPresented: $confirmingDelete, titleVisibility: .visible
      ) {
        Button("Delete time", role: .destructive) {
          editor.discarded = true
          onDelete(planTime)
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("Remove this time from the plan? Any assignments tied to it will also lose this time.")
      }
    }
  }
}

extension TimeFacts {
  /// The form's subtitle: the draft's name, or its type when unnamed.
  static func displayNameForDraft(_ draft: EditablePlanTime) -> String {
    let trimmed = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? PlanTimeKind(draft.timeType).label : trimmed
  }
}
