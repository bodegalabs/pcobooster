import PCOBoosterCore
import SwiftUI

/// A person's assignment on the lineup (`PlanPersonEditDialog`): their status, what Planning
/// Center recorded about the scheduling email (and the decline reason), the plan times they're
/// on, and links to People and Planning Center. Changes save when the sheet closes; Unschedule
/// is a full-width button at the bottom on iPhone and asks first.
struct LineupPersonSheet: View {
  let ref: LineupPersonRef
  let model: LineupModel
  let otherAssignments: [PlanAssignment]
  /// Shown in a popover (iPad) rather than a sheet.
  var isPopover = false
  let onViewPerson: ((String) -> Void)?

  @State private var editor: LineupPersonEditor
  @State private var confirmsUnschedule = false
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(\.orgTimeZone) private var timeZone

  init(
    ref: LineupPersonRef, model: LineupModel, otherAssignments: [PlanAssignment],
    isPopover: Bool = false, onViewPerson: ((String) -> Void)?
  ) {
    self.ref = ref
    self.model = model
    self.otherAssignments = otherAssignments
    self.isPopover = isPopover
    self.onViewPerson = onViewPerson
    _editor = State(
      initialValue: LineupPersonEditor(
        ref: ref, queries: model.queries, serviceTypeId: model.context.serviceTypeId,
        planId: model.context.planId))
  }

  private var access: RosterAccess {
    RosterAccess.resolve(app.capabilities, serviceTypeId: model.context.serviceTypeId)
  }

  private var person: FilledPositionPerson { ref.person }

  var body: some View {
    @Bindable var editor = editor
    NavigationStack {
      List {
        Section {
          header
            .listRowInsets(EdgeInsets(top: Spacing.sm, leading: 0, bottom: Spacing.sm, trailing: 0))
            .listRowBackground(Color.clear)
          if let notice = access.notice {
            RosterAccessNotice(notice: notice)
              .listRowInsets(EdgeInsets())
              .listRowBackground(Color.clear)
          }
        }
        statusSection
        timesSection
        linksSection
      }
      .listStyle(.insetGrouped)
      .listSectionSpacing(Spacing.lg)
      .canvasBackground()
      .environment(\.surfaceColor, .surfaceCard)
      .toolbarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button(role: .close) { dismiss() }
            .accessibilityIdentifier("lineup-person-close")
        }
      }
      .bottomActionBar {
        Button(role: .destructive) {
          confirmsUnschedule = true
        } label: {
          Label("Unschedule", symbol: .delete)
        }
        .disabled(!access.canSchedule)
        .accessibilityIdentifier("lineup-person-unschedule")
      }
      .confirmationDialog(
        Text("Unschedule \(person.name)?"), isPresented: $confirmsUnschedule,
        titleVisibility: .visible
      ) {
        Button("Unschedule", role: .destructive) { unschedule() }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("They come off this position in Planning Center.")
      }
    }
    .queryLifecycle(editor.planTimes)
    .modifier(LineupCandidatesLifecycle(state: editor.candidates))
    .presentationDetents(isPopover ? [.large] : [.medium, .large])
    .presentationDragIndicator(.visible)
    .sensoryFeedback(trigger: editor.status) { _, new in
      new == .declined ? Haptic.warning.feedback : Haptic.selection.feedback
    }
    .onDisappear { editor.commit(to: model) }
    .accessibilityIdentifier("lineup-person-sheet")
  }

  // MARK: Header

  private var header: some View {
    HStack(spacing: Spacing.lg) {
      PersonAvatar(
        name: person.name, photoURL: person.rosterPhotoURL, size: .hero, status: editor.status,
        alsoScheduled: !otherAssignments.isEmpty)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: person.name)
          .font(.pageTitle)
          .foregroundStyle(.ink)
        Text(verbatim: rosterSlotCaption(team: ref.slot.teamName, position: ref.slot.positionName))
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
        if let also = LineupText.alsoOn(otherAssignments) {
          Text(verbatim: also)
            .font(.meta)
            .foregroundStyle(.statusInfoText)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .environment(\.surfaceColor, .surfaceCanvas)
    .accessibilityElement(children: .combine)
  }

  // MARK: Status

  private var statusSection: some View {
    Section {
      Picker("Status", selection: $editor.status) {
        ForEach(ScheduleStatus.allCases) { status in
          Text(status.label).tag(status)
        }
      }
      .pickerStyle(.segmented)
      .disabled(!access.canSchedule)
      .listRowInsets(EdgeInsets(top: Spacing.md, leading: Spacing.md, bottom: Spacing.md, trailing: Spacing.md))
      .accessibilityIdentifier("lineup-person-status")
      if editor.status == .declined, ref.status != .declined {
        noteRow(
          symbol: .warning,
          text: String(localized: "Declining takes them off this position. They stay in Assign as declined."),
          tone: .pending)
      }
      if ref.status == .declined {
        declineReasonRow
      }
      if let note = describeSchedulingNotification(person.notification, timeZone: timeZone) {
        noteRow(symbol: .mail, text: note, tone: person.rosterNotNotified ? .pending : .neutral)
        if person.rosterNotNotified, let url = model.planningCenterURL {
          Button {
            model.recheckOnReturn = true
            openURL(url)
          } label: {
            Label("Send in Planning Center", symbol: .openExternal)
              .font(.rowDetail)
          }
          .foregroundStyle(.ink)
        }
      }
    } header: {
      SectionHeader("Status")
    }
    .cardRowBackground()
  }

  @ViewBuilder private var declineReasonRow: some View {
    if editor.candidates?.value == nil, editor.candidates?.isLoading == true {
      Skeleton(.text, width: 180)
        .padding(.vertical, Spacing.xs)
    } else {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text("Decline reason")
          .font(.meta.weight(.medium))
          .foregroundStyle(.inkSecondary)
        Text(
          verbatim: editor.declineReason
            ?? String(localized: "No note was saved with this decline in Planning Center."))
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.vertical, Spacing.xxs)
      .accessibilityElement(children: .combine)
    }
  }

  private func noteRow(symbol: AppSymbol, text: String, tone: StatusTone) -> some View {
    Label {
      Text(verbatim: text)
        .fixedSize(horizontal: false, vertical: true)
    } icon: {
      symbol.image
        .foregroundStyle(tone.textColor)
    }
    .font(.meta)
    .foregroundStyle(.inkSecondary)
  }

  // MARK: Times

  @ViewBuilder private var timesSection: some View {
    let times = editor.planTimes.value ?? []
    if !times.isEmpty || editor.planTimes.isLoading {
      Section {
        if times.isEmpty {
          ForEach(0..<2, id: \.self) { _ in
            SkeletonRow(showsAvatar: false, titleWidth: 110, detailWidth: 170)
          }
        } else {
          ForEach(times) { time in
            timeRow(time)
          }
        }
      } header: {
        SectionHeader("Plan times")
      } footer: {
        if !times.isEmpty, person.rosterPersonId == nil {
          Text("Plan times cannot be edited for this assignment.")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
      }
      .cardRowBackground()
    }
  }

  private func timeRow(_ time: PlanTime) -> some View {
    let selected = editor.timeIds.contains(time.id)
    let enabled = access.canSchedule && editor.canEditTimes
    return Button {
      editor.toggleTime(time.id)
    } label: {
      HStack(spacing: Spacing.md) {
        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
          .font(.title3)
          .foregroundStyle(selected ? Color.inkFill : Color.inkTertiary)
          .contentTransition(.symbolEffect(.replace))
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: time.name)
            .font(.rowTitleEmphasized)
            .foregroundStyle(.ink)
            .lineLimit(1)
            .truncationMode(.middle)
          Text(verbatim: rangeLabel(time))
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
        Spacer(minLength: 0)
      }
      .frame(minHeight: Metrics.minimumTapTarget)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.55)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityIdentifier("lineup-person-time-\(time.id)")
  }

  /// "Sun, Oct 4 · 9:00 AM - 10:15 AM" in the congregation's zone.
  private func rangeLabel(_ time: PlanTime) -> String {
    let starts = OrgCalendar.wallTime(time.startsAt, timeZone: timeZone)
    let ends = time.endsAt.map { OrgCalendar.wallTime($0, timeZone: timeZone) }
    return formatPlanTimeRangeLabel(
      startDate: starts.dateKey, startTime: starts.timeValue,
      endDate: ends?.dateKey ?? starts.dateKey, endTime: ends?.timeValue ?? "")
  }

  // MARK: Links

  @ViewBuilder private var linksSection: some View {
    let personId = person.rosterPersonId
    if personId != nil {
      Section {
        if let onViewPerson, let personId {
          Button {
            dismiss()
            onViewPerson(personId)
          } label: {
            LineupLinkLabel(title: "View Person", symbol: .people, trailing: .chevronRight)
          }
          .buttonStyle(.plain)
        }
        if let personId, let url = RosterLinks.person(personId) {
          Button {
            openURL(url)
          } label: {
            LineupLinkLabel(title: "Open in Planning Center", symbol: .openExternal, trailing: nil)
          }
          .buttonStyle(.plain)
        }
      }
      .cardRowBackground()
    }
  }

  // MARK: Actions

  private func unschedule() {
    editor.discard()
    let ref = ref
    let model = model
    dismiss()
    Task { await model.unschedule(ref) }
  }
}

/// A link row: symbol, title, and an optional trailing chevron.
struct LineupLinkLabel: View {
  let title: LocalizedStringKey
  let symbol: AppSymbol
  let trailing: AppSymbol?

  var body: some View {
    HStack(spacing: Spacing.md) {
      symbol.image
        .foregroundStyle(.inkSecondary)
        .frame(width: 22)
      Text(title)
        .font(.rowTitle)
        .foregroundStyle(.ink)
      Spacer(minLength: 0)
      if let trailing {
        trailing.image
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
      }
    }
    .frame(minHeight: Metrics.minimumTapTarget)
    .contentShape(.rect)
  }
}

/// Appears and disappears an optional query with the view.
private struct LineupCandidatesLifecycle: ViewModifier {
  let state: QueryState<PositionCandidates>?

  func body(content: Content) -> some View {
    content
      .onAppear { state?.appear() }
      .onDisappear { state?.disappear() }
  }
}
