import PCOBoosterCore
import SwiftUI

/// The plan time form's fields, shared by the edit sheet, the iPad inspector, and the add sheet
/// (web `PlanTimeFormFields`): name, type, when, and who the time is for. A time the person can't
/// change opens read-only, with the reason on top.
struct PlanTimeEditorForm: View {
  @Bindable var editor: PlanTimeEditorModel
  let model: PlanTimesModel
  let access: PlanTimesAccess
  /// Why this time can't change, or nil when it can.
  let lockReason: String?
  /// The name field's focus, owned by the sheet so it can tuck its bottom actions away while
  /// the keyboard is up.
  let nameFocused: FocusState<Bool>.Binding

  private var isEditable: Bool { lockReason == nil }

  var body: some View {
    List {
      if let lockReason {
        Section {
          InfoBanner(verbatim: lockReason)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("time-lock-reason")
        }
      }
      nameSection
      typeSection
      PlanTimeWhenSection(editor: editor, isEditable: isEditable)
      assignmentsSection
    }
    .canvasBackground()
    .scrollDismissesKeyboard(.interactively)
    .listSectionSpacing(.compact)
  }

  // MARK: Name

  private var nameSection: some View {
    Section {
      TextField(text: $editor.name, prompt: Text("Untitled time")) {
        Text("Time name")
      }
      .font(.cardTitle)
      .foregroundStyle(.ink)
      .submitLabel(.done)
      .focused(nameFocused)
      .onSubmit { nameFocused.wrappedValue = false }
      .disabled(!isEditable)
      .accessibilityIdentifier("time-name-field")
    } header: {
      SectionHeader("Name")
    } footer: {
      if editor.invalidField == .name, let message = editor.validationMessage {
        TimeValidationMessage(message: message)
      }
    }
    .cardRowBackground()
  }

  // MARK: Type

  private var typeSection: some View {
    Section {
      Picker(selection: $editor.timeType) {
        ForEach(typeOptions, id: \.rawValue) { type in
          Text(verbatim: PlanTimeKind(type).label).tag(type)
        }
      } label: {
        Text("Type")
      }
      .pickerStyle(.segmented)
      .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.md, bottom: Spacing.sm, trailing: Spacing.md))
      .disabled(!isEditable)
      .accessibilityIdentifier("time-type-picker")
    } header: {
      SectionHeader("Type")
    } footer: {
      if isEditable, let hint = access.serviceTypeHint {
        Text(verbatim: hint)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
    }
    .cardRowBackground()
    .haptic(.selection, trigger: editor.timeType)
  }

  /// The types the picker offers: those the person may set (the time's own type always shows).
  private var typeOptions: [PlanTimeType] {
    guard isEditable else { return PlanTimeKind.pickerOrder }
    return PlanTimeKind.pickerOrder.filter { access.canChange($0) || $0 == editor.timeType }
  }

  // MARK: Assignments

  private var assignmentsSection: some View {
    Section {
      if let groups = model.groups {
        NavigationLink {
          TimeAssignmentPicker(
            value: $editor.assignments, groups: groups, isEditable: isEditable)
        } label: {
          LabeledContent {
            Text(verbatim: TimeAssignments.label(groups: groups, value: editor.assignments))
              .foregroundStyle(.inkSecondary)
              .multilineTextAlignment(.trailing)
          } label: {
            Text("Assigned to")
          }
        }
        .accessibilityIdentifier("time-assignments-row")
        let people = scheduledPeople(groups)
        if !people.isEmpty {
          TimesPeopleRow(people: people)
        }
      } else if let message = model.positions.errorMessage {
        LabeledContent {
          Button("Try again") { model.positions.retry() }
            .buttonStyle(.pill(.outline, size: .small))
        } label: {
          VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text("Couldn't load teams")
            Text(verbatim: message).font(.meta).foregroundStyle(.inkSecondary)
          }
        }
      } else {
        LabeledContent {
          Skeleton(.text, width: 96, height: 12)
        } label: {
          Text("Assigned to")
        }
        .accessibilityLabel(Text("Assigned to, loading"))
      }
    } header: {
      SectionHeader("Assignments")
    } footer: {
      if editor.isCreating, !(editor.assignments.neededPositionIds.isEmpty
        && editor.assignments.planPersonIds.isEmpty)
      {
        Text("Plan slots and people are added once the time is created.")
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
    }
    .cardRowBackground()
  }

  /// The people the draft ties to this time, minus declines, for the quiet avatar row.
  private func scheduledPeople(_ groups: [TeamPositionGroup]) -> [TimePersonOption] {
    let chosen = Set(editor.assignments.planPersonIds)
    var seen = Set<String>()
    return TimeAssignments.personOptions(groups).filter { person in
      chosen.contains(person.planPersonId) && person.status != .declined
        && seen.insert(person.personId ?? person.name).inserted
    }
  }
}

/// A quiet row of overlapping avatars with a count: who will be at this time.
struct TimesPeopleRow: View {
  let people: [TimePersonOption]
  var limit = 6

  var body: some View {
    HStack(spacing: Spacing.sm) {
      TimesAvatarStack(people: people, limit: limit, size: .small)
      Text(verbatim: TimeAssignments.counted(people.count, "person", "people"))
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .contentTransition(.numericText(value: Double(people.count)))
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: spokenPeople))
  }

  private var spokenPeople: String {
    let names = people.prefix(limit).map(\.name)
    let rest = people.count - names.count
    let list = names.formatted(.list(type: .and))
    return rest > 0 ? "\(list), and \(rest) more" : list
  }
}

/// Overlapping avatars, each cut out of the surface behind it, with "+N" past `limit`.
struct TimesAvatarStack: View {
  let people: [TimePersonOption]
  var limit = 4
  var size: PersonAvatar.Size = .small
  @Environment(\.surfaceColor) private var surfaceColor

  var body: some View {
    let shown = Array(people.prefix(limit))
    HStack(spacing: -size.diameter * 0.3) {
      ForEach(shown) { person in
        PersonAvatar(name: person.name, photoURL: person.photoURL, size: size)
          .padding(1.5)
          .background(surfaceColor, in: .circle)
      }
      if people.count > shown.count {
        Text(verbatim: "+\(people.count - shown.count)")
          .font(.system(size: size.diameter * 0.4, weight: .medium))
          .monospacedDigit()
          .foregroundStyle(.inkSecondary)
          .frame(width: size.diameter, height: size.diameter)
          .background(.surfaceMuted, in: .circle)
          .padding(1.5)
          .background(surfaceColor, in: .circle)
      }
    }
    .accessibilityHidden(true)
  }
}
