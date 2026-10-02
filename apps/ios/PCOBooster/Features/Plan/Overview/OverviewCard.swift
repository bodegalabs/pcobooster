import SwiftUI

/// An Overview section on a solid card: a symbol and title, a one-line summary (or its
/// skeleton while loading), an optional link into the segment that holds the details, then the
/// section's rows.
struct OverviewCard<Content: View, Trailing: View>: View {
  private let title: LocalizedStringKey
  private let symbol: String
  private let summary: Text?
  private let isSummaryLoading: Bool
  private let content: Content
  private let trailing: Trailing

  init(
    _ title: LocalizedStringKey, systemImage symbol: String, summary: Text?,
    isSummaryLoading: Bool = false,
    @ViewBuilder trailing: () -> Trailing,
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.symbol = symbol
    self.summary = summary
    self.isSummaryLoading = isSummaryLoading
    self.trailing = trailing()
    self.content = content()
  }

  var body: some View {
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.md) {
        HStack(alignment: .center, spacing: Spacing.sm) {
          VStack(alignment: .leading, spacing: Spacing.xxs) {
            Label {
              Text(title)
            } icon: {
              Image(systemName: symbol)
                .foregroundStyle(.inkSecondary)
            }
            .font(.cardTitle)
            .foregroundStyle(.ink)
            .accessibilityAddTraits(.isHeader)
            if let summary {
              summary
                .font(.rowDetail)
                .foregroundStyle(.inkSecondary)
                .contentTransition(.numericText())
            } else if isSummaryLoading {
              Skeleton(.text, width: 150, height: 11)
                .padding(.vertical, 3)
            }
          }
          Spacer(minLength: Spacing.sm)
          trailing
        }
        content
      }
    }
  }
}

extension OverviewCard where Trailing == EmptyView {
  init(
    _ title: LocalizedStringKey, systemImage symbol: String, summary: Text?,
    isSummaryLoading: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.init(
      title, systemImage: symbol, summary: summary, isSummaryLoading: isSummaryLoading,
      trailing: { EmptyView() }, content: content)
  }
}

/// "Lineup ›": a quiet link from a card into the segment with the details.
struct OverviewSegmentLink: View {
  let segment: PlanSegment
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.xxs) {
        Text(segment.title)
        Image(systemName: "chevron.right")
          .imageScale(.small)
          .fontWeight(.semibold)
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(.inkSecondary)
      .padding(.vertical, Spacing.xs)
      .padding(.horizontal, Spacing.sm)
      .contentShape(.capsule)
    }
    .buttonStyle(OverviewRowButtonStyle(shape: .capsule))
    .accessibilityLabel(Text("Open \(Text(segment.title))"))
  }
}

/// A tappable row inside a card. The pressed fill appears instantly (colors never animate) and
/// reaches a little past the row so the text keeps its alignment.
struct OverviewRowButtonStyle: ButtonStyle {
  enum Shape {
    case row
    case capsule
  }

  var shape: Shape = .row

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background {
        if configuration.isPressed {
          switch shape {
          case .row:
            RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
              .fill(.surfaceHighlight)
              .padding(.horizontal, -Spacing.sm)
          case .capsule:
            Capsule().fill(.surfaceHighlight)
          }
        }
      }
  }
}

/// Placeholder rows while a card's first load runs.
struct OverviewRowsSkeleton: View {
  let rows: Int

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      ForEach(0..<rows, id: \.self) { index in
        HStack(spacing: Spacing.md) {
          Skeleton(.round, width: 18, height: 18)
          Skeleton(.text, width: [170, 130, 150, 110, 140][index % 5], height: 11)
          Spacer(minLength: 0)
        }
        .frame(minHeight: 28)
      }
    }
  }
}

/// A card's part that failed to load with nothing cached: what failed and a way to retry.
struct OverviewLoadError: View {
  let title: LocalizedStringKey
  let message: String?
  let retry: () -> Void

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Image(symbol: .alert)
        .foregroundStyle(.destructive)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(title)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        if let message, !message.isEmpty {
          Text(verbatim: message)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: Spacing.sm)
      Button("Retry", action: retry)
        .buttonStyle(.pill(.outline, size: .small))
    }
    .accessibilityElement(children: .combine)
  }
}
