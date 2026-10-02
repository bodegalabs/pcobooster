import SwiftUI

/// The person screen's shape before anything is known about them: header, numbers, the
/// month, and the side cards.
struct PersonDetailSkeleton: View {
  var showsName = false

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      HStack(spacing: Spacing.lg) {
        Skeleton(.round, width: 64, height: 64)
        VStack(alignment: .leading, spacing: Spacing.sm) {
          if showsName {
            Skeleton(.text, width: 160, height: 18)
          }
          Skeleton(.text, width: 200, height: 12)
          Skeleton(.round, width: 90, height: 22)
        }
      }
      MetricGrid {
        ForEach(0..<4, id: \.self) { _ in
          Skeleton(.control, height: 68)
        }
      }
      SurfaceCard {
        VStack(alignment: .leading, spacing: Spacing.md) {
          Skeleton(.text, width: 140, height: 14)
          Skeleton(.text, width: 180, height: 11)
          LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
            ForEach(0..<35, id: \.self) { _ in
              Skeleton(.control, height: 34)
            }
          }
          ForEach(0..<3, id: \.self) { _ in
            Skeleton(.control, height: 40)
          }
        }
      }
      SurfaceCard {
        VStack(alignment: .leading, spacing: Spacing.md) {
          Skeleton(.text, width: 100, height: 14)
          Skeleton(.control, height: 36)
          Skeleton(.control, height: 36)
        }
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Text("Loading person"))
  }
}
