import PCOBoosterCore
import SwiftUI

/// The previous and next plan buttons, Mail style: a tap steps one plan on the same segment, a
/// long press lists up to four plans on that side.
struct PlanStepControls: ToolbarContent {
  let shell: PlanShellModel
  let segment: PlanSegment

  var body: some ToolbarContent {
    ToolbarItemGroup(placement: .topBarTrailing) {
      PlanStepButton(direction: .previous, shell: shell, segment: segment)
      PlanStepButton(direction: .next, shell: shell, segment: segment)
    }
  }
}

private struct PlanStepButton: View {
  let direction: AdjacentPlansInputDirection
  let shell: PlanShellModel
  let segment: PlanSegment
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock

  var body: some View {
    Menu {
      Section(direction == .previous ? "Earlier plans" : "Later plans") {
        PlanNeighborItems(direction: direction, shell: shell) { plan in
          shell.open(plan, segment: segment)
        }
      }
    } label: {
      Label(title, systemImage: direction == .previous ? "chevron.up" : "chevron.down")
        .symbolEffect(.wiggle.up, value: wiggles)
    } primaryAction: {
      Task { await shell.step(direction, segment: segment) }
    }
    .disabled(shell.isEnd(direction) && shell.neighbors(direction).isEmpty)
    .accessibilityLabel(Text(accessibilityTitle))
    .accessibilityHint(Text("Touch and hold to list nearby plans"))
    .keyboardShortcut(direction == .previous ? "[" : "]", modifiers: .command)
  }

  private var title: LocalizedStringKey {
    direction == .previous ? "Previous plan" : "Next plan"
  }

  /// Only the side that ran out wiggles.
  private var wiggles: Int {
    shell.isEnd(direction) ? shell.endBumps : 0
  }

  private var accessibilityTitle: String {
    let base = direction == .previous ? "Previous plan" : "Next plan"
    if shell.isEnd(direction), shell.neighbors(direction).isEmpty {
      return direction == .previous ? "No earlier plan" : "No later plan"
    }
    guard let nearest = shell.neighbors(direction).first, let date = nearest.sortDate else {
      return base
    }
    return "\(base), \(PlanHeaderText.dateLabel(date, timeZone: timeZone, now: clock.now))"
  }
}

/// Menu rows for the plans on one side: date, then title or series. Looks up plans past the
/// loaded list when the menu opens (a deliberate long press or tap on the title).
struct PlanNeighborItems: View {
  let direction: AdjacentPlansInputDirection
  let shell: PlanShellModel
  let onOpen: (Plan) -> Void
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock

  var body: some View {
    let plans = shell.neighbors(direction)
    Group {
      ForEach(plans) { plan in
        Button {
          onOpen(plan)
        } label: {
          Text(verbatim: plan.sortDate.map { PlanHeaderText.dateLabel($0, timeZone: timeZone, now: clock.now) } ?? "No date")
          if let detail = PlanHeaderText.neighborDetail(plan, serviceTypeName: shell.serviceTypeName) {
            Text(verbatim: detail)
          }
        }
      }
      if shell.lookingUp.contains(direction), plans.count < PlanShellModel.neighborLimit {
        Text("Loading plans")
      } else if plans.isEmpty {
        Text(emptyText)
      }
    }
    .task { await shell.lookUpIfNeeded(direction) }
  }

  private var emptyText: LocalizedStringKey {
    if shell.failedLookups.contains(direction) { return "Couldn't load plans" }
    return direction == .previous ? "No earlier plans" : "No later plans"
  }
}
