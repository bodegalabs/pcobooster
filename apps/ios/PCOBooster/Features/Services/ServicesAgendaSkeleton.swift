import SwiftUI

/// The agenda before its first answers: a month heading and a card of days, each a tile and
/// one to three rows (the web's `PlanAgendaSkeleton`).
struct ServicesAgendaSkeleton: View {
  let inset: CGFloat
  private static let rowsPerDay = [2, 1, 3, 1, 2, 1]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Skeleton(.text, width: 110, height: 12)
        .padding(.horizontal, inset + Spacing.xs)
        .padding(.top, Spacing.md)
      SurfaceCard(padding: .none) {
        VStack(spacing: 0) {
          ForEach(Array(Self.rowsPerDay.enumerated()), id: \.offset) { index, rows in
            if index > 0 {
              Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg)
            }
            HStack(alignment: .top, spacing: Spacing.md) {
              Skeleton(.block, width: 48, height: 60)
              VStack(alignment: .leading, spacing: Spacing.lg) {
                ForEach(0..<rows, id: \.self) { row in
                  VStack(alignment: .leading, spacing: Spacing.sm) {
                    Skeleton(.text, width: row.isMultiple(of: 2) ? 140 : 120, height: 12)
                    Skeleton(.text, width: row.isMultiple(of: 2) ? 190 : 160, height: 10)
                  }
                  .frame(minHeight: 44, alignment: .center)
                }
              }
              Spacer(minLength: 0)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
          }
        }
      }
      .padding(.horizontal, inset)
    }
    .accessibilityElement()
    .accessibilityLabel(Text("Loading plans"))
  }
}
