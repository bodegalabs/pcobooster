import PCOBoosterCore
import SwiftUI

/// Someone on a position (`EditablePersonRow`): avatar with their status dot (and the blue
/// ring when they're also on another position), the name (struck through when declined),
/// "Also on Keys" under it, and the envelope while their scheduling email is unsent. Tapping
/// it opens their assignment.
struct LineupPersonRow: View {
  let ref: LineupPersonRef
  let otherAssignments: [PlanAssignment]
  let actions: LineupActions

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private var person: FilledPositionPerson { ref.person }
  private var isDeclined: Bool { ref.status == .declined }
  private var nameLines: Int { dynamicTypeSize.isAccessibilitySize ? 3 : 1 }

  var body: some View {
    Button {
      actions.editPerson(ref)
    } label: {
      HStack(spacing: Spacing.md) {
        PersonAvatar(
          name: person.name, photoURL: person.rosterPhotoURL, size: .regular, status: ref.status,
          alsoScheduled: !otherAssignments.isEmpty)
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: Spacing.xs + 2) {
            Text(verbatim: person.name)
              .font(.rowTitle)
              .foregroundStyle(isDeclined ? Color.inkSecondary : Color.ink)
              .strikethrough(isDeclined, color: .inkSecondary)
              .lineLimit(nameLines)
            if isDeclined {
              Text("Declined")
                .capsLabelStyle()
                .foregroundStyle(.statusDeclinedText)
                .fixedSize()
            }
          }
          if let also = LineupText.alsoOn(otherAssignments) {
            Text(verbatim: also)
              .font(.meta)
              .foregroundStyle(.statusInfoText)
              .lineLimit(nameLines)
          }
        }
        Spacer(minLength: Spacing.sm)
        if person.rosterNotNotified {
          Image(symbol: .mail)
            .font(.footnote)
            .foregroundStyle(.inkSecondary)
            .accessibilityHidden(true)
        }
      }
      .padding(.leading, LineupMetrics.personInset)
      .frame(minHeight: Metrics.minimumTapTarget)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: person.name))
    .accessibilityValue(
      Text(
        verbatim: LineupText.personSummary(
          status: ref.status, otherAssignments: otherAssignments,
          notNotified: person.rosterNotNotified)))
    .accessibilityHint(Text("Edits their assignment"))
    .accessibilityAddTraits(.isButton)
    .accessibilityActions {
      if actions.canSchedule {
        ForEach(ScheduleStatus.allCases.filter { $0 != ref.status }) { status in
          Button {
            actions.setStatus(ref, status)
          } label: {
            Text("Mark \(Text(status.label))")
          }
        }
        Button("Unschedule") { actions.unschedule(ref) }
      }
    }
    .accessibilityIdentifier("lineup-person-\(person.planPersonId)")
  }
}

/// A person row's long-press menu: their status (current checked), Unschedule, edit, and the
/// People and Planning Center links.
struct LineupPersonMenu: View {
  let ref: LineupPersonRef
  let actions: LineupActions

  @Environment(\.openURL) private var openURL

  var body: some View {
    RosterStatusMenuItems(
      current: ref.status, isEnabled: actions.canSchedule,
      onSelect: { actions.setStatus(ref, $0) },
      onUnschedule: { actions.unschedule(ref) })
    Divider()
    Button {
      actions.editPerson(ref)
    } label: {
      Label("Edit Assignment\u{2026}", symbol: .times)
    }
    if let viewPerson = actions.viewPerson, let personId = ref.person.rosterPersonId {
      Button {
        viewPerson(personId)
      } label: {
        Label("View Person", symbol: .people)
      }
    }
    if let personId = ref.person.rosterPersonId, let url = RosterLinks.person(personId) {
      Button {
        openURL(url)
      } label: {
        Label("Open in Planning Center", symbol: .openExternal)
      }
    }
  }
}

/// The long-press preview of a person: who they are, the slot, their status, and what
/// Planning Center recorded about the scheduling email.
struct LineupPersonPreview: View {
  let ref: LineupPersonRef
  let otherAssignments: [PlanAssignment]

  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md) {
        PersonAvatar(
          name: ref.person.name, photoURL: ref.person.rosterPhotoURL, size: .large,
          status: ref.status, alsoScheduled: !otherAssignments.isEmpty)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: ref.person.name)
            .font(.cardTitle)
            .foregroundStyle(.ink)
          Text(verbatim: rosterSlotCaption(team: ref.slot.teamName, position: ref.slot.positionName))
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
        Spacer(minLength: Spacing.md)
        StatusBadge(status: ref.status)
      }
      if let also = LineupText.alsoOn(otherAssignments) {
        Label {
          Text(verbatim: also)
        } icon: {
          StatusDot(tone: .info, size: 7)
        }
        .font(.meta)
        .foregroundStyle(.statusInfoText)
      }
      if let note = describeSchedulingNotification(ref.person.notification, timeZone: timeZone) {
        Label {
          Text(verbatim: note)
            .fixedSize(horizontal: false, vertical: true)
        } icon: {
          Image(symbol: .mail)
        }
        .font(.meta)
        .foregroundStyle(.inkSecondary)
      }
    }
    .padding(Spacing.lg)
    .frame(width: 320, alignment: .leading)
    .background(.surfaceCard)
    .environment(\.surfaceColor, .surfaceCard)
  }
}

/// A position's long-press preview: its people and open slots. Showing it is a deliberate
/// long press, so the position's candidates start loading speculatively behind it.
struct LineupPositionPreview: View {
  let group: TeamPositionGroup
  let position: TeamPosition
  let onAppear: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md - 2) {
        AppSymbol.rosterPosition(position.name, team: group.teamName).image
          .font(.body)
          .foregroundStyle(.inkSecondary)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: position.name)
            .font(.cardTitle)
            .italic(position.rosterIsTemporary)
            .foregroundStyle(.ink)
          Text(verbatim: group.teamName)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
        Spacer(minLength: Spacing.md)
        Text(verbatim: "\(position.rosterFilled)/\(position.rosterTotalSlots)")
          .font(.numericMeta.weight(.semibold))
          .foregroundStyle(.inkSecondary)
      }
      VStack(alignment: .leading, spacing: Spacing.sm) {
        ForEach(position.rosterPeople, id: \.planPersonId) { person in
          HStack(spacing: Spacing.sm) {
            PersonAvatar(
              name: person.name, photoURL: person.rosterPhotoURL, size: .small,
              status: person.rosterStatus)
            Text(verbatim: person.name)
              .font(.rowDetail)
              .foregroundStyle(.ink)
            Spacer(minLength: 0)
            Text(person.rosterStatus.label)
              .font(.meta)
              .foregroundStyle(person.rosterStatus.tone.textColor)
          }
        }
        if position.rosterOpenSlots > 0 || position.rosterPeople.isEmpty {
          Text(LineupText.openLabel(open: position.rosterOpenSlots))
            .font(.rowDetail.weight(.medium))
            .foregroundStyle(
              position.rosterOpenSlots > 0 ? Color.statusDeclinedText : Color.inkSecondary)
        }
      }
    }
    .padding(Spacing.lg)
    .frame(width: 300, alignment: .leading)
    .background(.surfaceCard)
    .environment(\.surfaceColor, .surfaceCard)
    .onAppear(perform: onAppear)
  }
}

/// A position's long-press menu: fill it in Assign, change its open slots, or add a position.
struct LineupPositionMenu: View {
  let group: TeamPositionGroup
  let position: TeamPosition
  let actions: LineupActions

  var body: some View {
    Button {
      actions.openPosition(SlotRef.roster(group: group, position: position))
    } label: {
      Label("Find Someone", symbol: .assign)
    }
    Section {
      Button {
        actions.adjustSlots(position, .add)
      } label: {
        Label("Add Open Slot", symbol: .add)
      }
      .disabled(!actions.canSchedule || !NeededSlotsAdjuster.canAdd(position))
      Button {
        actions.adjustSlots(position, .remove)
      } label: {
        Label("Remove Open Slot", symbol: .subtract)
      }
      .disabled(!actions.canSchedule || !NeededSlotsAdjuster.canRemove(position))
    }
    if actions.canSchedule {
      Button {
        actions.addPosition(group)
      } label: {
        Label("Add Position to \(group.teamName)\u{2026}", symbol: .add)
      }
    }
  }
}
