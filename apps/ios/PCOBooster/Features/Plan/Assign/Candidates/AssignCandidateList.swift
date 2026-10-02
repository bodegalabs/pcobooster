import PCOBoosterCore
import SwiftUI

/// The candidate list for the open position (`SchedulePeopleList`), partitioned for the
/// recommendation strip: Scheduled (on the slot, off-roster people, then the open slots), Add
/// someone (by fit, then name, ending with "Someone else..."), and Unavailable (blocked, then
/// declined, dimmed). While scores are pending the list keeps name order and reorders once.
struct AssignCandidateList: View {
  let model: AssignModel
  let resolved: AssignResolvedSlot
  let access: SchedulingAccess
  let showsHistory: Bool
  let selectedCandidateId: String?
  let showsPersonLinks: Bool
  let onOpenDetails: (String) -> Void
  let onSomeoneElse: () -> Void
  let onUnschedule: (RosterUnscheduleRequest) -> Void
  let onViewPerson: (String) -> Void

  @Environment(\.openURL) private var openURL
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let snapshot = ListSnapshot(model: model, resolved: resolved)
    List {
      if let notice = access.notice {
        SchedulingAccessNotice(notice: notice)
          .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
      }
      if let pipeline = model.pipeline, pipeline.failedPartCount > 0 {
        InfoBanner("Some history or availability failed to load.", tone: .destructive) {
          Button("Retry") { pipeline.retryFailed() }
            .accessibilityIdentifier("assign-retry")
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
      }
      if model.pipeline?.isLoading == true {
        skeleton
      } else if let message = model.pipeline?.candidatesError {
        Section {
          EmptyState("Couldn't load people", symbol: .alert, description: LocalizedStringKey(message)) {
            Button("Try Again") { model.pipeline?.candidates.retry() }
              .buttonStyle(.pill(.secondary))
          }
          .listRowBackground(Color.clear)
        }
      } else {
        scheduledSection(snapshot)
        addSection(snapshot)
        if !snapshot.exceptions.isEmpty {
          unavailableSection(snapshot)
        }
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(Spacing.lg)
    .canvasBackground()
    .environment(\.surfaceColor, .surfaceCard)
    .animation(
      Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.28), instantWhenReduced: true),
      value: snapshot.orderKey)
    .accessibilityIdentifier("assign-candidates")
  }

  // MARK: Sections

  private func scheduledSection(_ snapshot: ListSnapshot) -> some View {
    Section {
      ForEach(snapshot.onSlot) { person in
        candidateRow(person, snapshot: snapshot)
      }
      ForEach(snapshot.offRoster, id: \.planPersonId) { person in
        OffRosterPersonRow(
          person: person, canSchedule: access.canSchedule,
          onSetStatus: { status in
            Task {
              await model.setStatus(status, planPersonId: person.planPersonId, personId: person.personId)
            }
          },
          onUnschedule: {
            onUnschedule(
              RosterUnscheduleRequest(
                planPersonId: person.planPersonId, personId: person.personId, name: person.name))
          }
        )
        .cardRowBackground()
      }
      if snapshot.open > 0 || snapshot.filledCount == 0 {
        AssignOpenSlotsRow(open: snapshot.open)
          .cardRowBackground()
      }
    } header: {
      SectionHeader("Scheduled") {
        NeededSlotsStepper(
          position: resolved.position, adjuster: model.adjuster, isEnabled: access.canSchedule)
      }
    } footer: {
      if access.canSchedule, !NeededSlotsAdjuster.canAdjust(resolved.position) {
        Text("Add the first open slot in Planning Center.")
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
    }
  }

  private func addSection(_ snapshot: ListSnapshot) -> some View {
    Section {
      ForEach(snapshot.candidates) { person in
        candidateRow(person, snapshot: snapshot)
      }
      if snapshot.candidates.isEmpty {
        Text(emptyCandidatesMessage(snapshot))
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .padding(.vertical, Spacing.xs)
          .cardRowBackground()
      }
      SomeoneElseRow(isEnabled: access.canSchedule, action: onSomeoneElse)
        .cardRowBackground()
    } header: {
      SectionHeader("Add someone", count: snapshot.candidates.count)
    }
  }

  private func unavailableSection(_ snapshot: ListSnapshot) -> some View {
    Section {
      ForEach(snapshot.exceptions) { person in
        candidateRow(person, snapshot: snapshot)
      }
    } header: {
      SectionHeader("Unavailable", count: snapshot.exceptions.count)
    }
  }

  private func emptyCandidatesMessage(_ snapshot: ListSnapshot) -> LocalizedStringResource {
    if !resolved.position.rosterHasCandidates {
      return "This position has no roster. Search for anyone below."
    }
    return model.filter.isEmpty ? "Everyone on the roster is scheduled or unavailable." : "No one matches."
  }

  private var skeleton: some View {
    Group {
      Section {
        ForEach(0..<2, id: \.self) { index in
          SkeletonRow(titleWidth: [120, 150][index], detailWidth: [90, 70][index])
            .cardRowBackground()
        }
      } header: {
        SectionHeader("Scheduled")
      }
      Section {
        ForEach(0..<5, id: \.self) { index in
          SkeletonRow(titleWidth: [140, 110, 160, 120, 100][index], detailWidth: [100, 80, 120, 90, 70][index])
            .cardRowBackground()
        }
      } header: {
        SectionHeader("Add someone")
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading people"))
  }

  // MARK: Rows

  private func candidateRow(_ person: CandidatePerson, snapshot: ListSnapshot) -> some View {
    let presentation = CandidatePresentation(
      person: person, teamName: resolved.group.teamName, positionName: resolved.position.name)
    let actions = rowActions(for: presentation)
    return CandidateRow(
      presentation: presentation,
      planDate: model.planDate,
      showsHistory: showsHistory,
      scorePending: snapshot.scorePending,
      isScheduling: model.scheduling.contains(person.id),
      isSelected: selectedCandidateId == person.id,
      notNotified: snapshot.notificationStates[person.id] == .unsent,
      error: model.scheduleErrors[person.id],
      canSchedule: access.canSchedule,
      revealTracker: model.dayBarReveals,
      actions: actions
    )
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      leadingSwipe(presentation, actions: actions)
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      trailingSwipe(presentation, actions: actions)
    }
    .contextMenu {
      contextMenuItems(presentation, actions: actions)
    } preview: {
      CandidatePreviewCard(
        presentation: presentation, planDate: model.planDate,
        positionName: resolved.position.name)
    }
    .accessibilityIdentifier("candidate-\(person.id)")
  }

  private func rowActions(for presentation: CandidatePresentation) -> CandidateRowActions {
    let person = presentation.person
    return CandidateRowActions(
      openDetails: { onOpenDetails(person.id) },
      add: { Task { await model.schedule(person) } },
      setStatus: { status in
        guard let planPersonId = person.scheduledPlanPersonId else { return }
        Task { await model.setStatus(status, planPersonId: planPersonId, personId: person.id) }
      },
      unschedule: {
        guard let planPersonId = person.scheduledPlanPersonId else { return }
        onUnschedule(
          RosterUnscheduleRequest(planPersonId: planPersonId, personId: person.id, name: person.fullName))
      })
  }

  @ViewBuilder
  private func leadingSwipe(_ presentation: CandidatePresentation, actions: CandidateRowActions)
    -> some View
  {
    if access.canSchedule {
      if presentation.isScheduled {
        if presentation.slotStatus != .confirmed {
          Button { actions.setStatus(.confirmed) } label: {
            Label("Confirm", symbol: .statusConfirmed)
          }
          .tint(.statusConfirmed)
        }
        if presentation.slotStatus != .pending {
          Button { actions.setStatus(.pending) } label: {
            Label("Pending", symbol: .statusPending)
          }
          .tint(.statusPending)
        }
      } else if presentation.addDisabledReason == nil {
        Button(action: actions.add) {
          Label("Add", symbol: .addToSchedule)
        }
        .tint(.statusConfirmed)
      }
    }
  }

  @ViewBuilder
  private func trailingSwipe(_ presentation: CandidatePresentation, actions: CandidateRowActions)
    -> some View
  {
    if access.canSchedule, presentation.isScheduled {
      Button(action: actions.unschedule) {
        Label("Unschedule", symbol: .delete)
      }
      .tint(.destructive)
      if presentation.slotStatus != .declined {
        Button { actions.setStatus(.declined) } label: {
          Label("Decline", symbol: .statusDeclined)
        }
        .tint(.statusDeclined)
      }
    }
  }

  @ViewBuilder
  private func contextMenuItems(_ presentation: CandidatePresentation, actions: CandidateRowActions)
    -> some View
  {
    let person = presentation.person
    if presentation.isScheduled {
      RosterStatusMenuItems(
        current: presentation.slotStatus ?? .pending,
        isEnabled: access.canSchedule && person.scheduledPlanPersonId != nil,
        onSelect: actions.setStatus, onUnschedule: actions.unschedule)
    } else {
      Button(action: actions.add) {
        Label("Add to \(resolved.position.name)", symbol: .addToSchedule)
      }
      .disabled(!access.canSchedule || presentation.addDisabledReason != nil)
    }
    Divider()
    Button(action: actions.openDetails) {
      Label("Show Details", symbol: .info)
    }
    if showsPersonLinks {
      Button { onViewPerson(person.id) } label: {
        Label("View Person", symbol: .people)
      }
    }
    Button {
      if let url = RosterLinks.person(person.id) { openURL(url) }
    } label: {
      Label("Open in Planning Center", symbol: .openExternal)
    }
  }
}

/// Everything the list derives from the model for one render.
private struct ListSnapshot {
  let onSlot: [CandidatePerson]
  let candidates: [CandidatePerson]
  let exceptions: [CandidatePerson]
  let offRoster: [FilledPositionPerson]
  let open: Int
  let filledCount: Int
  let scorePending: Bool
  let notificationStates: [String: SchedulingNotificationState]

  @MainActor
  init(model: AssignModel, resolved: AssignResolvedSlot) {
    let pipeline = model.pipeline
    let list = pipeline?.list
    let partition = partitionForRecommendationStrip(list?.people ?? [], settled: list?.complete ?? true)
    let filter = model.filter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    func matches(_ person: CandidatePerson) -> Bool {
      filter.isEmpty || person.fullName.lowercased().contains(filter)
    }
    onSlot = partition.onSlot
    candidates = partition.candidates.filter(matches)
    exceptions = partition.exceptions.filter(matches)
    let onSlotIds = Set(partition.onSlot.map(\.id))
    offRoster = resolved.position.rosterPeople.filter { !onSlotIds.contains($0.personId ?? $0.id) }
    open = resolved.position.rosterOpenSlots
    filledCount = onSlot.count + offRoster.count
    scorePending = pipeline.map { !($0.list?.complete ?? false) && $0.failedPartCount == 0 } ?? false
    notificationStates = positionNotificationStates(
      model.groups, teamId: resolved.teamId, positionId: resolved.positionId)
  }

  /// Changes when people move between sections or reorder, so the move animates.
  var orderKey: [String] {
    onSlot.map(\.id) + ["|"] + candidates.map(\.id) + ["|"] + exceptions.map(\.id)
  }
}
