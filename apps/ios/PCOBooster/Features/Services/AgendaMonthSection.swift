import PCOBoosterCore
import SwiftUI

/// One organization month of the agenda under a pinned heading. On iPhone the month's days
/// share one card, divided by hairlines; with room to spare each day becomes its own card in a
/// grid, read left to right.
struct AgendaMonthSection<Row: View>: View {
  enum Layout {
    case list
    case grid
  }

  let month: PlanMonthGroup<ServicePlanRow>
  let todayKey: String
  let layout: Layout
  /// Builds one row: the plan, whether it carries the day's tile, and whether the day is today.
  @ViewBuilder let row: (ServicePlanRow, Bool, Bool) -> Row

  var body: some View {
    Section {
      switch layout {
      case .list:
        SurfaceCard(padding: .none) {
          VStack(spacing: 0) {
            ForEach(Array(month.days.enumerated()), id: \.element.dayKey) { index, day in
              if index > 0 {
                Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg)
              }
              AgendaDayRows(day: day, todayKey: todayKey, row: row)
            }
          }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.lg)
      case .grid:
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: 320), spacing: Spacing.lg, alignment: .top)],
          alignment: .leading, spacing: Spacing.lg
        ) {
          ForEach(month.days, id: \.dayKey) { day in
            SurfaceCard(padding: .none) {
              AgendaDayRows(day: day, todayKey: todayKey, row: row)
            }
          }
        }
        .padding(.horizontal, Spacing.xxl)
        .padding(.bottom, Spacing.xl)
      }
    } header: {
      AgendaMonthHeading(title: month.heading, inset: layout == .list ? Spacing.lg : Spacing.xxl)
    }
  }
}

/// A day's plans, the first carrying the date tile.
private struct AgendaDayRows<Row: View>: View {
  let day: PlanDayGroup<ServicePlanRow>
  let todayKey: String
  let row: (ServicePlanRow, Bool, Bool) -> Row
  @ScaledMetric(relativeTo: .body) private var tileWidth: CGFloat = 48

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(day.rows.enumerated()), id: \.element.id) { index, plan in
        if index > 0 {
          Hairline(color: .hairlineSubtle)
            .padding(.leading, Spacing.lg + min(tileWidth, 72) + Spacing.md)
        }
        row(plan, index == 0, day.dayKey == todayKey)
      }
    }
  }
}

/// "October 2026", pinned while its month scrolls.
struct AgendaMonthHeading: View {
  let title: String
  var inset: CGFloat = Spacing.lg

  var body: some View {
    Text(verbatim: title)
      .font(.sectionLabel)
      .foregroundStyle(.inkSecondary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, inset + Spacing.xs)
      .padding(.top, Spacing.md)
      .padding(.bottom, Spacing.sm)
      .background(.surfaceCanvas)
      .accessibilityAddTraits(.isHeader)
  }
}
