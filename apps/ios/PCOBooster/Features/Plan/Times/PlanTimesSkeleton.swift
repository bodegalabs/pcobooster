import SwiftUI

/// The Times list before its first load (web `TimesTabSkeleton`): two day sections of rows
/// shaped like the real ones, a clock column, a bar, and two lines. Skeletons wait 120 ms before
/// showing, so a cached or fast load never flashes.
struct PlanTimesSkeleton: View {
  @ScaledMetric(relativeTo: .body) private var clockWidth: CGFloat = 74

  var body: some View {
    List {
      ForEach([1, 2], id: \.self) { rows in
        Section {
          ForEach(0..<rows, id: \.self) { index in
            row(titleWidth: index == 0 ? 132 : 108)
              .cardRowBackground()
          }
        } header: {
          Skeleton(.text, width: 88, height: 12)
            .padding(.vertical, Spacing.xxs)
        }
      }
    }
    .canvasBackground()
    .scrollDisabled(true)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading times"))
    .accessibilityIdentifier("times-skeleton")
  }

  private func row(titleWidth: CGFloat) -> some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      VStack(alignment: .trailing, spacing: Spacing.sm) {
        Skeleton(.text, width: 58, height: 12)
        Skeleton(.text, width: 46, height: 10)
      }
      .frame(width: clockWidth, alignment: .trailing)
      Skeleton(.round, width: 3, height: 52)
      VStack(alignment: .leading, spacing: Spacing.sm) {
        Skeleton(.text, width: titleWidth, height: 12)
        Skeleton(.text, width: 84, height: 10)
        Skeleton(.text, width: 150, height: 10)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, Spacing.xs)
  }
}
