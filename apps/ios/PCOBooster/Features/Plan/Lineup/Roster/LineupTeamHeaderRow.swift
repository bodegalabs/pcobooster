import PCOBoosterCore
import SwiftUI

/// A team's header (`TeamPanel`): its symbol and name, the open count while collapsed, an
/// envelope with the number of people not notified yet, and the collapse chevron. Tapping it
/// collapses or expands the team; the choice is remembered for the plan.
struct LineupTeamHeaderRow: View {
  let group: TeamPositionGroup
  let isCollapsed: Bool
  let onToggle: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var openCount: Int { group.positions.reduce(0) { $0 + $1.rosterOpenSlots } }
  private var unsentCount: Int {
    group.positions.reduce(0) { sum, position in
      sum + position.rosterPeople.filter(\.rosterNotNotified).count
    }
  }

  var body: some View {
    Button(action: onToggle) {
      HStack(spacing: Spacing.md - 2) {
        AppSymbol.rosterTeam(group.teamName).image
          .font(.body)
          .foregroundStyle(.inkSecondary)
          .frame(width: LineupMetrics.symbolWidth)
          .accessibilityHidden(true)
        Text(verbatim: group.teamName)
          .font(.headline)
          .foregroundStyle(.ink)
          .lineLimit(1)
        Spacer(minLength: Spacing.sm)
        if isCollapsed, openCount > 0 {
          Text("\(openCount) open")
            .font(.footnote.weight(.medium).monospacedDigit())
            .foregroundStyle(.statusDeclinedText)
            .transition(.opacity)
        }
        if unsentCount > 0 {
          LineupUnsentBadge(count: unsentCount)
        }
        Image(symbol: .chevronDown)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
          .rotationEffect(.degrees(isCollapsed ? -90 : 0))
          .accessibilityHidden(true)
      }
      .frame(minHeight: Metrics.minimumTapTarget)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .animation(
      Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.22), instantWhenReduced: true),
      value: isCollapsed
    )
    .accessibilityLabel(Text("\(group.teamName) team"))
    .accessibilityValue(accessibilityValue)
    .accessibilityHint(isCollapsed ? Text("Expands the team") : Text("Collapses the team"))
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("lineup-team-\(group.teamId)")
  }

  private var accessibilityValue: Text {
    var parts: [String] = [isCollapsed ? String(localized: "Collapsed") : String(localized: "Expanded")]
    if openCount > 0 { parts.append(String(localized: "\(openCount) open")) }
    if unsentCount > 0 { parts.append(String(localized: "\(unsentCount) not notified")) }
    return Text(verbatim: parts.joined(separator: ", "))
  }
}

/// The outlined envelope and count of people whose scheduling email is still unsent.
struct LineupUnsentBadge: View {
  let count: Int

  var body: some View {
    HStack(spacing: Spacing.xs) {
      Image(symbol: .mail)
        .imageScale(.small)
      Text(count, format: .number)
        .monospacedDigit()
    }
    .font(.caption.weight(.medium))
    .foregroundStyle(.inkSecondary)
    .padding(.horizontal, Spacing.sm)
    .padding(.vertical, Spacing.xxs + 1)
    .hairlineBorder(Capsule())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("\(count) not notified"))
  }
}

/// Shared lineup row geometry.
enum LineupMetrics {
  /// The column for position and team symbols; people sit past it, under the position name.
  static let symbolWidth: CGFloat = 22
  /// Where people and open slots start, past the symbol column.
  static var personInset: CGFloat { symbolWidth + Spacing.md - 2 }
}
