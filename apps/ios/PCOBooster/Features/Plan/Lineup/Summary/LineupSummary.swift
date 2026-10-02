import PCOBoosterCore
import SwiftUI

/// The plan's staffing in one quiet line: confirmed, pending, declined, and open counts.
struct LineupStaffingStrip: View {
  let staffing: LineupStaffing

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: Spacing.lg) { items }
      VStack(alignment: .leading, spacing: Spacing.xs) { items }
    }
    .font(.footnote)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("lineup-staffing")
  }

  @ViewBuilder private var items: some View {
    item(count: staffing.confirmed, label: "Confirmed", tone: .confirmed)
    item(count: staffing.pending, label: "Pending", tone: .pending)
    if staffing.declined > 0 {
      item(count: staffing.declined, label: "Declined", tone: .declined)
    }
    HStack(spacing: Spacing.xs + 2) {
      Circle()
        .strokeBorder(
          staffing.open > 0 ? Color.statusDeclined : Color.inkTertiary,
          style: StrokeStyle(lineWidth: 1.2, dash: [2, 1.5])
        )
        .frame(width: 9, height: 9)
      CountText(staffing.open, font: .footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(staffing.open > 0 ? Color.statusDeclinedText : Color.inkSecondary)
      Text("Open")
        .foregroundStyle(.inkSecondary)
    }
  }

  private func item(count: Int, label: LocalizedStringKey, tone: StatusTone) -> some View {
    HStack(spacing: Spacing.xs + 2) {
      StatusDot(tone: tone, size: 8)
      CountText(count, font: .footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(.ink)
      Text(label)
        .foregroundStyle(.inkSecondary)
    }
  }
}

/// People whose scheduling email is prepared but unsent can't see or answer the request yet.
/// Planning Center's API can't send it, so this hands off to the plan there and the lineup
/// rereads when the app comes back.
struct LineupNotifyBanner: View {
  let people: [UnnotifiedPerson]
  let planningCenterURL: URL?
  let onOpen: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: Spacing.md) {
      Image(symbol: .mail)
        .font(.body)
        .foregroundStyle(.statusPendingText)
        .frame(width: 36, height: 36)
        .background(StatusTone.pending.fillColor, in: .circle)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(title)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        Text(verbatim: names)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if planningCenterURL != nil {
        Button(action: onOpen) {
          Label("Send", symbol: .openExternal)
        }
        .buttonStyle(.pill(.outline, size: .small))
        .accessibilityLabel(Text("Send scheduling emails in Planning Center"))
        .accessibilityIdentifier("lineup-notify-open")
      }
    }
    .padding(.vertical, Spacing.xs)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("lineup-notify-banner")
  }

  private var title: LocalizedStringResource {
    people.count == 1 ? "1 person hasn't been notified" : "\(people.count) people haven't been notified"
  }

  private var names: String {
    people.map(\.name).formatted(.list(type: .and))
  }
}
