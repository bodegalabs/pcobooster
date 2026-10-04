import PCOBoosterCore
import SwiftUI

/// The song's arrangements as Planning Center holds them: keys, tempo and meter, length, and
/// sequence, archived ones last. With the `chordCharts` flag a row opens its chart.
struct SongArrangementsSection: View {
  let model: SongDetailModel
  let chartsEnabled: Bool
  let openChart: (String) -> Void
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader("Arrangements", count: rows.isEmpty ? nil : rows.count)
        .padding(.horizontal, Spacing.xs)
      SurfaceCard(padding: .none) {
        if rows.isEmpty {
          placeholder
        } else {
          VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
              if index > 0 { Hairline().padding(.leading, Spacing.lg) }
              arrangementRow(row)
            }
          }
        }
      }
    }
  }

  /// `songs.options` when it has loaded (tempo, meter, length, sequence), else the chart's
  /// arrangements (names and keys).
  private var rows: [ArrangementRowData] {
    if !model.arrangements.isEmpty {
      return model.arrangements.map(ArrangementRowData.init)
    }
    return model.chartArrangements.map(ArrangementRowData.init)
  }

  @ViewBuilder private var placeholder: some View {
    let failed = (model.options?.status == .failure) && (model.chart?.value == nil)
    if failed {
      HStack(alignment: .firstTextBaseline) {
        Text("Arrangements didn\u{2019}t load.")
          .font(.rowDetail).foregroundStyle(.inkSecondary)
        Spacer()
        Button("Try again") { model.options?.retry() }
          .buttonStyle(.pill(.outline, size: .small))
      }
      .padding(Spacing.lg)
    } else if model.options?.value != nil || model.chart?.value != nil {
      Text("No arrangements in Planning Center yet.")
        .font(.rowDetail).foregroundStyle(.inkSecondary)
        .padding(Spacing.lg)
    } else {
      VStack(alignment: .leading, spacing: Spacing.md) {
        Skeleton(.text, width: 160, height: 14)
        Skeleton(.text, width: 110, height: 10)
        Skeleton(.text, width: 220, height: 10)
      }
      .padding(Spacing.lg)
      .accessibilityLabel(Text("Loading arrangements"))
    }
  }

  @ViewBuilder private func arrangementRow(_ row: ArrangementRowData) -> some View {
    let content = ArrangementRow(row: row, showsChevron: chartsEnabled)
    Group {
      if chartsEnabled {
        Button {
          openChart(row.id)
        } label: {
          content
        }
        .buttonStyle(ArrangementRowButtonStyle())
        .accessibilityHint(Text("Opens its chord chart"))
      } else {
        content
      }
    }
    .contextMenu {
      if chartsEnabled {
        Button {
          openChart(row.id)
        } label: {
          Label("Chord Chart", symbol: .chordChart)
        }
      }
      if let url = SongLinks.arrangement(songId: model.songId, arrangementId: row.id) {
        Button {
          openURL(url)
        } label: {
          Label("Open in Planning Center", symbol: .openExternal)
        }
      }
    }
  }
}

/// What an arrangement row shows, from either source.
private struct ArrangementRowData: Identifiable {
  let id: String
  let name: String
  let archived: Bool
  let keys: [KeyOption]
  let tempo: String
  let length: Int?
  let sequence: [String]

  init(_ option: ArrangementOption) {
    id = option.id
    name = option.name
    archived = option.archived
    keys = option.keys
    tempo = tempoLabel(option)
    length = option.length.map { Int($0.rounded()) }
    sequence = option.sequence
  }

  init(_ arrangement: ChordChartArrangement) {
    id = arrangement.id
    name = arrangement.name
    archived = arrangement.archived
    keys = arrangement.keys
    tempo = ""
    length = nil
    sequence = []
  }
}

private struct ArrangementRow: View {
  let row: ArrangementRowData
  let showsChevron: Bool

  var body: some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
          Text(verbatim: row.name.isEmpty ? String(localized: "Untitled arrangement") : row.name)
            .font(.rowTitleEmphasized)
            .foregroundStyle(row.archived ? Color.inkSecondary : .ink)
          if row.archived {
            StatusBadge("Archived", tone: .neutral, style: .plain)
          }
        }
        if let facts {
          Text(verbatim: facts)
            .font(.numericMeta)
            .foregroundStyle(.inkSecondary)
        }
        if !row.keys.isEmpty {
          SongFlowLayout(spacing: Spacing.sm) {
            ForEach(row.keys) { key in
              KeyChip(key: key)
            }
          }
        }
        if !row.sequence.isEmpty {
          Text(verbatim: row.sequence.joined(separator: ", "))
            .font(.meta)
            .foregroundStyle(.inkTertiary)
            .lineLimit(2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if showsChevron {
        Image(symbol: .chevronRight)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
          .padding(.top, Spacing.xxs)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.md + 2)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }

  /// "74 bpm · 4/4 · 5:00".
  private var facts: String? {
    var parts: [String] = []
    if !row.tempo.isEmpty { parts.append(row.tempo) }
    if let length = row.length, let text = DurationText.format(seconds: length, style: .total) {
      parts.append(text)
    }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }
}

/// An arrangement key: its starting key as a badge and its name ("G Original").
private struct KeyChip: View {
  let key: KeyOption

  var body: some View {
    HStack(spacing: Spacing.xs) {
      KeyBadge(key.startingKey)
      if !key.name.isEmpty, key.name != key.startingKey {
        Text(verbatim: key.name)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// A full-width row press: the fill appears instantly, nothing animates.
struct ArrangementRowButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed ? Color.surfaceHighlight : .clear)
  }
}
