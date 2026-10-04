import PCOBoosterCore
import SwiftUI

/// The bar pinned under the navigation bar: the Overview, Lineup, Plan, and Times segmented
/// control (Liquid Glass, on the control layer), and below it, when Planning Center permissions
/// hold this segment back, a short notice that explains why.
struct PlanSegmentBar: View {
  @Binding var segment: PlanSegment
  let notice: PlanAccessMessage?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(spacing: Spacing.sm) {
      Picker("View", selection: $segment) {
        ForEach(PlanSegment.allCases) { segment in
          Text(segment.title).tag(segment)
        }
      }
      .pickerStyle(.segmented)
      .controlSize(.large)
      .frame(maxWidth: 560)
      .accessibilityIdentifier("plan-segments")
      if let notice {
        PlanAccessNotice(message: notice)
          .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.bottom, Spacing.sm)
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: notice)
  }
}

/// "View only", as a small glass capsule; tapping it says what the person's Planning Center
/// access allows here and links to their access summary (the web's `PlanAccessNotice`).
struct PlanAccessNotice: View {
  let message: PlanAccessMessage
  @State private var isShowingDetails = false
  @Environment(AppRouter.self) private var router

  var body: some View {
    Button {
      isShowingDetails = true
    } label: {
      HStack(spacing: Spacing.xs + 2) {
        Image(systemName: "lock.fill")
          .imageScale(.small)
        Text(verbatim: message.title)
          .lineLimit(1)
        Image(systemName: "info.circle")
          .imageScale(.small)
          .foregroundStyle(.inkTertiary)
      }
      .font(.footnote.weight(.medium))
      .foregroundStyle(.inkSecondary)
      .padding(.horizontal, Spacing.md)
      .padding(.vertical, Spacing.xs + 2)
      .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .glassEffect(.regular.interactive(), in: .capsule)
    .accessibilityLabel(Text(verbatim: message.title))
    .accessibilityHint(Text("Explains your Planning Center access for this plan"))
    .popover(isPresented: $isShowingDetails) {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        Text(verbatim: message.title)
          .font(.cardTitle)
          .foregroundStyle(.ink)
        Text(verbatim: message.description)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
        Button("Your access") {
          isShowingDetails = false
          router.presentAccount()
        }
        .buttonStyle(.pill(.secondary, size: .small))
        .padding(.top, Spacing.xs)
      }
      .padding(Spacing.lg)
      .frame(idealWidth: 320, maxWidth: 360, alignment: .leading)
      .presentationCompactAdaptation(.popover)
    }
  }
}
