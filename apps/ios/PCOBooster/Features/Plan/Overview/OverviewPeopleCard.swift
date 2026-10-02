import PCOBoosterCore
import SwiftUI

/// Who is scheduled and what is open (`summarizeStaffing`): the filled share as a bar, the
/// confirmed, pending, and open counts, who hasn't been notified yet (with the hand-off to
/// Planning Center), the positions that still need someone (each opens Assign for that
/// position), and each team's fill.
struct OverviewPeopleCard: View {
  let staffing: PlanStaffing?
  let unnotified: [UnnotifiedPerson]
  let loadError: String?
  let onRetry: () -> Void
  let onOpenLineup: () -> Void
  let onOpenPlanningCenter: (() -> Void)?
  let onAssign: (OpenPosition) -> Void
  @State private var showsAllOpen = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Open positions listed before "Show more".
  private static let openPreviewCount = 5

  var body: some View {
    OverviewCard(
      "People", systemImage: "person.2", summary: summary,
      isSummaryLoading: staffing == nil && loadError == nil
    ) {
      OverviewSegmentLink(segment: .lineup, action: onOpenLineup)
    } content: {
      if let staffing {
        VStack(alignment: .leading, spacing: Spacing.xl) {
          if staffing.total > 0 {
            VStack(alignment: .leading, spacing: Spacing.sm + 2) {
              OverviewStaffingBar(
                confirmed: staffing.confirmed, pending: staffing.pending, total: staffing.total)
              legend(staffing)
            }
          }
          if !unnotified.isEmpty {
            OverviewNotificationsCallout(
              people: unnotified, onOpenPlanningCenter: onOpenPlanningCenter)
          }
          if !staffing.openPositions.isEmpty {
            openPositions(staffing.openPositions)
          }
          if staffing.teams.isEmpty {
            Text("No positions are requested for this plan yet.")
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
          } else {
            teams(staffing.teams)
          }
        }
      } else if let loadError {
        OverviewLoadError(title: "Couldn't load people", message: loadError, retry: onRetry)
      } else {
        OverviewRowsSkeleton(rows: 5)
      }
    }
  }

  private var summary: Text? {
    guard let staffing else { return nil }
    let filled = staffing.confirmed + staffing.pending
    return Text("\(filled) of \(staffing.total) slots filled")
  }

  private func legend(_ staffing: PlanStaffing) -> some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: Spacing.lg) { legendItems(staffing) }
      VStack(alignment: .leading, spacing: Spacing.xs) { legendItems(staffing) }
    }
  }

  @ViewBuilder private func legendItems(_ staffing: PlanStaffing) -> some View {
    OverviewStaffingCount(count: staffing.confirmed, label: "confirmed", color: .statusConfirmedBright)
    OverviewStaffingCount(count: staffing.pending, label: "pending", color: .statusPendingBright)
    OverviewStaffingCount(count: staffing.open, label: "open", color: .surfaceMuted)
  }

  private func openPositions(_ positions: [OpenPosition]) -> some View {
    let visible = showsAllOpen ? positions : Array(positions.prefix(Self.openPreviewCount))
    return VStack(alignment: .leading, spacing: Spacing.xs) {
      OverviewSubheading(title: "Needs someone", count: positions.count)
      VStack(spacing: 0) {
        ForEach(Array(visible.enumerated()), id: \.element.positionId) { index, position in
          if index > 0 {
            Hairline(color: .hairlineSubtle).padding(.leading, 36)
          }
          OpenPositionRow(position: position) { onAssign(position) }
        }
      }
      if positions.count > Self.openPreviewCount {
        Button {
          withAnimation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal)) {
            showsAllOpen.toggle()
          }
        } label: {
          Text(showsAllOpen ? "Show fewer" : "Show \(positions.count - Self.openPreviewCount) more")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.inkSecondary)
            .frame(minHeight: 32)
        }
        .buttonStyle(.plain)
        .padding(.leading, 36)
      }
    }
  }

  private func teams(_ teams: [TeamStaffing]) -> some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      OverviewSubheading(title: "Teams", count: nil)
      VStack(spacing: 0) {
        ForEach(teams, id: \.teamId) { team in
          TeamFillRow(team: team)
        }
      }
    }
  }
}

/// A quiet label above a group of rows inside a card.
struct OverviewSubheading: View {
  let title: LocalizedStringKey
  let count: Int?

  var body: some View {
    HStack(spacing: Spacing.xs + 2) {
      Text(title)
      if let count {
        CountText(count, font: .footnote.monospacedDigit())
          .foregroundStyle(.inkTertiary)
      }
    }
    .font(.footnote.weight(.medium))
    .foregroundStyle(.inkSecondary)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }
}

private struct OpenPositionRow: View {
  let position: OpenPosition
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        AppSymbol(
          positionIconID: resolvePositionIconId(
            positionName: position.positionName, teamName: position.teamName
          ).rawValue
        ).image
        .font(.body)
        .foregroundStyle(.inkSecondary)
        .frame(width: 24)
        .accessibilityHidden(true)
        Text(
          "\(Text(verbatim: position.positionName).foregroundStyle(.ink))\(Text(verbatim: " \u{B7} \(position.teamName)").foregroundStyle(.inkSecondary))"
        )
        .font(.rowTitle)
          .italic(position.source == .custom || position.source == .planMember)
          .lineLimit(2)
          .frame(maxWidth: .infinity, alignment: .leading)
        if position.openCount > 1 {
          Text("\(position.openCount) open")
            .font(.badgeLabel)
            .foregroundStyle(.statusDeclinedText)
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, Spacing.xxs + 1)
            .hairlineBorder(.capsule)
        }
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
          .accessibilityHidden(true)
      }
      .frame(minHeight: Metrics.minimumTapTarget)
      .contentShape(.rect)
    }
    .buttonStyle(OverviewRowButtonStyle())
    .accessibilityLabel(Text("Assign \(position.positionName) on \(position.teamName)"))
    .accessibilityValue(position.openCount > 1 ? Text("\(position.openCount) open") : Text(verbatim: ""))
  }
}

private struct TeamFillRow: View {
  let team: TeamStaffing

  var body: some View {
    let filled = team.confirmed + team.pending
    let total = filled + team.open
    HStack(spacing: Spacing.md) {
      Text(verbatim: team.teamName)
        .font(.rowTitle)
        .foregroundStyle(.ink)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      Text(verbatim: "\(filled)/\(total)")
        .font(.footnote.monospacedDigit())
        .foregroundStyle(.inkSecondary)
        .contentTransition(.numericText(value: Double(filled)))
      OverviewStaffingBar(confirmed: team.confirmed, pending: team.pending, total: total, height: 6)
        .frame(width: 72)
    }
    .frame(minHeight: 36)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: team.teamName))
    .accessibilityValue(Text("\(filled) of \(total) filled, \(team.confirmed) confirmed"))
  }
}
