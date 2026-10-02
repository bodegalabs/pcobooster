import PCOBoosterCore
import SwiftUI

/// One feature in the access review (the web's `FeatureAccessRow`): a status icon, the feature,
/// its status word, what the person can do, and who to ask. At accessibility text sizes the
/// status word moves under the feature name instead of squeezing beside it.
struct FeatureAccessRow: View {
  let entry: FeatureAccess
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      entry.availability.symbol.image
        .font(.body)
        .foregroundStyle(entry.availability.iconColor)
        .frame(width: 22)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xs) {
        titleLine
        if !entry.detail.isEmpty {
          Text(verbatim: entry.detail)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        if let ask = entry.ask, entry.availability != .full {
          Text("Ask a Planning Center admin for \(Text(verbatim: ask).fontWeight(.medium).foregroundStyle(.ink)).")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxs)
        }
      }
    }
    .padding(.vertical, Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private var titleLine: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.xxs))
      : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Spacing.md))
    return layout {
      Text(verbatim: entry.label)
        .font(.rowTitleEmphasized)
        .foregroundStyle(.ink)
        .fixedSize(horizontal: false, vertical: true)
      if !dynamicTypeSize.isAccessibilitySize {
        Spacer(minLength: Spacing.sm)
      }
      Text(entry.availability.title)
        .font(.meta)
        .foregroundStyle(entry.availability.textColor)
    }
  }
}

#if DEBUG
#Preview("Feature access rows") {
  ScrollView {
    VStack(spacing: 0) {
      ForEach(AccessSample.limited.review().features) { entry in
        FeatureAccessRow(entry: entry)
        Hairline()
      }
    }
    .padding(.horizontal, Spacing.lg)
    .surfaceCard()
    .padding(Spacing.lg)
  }
  .background(.surfaceCanvas)
}
#endif
