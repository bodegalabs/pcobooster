import SwiftUI

/// The lineup's team cards before the positions load (`TeamRosterSkeleton`).
struct LineupSkeleton: View {
  private struct Team: Identifiable {
    let id: Int
    let titleWidth: CGFloat
    let people: [Int]
  }

  private static let teams = [
    Team(id: 0, titleWidth: 96, people: [2, 1, 1, 1]),
    Team(id: 1, titleWidth: 70, people: [1, 2, 1]),
    Team(id: 2, titleWidth: 112, people: [1, 1]),
  ]
  private static let widths: [CGFloat] = [120, 90, 140, 104]

  var body: some View {
    List {
      Section {
        Skeleton(.text, width: 220, height: 12)
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
      }
      ForEach(Self.teams) { team in
        Section {
          Skeleton(.text, width: team.titleWidth, height: 14)
            .frame(minHeight: Metrics.minimumTapTarget)
            .cardRowBackground()
          ForEach(Array(team.people.enumerated()), id: \.offset) { index, people in
            VStack(alignment: .leading, spacing: Spacing.sm) {
              HStack(spacing: Spacing.md - 2) {
                Skeleton(.text, width: 16, height: 16)
                Skeleton(.text, width: 84, height: 12)
              }
              .frame(minHeight: 36)
              ForEach(0..<people, id: \.self) { person in
                HStack(spacing: Spacing.md) {
                  Skeleton(.round, width: 32, height: 32)
                  Skeleton(
                    .text, width: Self.widths[(index + person) % Self.widths.count], height: 12)
                }
                .padding(.leading, LineupMetrics.personInset)
              }
            }
            .padding(.vertical, Spacing.xs)
            .cardRowBackground()
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(Spacing.md)
    .canvasBackground()
    .scrollDisabled(true)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading the lineup"))
  }
}
