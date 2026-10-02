import PCOBoosterCore
import SwiftUI

/// Placeholder rows for the first load, shaped like a run sheet (headers and items).
struct RunSheetSkeleton: View {
  private static let rows: [(id: Int, header: Bool, width: CGFloat)] = [
    (0, true, 110), (1, false, 170), (2, false, 130), (3, false, 150),
    (4, true, 90), (5, false, 140), (6, false, 100), (7, false, 160),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Self.rows, id: \.id) { row in
        if row.header {
          Skeleton(.text, width: row.width, height: 10)
            .padding(.top, Spacing.xxl)
            .padding(.bottom, Spacing.md)
        } else {
          HStack(spacing: Spacing.md) {
            Skeleton(.text, width: 34)
            VStack(alignment: .leading, spacing: Spacing.sm) {
              Skeleton(.text, width: row.width, height: 13)
              Skeleton(.text, width: row.width * 0.6, height: 9)
            }
            Spacer(minLength: 0)
          }
          .frame(minHeight: 56)
        }
      }
    }
    .padding(.horizontal, Spacing.lg)
    .accessibilityElement()
    .accessibilityLabel(Text("Loading the run sheet"))
  }
}

/// "This plan has no structure yet", with the three ways to start (`PlanItemListEmpty`).
struct RunSheetEmptyCard: View {
  let canEdit: Bool
  let onAdd: (RunSheetInsertKind) -> Void

  var body: some View {
    SurfaceCard {
      VStack(spacing: Spacing.md) {
        Image(symbol: .songs)
          .font(.title3)
          .foregroundStyle(.inkSecondary)
          .frame(width: 48, height: 48)
          .background(.surfaceMuted, in: .rect(cornerRadius: Radius.tile, style: .continuous))
          .accessibilityHidden(true)
        VStack(spacing: Spacing.xxs) {
          Text("This plan has no structure yet")
            .font(.cardTitle)
            .foregroundStyle(.ink)
          Text(
            canEdit
              ? "Pick a song from the library, or start with a header or item."
              : "Nothing is on this plan's run sheet in Planning Center."
          )
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .multilineTextAlignment(.center)
        }
        if canEdit {
          ViewThatFits(in: .horizontal) {
            HStack(spacing: Spacing.sm) { buttons }
            VStack(spacing: Spacing.sm) { buttons }
          }
          .padding(.top, Spacing.xs)
        }
      }
      .frame(maxWidth: .infinity)
    }
  }

  @ViewBuilder private var buttons: some View {
    Button {
      onAdd(.song)
    } label: {
      Label("Add Song", symbol: .song)
    }
    .buttonStyle(.pill(.primary))
    Button("Add Header") { onAdd(.header) }
      .buttonStyle(.pill(.outline))
    Button("Add Item") { onAdd(.item) }
      .buttonStyle(.pill(.outline))
  }
}

/// The run sheet's totals: songs and items, and the service's running length (items during the
/// service; before and after don't count), as Overview counts them (`summarizeOrder`).
struct RunSheetSummaryRow: View {
  let order: PlanOrder

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
      Text(counts)
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .contentTransition(.numericText())
      Spacer(minLength: Spacing.sm)
      if let length = RunSheetFormatting.lengthLabel(order.serviceLength) {
        Label {
          Text(verbatim: length)
            .font(.numericMeta)
            .contentTransition(.numericText())
        } icon: {
          Image(symbol: .times)
            .font(.caption)
        }
        .labelIconToTitleSpacing(Spacing.xs)
        .foregroundStyle(.inkSecondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Service length \(length)"))
      }
    }
    .animation(Motion.reveal, value: order.serviceLength)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("run-sheet-summary")
  }

  private var counts: LocalizedStringKey {
    let songs = order.songs.count
    let items = order.itemCount
    return songs == 1 ? "1 song, \(items) items" : "\(songs) songs, \(items) items"
  }
}

/// "Removed “Sermon”" with Undo, floating above the add bar for the 5 second undo window.
struct RunSheetUndoToast: View {
  let removal: RunSheetRemoval
  let onUndo: () -> Void

  var body: some View {
    HStack(spacing: Spacing.md) {
      Image(symbol: .delete)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.inkSecondary)
        .accessibilityHidden(true)
      Text("Removed \u{201C}\(removal.title)\u{201D}")
        .font(.rowTitleEmphasized)
        .foregroundStyle(.ink)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button("Undo", action: onUndo)
        .buttonStyle(.glass)
        .controlSize(.small)
        .accessibilityIdentifier("run-sheet-undo")
    }
    .padding(.leading, Spacing.lg)
    .padding(.trailing, Spacing.sm)
    .padding(.vertical, Spacing.sm)
    .frame(maxWidth: 440)
    .glassEffect(.regular, in: .capsule)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("run-sheet-undo-toast")
  }
}
