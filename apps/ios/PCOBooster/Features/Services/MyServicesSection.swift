import PCOBoosterCore
import SwiftUI

/// "Your services": upcoming plans the signed-in person is scheduled on, as cards with the date
/// tile and a relative day ("Today", "Tomorrow", "In 5 days"). A swipeable row on iPhone, a grid
/// with room to spare. Hidden when there are none.
struct MyServicesSection: View {
  let rows: [ServicePlanRow]
  let isLoading: Bool
  let isWide: Bool
  let namespace: Namespace.ID
  let onOpen: (ServicePlanRow) -> Void
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock

  var body: some View {
    if isLoading || !rows.isEmpty {
      VStack(alignment: .leading, spacing: Spacing.sm + 2) {
        SectionHeader("Your services", count: isLoading ? nil : rows.count)
          .padding(.horizontal, inset + Spacing.xs)
        if isWide {
          LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 280), spacing: Spacing.md)], spacing: Spacing.md
          ) {
            cards
          }
          .padding(.horizontal, inset)
        } else {
          ScrollView(.horizontal) {
            LazyHStack(spacing: Spacing.md) {
              cards
                .containerRelativeFrame(.horizontal) { width, _ in min(300, width * 0.8) }
            }
            .scrollTargetLayout()
          }
          .scrollTargetBehavior(.viewAligned)
          .scrollIndicators(.hidden)
          .contentMargins(.horizontal, inset, for: .scrollContent)
          .scrollClipDisabled()
        }
      }
      .padding(.bottom, Spacing.lg)
    }
  }

  private var inset: CGFloat { isWide ? Spacing.xxl : Spacing.lg }

  @ViewBuilder private var cards: some View {
    if isLoading {
      ForEach(0..<3, id: \.self) { _ in
        Skeleton(.block, height: 84)
      }
    } else {
      ForEach(rows) { row in
        MyServiceCard(
          row: row,
          relativeDay: formatPlanRelativeDay(row.sortDate, now: clock.now, timeZone: timeZone),
          namespace: namespace
        ) {
          onOpen(row)
        }
      }
    }
  }
}

private struct MyServiceCard: View {
  let row: ServicePlanRow
  let relativeDay: String?
  let namespace: Namespace.ID
  let action: () -> Void
  @Environment(\.orgTimeZone) private var timeZone

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        AgendaDateTile(date: row.sortDate)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          if let relativeDay {
            Text(verbatim: relativeDay)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.statusConfirmedText)
          }
          Text(verbatim: row.serviceTypeName)
            .font(.rowTitleEmphasized)
            .foregroundStyle(.ink)
            .lineLimit(1)
          if !row.planTitle.isEmpty {
            Text(verbatim: row.planTitle)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
              .truncationMode(.middle)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .surfaceCard()
      .contentShape(.rect(cornerRadius: Radius.card))
    }
    .buttonStyle(MyServiceCardButtonStyle())
    .matchedTransitionSource(id: PlanNavigation.cardSourceID(row.planId), in: namespace) { source in
      source.background(.surfaceCard).clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }
    .accessibilityLabel(Text(verbatim: accessibilityText))
    .accessibilityIdentifier("my-service-\(row.planId)")
  }

  private var accessibilityText: String {
    [relativeDay, row.serviceTypeName, formatPlanDate(row.sortDate, timeZone: timeZone), row.planTitle]
      .compactMap { $0 }
      .filter { !$0.isEmpty }
      .joined(separator: ", ")
  }
}

/// Cards press down slightly; nothing changes color.
private struct MyServiceCardButtonStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
      .animation(reduceMotion ? nil : Motion.snappy(0.18), value: configuration.isPressed)
  }
}
