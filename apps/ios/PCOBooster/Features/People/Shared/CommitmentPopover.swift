import PCOBoosterCore
import SwiftUI

/// One person's commitments on a day: what, where, and a way into the plan (the web's
/// commitment hover card and phone sheet, as one popover). Each commitment reads top to
/// bottom so nothing wraps beside its button.
struct CommitmentPopover: View {
  let title: String
  var subtitle: String?
  let entries: [PeopleDashboardMonthDay]
  var onDismiss: () -> Void = {}

  @Environment(AppRouter.self) private var router

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: title)
          .font(.headline)
          .foregroundStyle(.ink)
        if let subtitle {
          Text(verbatim: subtitle)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        }
      }
      ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
        if index > 0 {
          Hairline(color: .hairlineSubtle)
        }
        entryView(entry)
      }
    }
    .padding(Spacing.lg)
    .frame(minWidth: 260, idealWidth: 300, maxWidth: 340, alignment: .leading)
  }

  private func entryView(_ entry: PeopleDashboardMonthDay) -> some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      HStack(spacing: Spacing.sm) {
        CommitmentDotView(dot: entry.dot)
        Text(verbatim: entry.engagement)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
      }
      Text(verbatim: PeopleScreens.commitmentEntryText(entry))
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.leading, Spacing.sm + 8)
      if let route = PeopleLinks.planRoute(entry) {
        Button {
          onDismiss()
          router.push(.plan(route))
        } label: {
          Label("Open plan", symbol: .plan)
        }
        .buttonStyle(.pill(.secondary, size: .small))
        .padding(.leading, Spacing.sm + 8)
        .accessibilityHint(Text("Opens this plan's lineup"))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
