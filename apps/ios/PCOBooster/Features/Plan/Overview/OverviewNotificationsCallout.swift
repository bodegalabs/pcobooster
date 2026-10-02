import SwiftUI

/// People scheduled whose scheduling email is prepared but unsent. Planning Center's public API
/// can't send those emails, so this hands off to the plan in Planning Center (the Services app
/// when installed); the roster is reread on return.
struct OverviewNotificationsCallout: View {
  let count: Int
  let onOpenPlanningCenter: (() -> Void)?

  var body: some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      Image(systemName: "envelope.badge")
        .font(.body)
        .foregroundStyle(.statusInfo)
        .symbolRenderingMode(.hierarchical)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(count == 1 ? "1 person hasn't been notified" : "\(count) people haven't been notified")
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
          .contentTransition(.numericText(value: Double(count)))
        Text("They can't see or answer until the scheduling email is sent in Planning Center.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
        if let onOpenPlanningCenter {
          Button(action: onOpenPlanningCenter) {
            Label("Send in Planning Center", systemImage: "arrow.up.right")
          }
          .buttonStyle(.pill(.outline, size: .small))
          .padding(.top, Spacing.sm)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(Spacing.lg)
    .background(.infoSurface, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .hairlineBorder(RoundedRectangle.inner, color: .infoBorder)
    .accessibilityElement(children: .contain)
  }
}
