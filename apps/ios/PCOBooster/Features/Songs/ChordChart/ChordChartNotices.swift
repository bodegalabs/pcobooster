import PCOBoosterCore
import SwiftUI

/// The notices above the chart text, at most a few at once: why the chart is view only, a
/// conflict with someone's newer version, a restored draft, an import to undo, and a way to start
/// an empty chart from lyrics.
struct ChordChartNotices: View {
  let workspace: ChordChartWorkspaceModel
  let access: ChordChartEditAccess
  let findLyrics: () -> Void

  var body: some View {
    VStack(spacing: Spacing.sm) {
      if let reason = access.reason {
        NoticeCard(symbol: .locked, title: "View only", message: Text(verbatim: reason))
          .accessibilityIdentifier("chord-chart-view-only")
      }
      if access.canEdit, workspace.conflict != nil {
        ConflictNotice(workspace: workspace)
      }
      if workspace.showsRestoredDraft {
        InlineNotice(message: "Unsaved draft restored from this device.") {
          Button("Discard", role: .destructive) { workspace.discardRestored() }
            .accessibilityIdentifier("chord-chart-discard-draft")
        }
      }
      if workspace.replaced != nil {
        InlineNotice(message: "Chart replaced.") {
          Button("Undo") { workspace.undoReplace() }
            .accessibilityIdentifier("chord-chart-undo-import")
        }
      }
      if workspace.isEditable,
        workspace.draft.chart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        InlineNotice(message: "Start from lyrics found online, or paste a chart.") {
          Button {
            findLyrics()
          } label: {
            Label("Find Lyrics", symbol: .search)
          }
          .accessibilityIdentifier("chord-chart-find-lyrics")
        }
      }
    }
    .animation(.default, value: workspace.conflict != nil)
  }
}

/// A one-line notice with an action at its end, like the web's restored-draft line.
private struct InlineNotice<Action: View>: View {
  let message: LocalizedStringKey
  @ViewBuilder let action: Action

  var body: some View {
    HStack(spacing: Spacing.md) {
      Text(message)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
      action
        .buttonStyle(.pill(.secondary, size: .small))
    }
    .padding(.horizontal, Spacing.md)
    .padding(.vertical, Spacing.sm)
    .background(.surfaceCard, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .hairlineBorder(RoundedRectangle.inner, color: .hairline)
  }
}

/// A titled notice, like the web's `Alert`.
private struct NoticeCard<Actions: View>: View {
  let symbol: AppSymbol
  let title: LocalizedStringKey
  let message: Text
  var tone: Color = .statusInfo
  @ViewBuilder var actions: Actions

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Image(symbol: symbol)
        .foregroundStyle(tone)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xs) {
        Text(title)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        message
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
        actions
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(Spacing.md)
    .background(.infoSurface, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .hairlineBorder(RoundedRectangle.inner, color: .infoBorder)
    .accessibilityElement(children: .contain)
  }
}

extension NoticeCard where Actions == EmptyView {
  init(symbol: AppSymbol, title: LocalizedStringKey, message: Text) {
    self.init(symbol: symbol, title: title, message: message) { EmptyView() }
  }
}

/// Someone saved a newer version in Planning Center while this editor had unsaved edits.
/// Saving waits until the person keeps one, and keeping theirs over yours asks first; theirs
/// discards this editor's text, so it can be copied out first (`ConflictNotice`).
private struct ConflictNotice: View {
  let workspace: ChordChartWorkspaceModel
  @State private var confirmsKeepMine = false
  @State private var copied = false

  private var theirsLoaded: Bool { workspace.conflict?.theirs != nil }

  var body: some View {
    NoticeCard(
      symbol: .warning, title: "Someone changed this chart in Planning Center",
      message: Text(
        "Saving is paused so neither version is lost. Keep theirs, or replace it with yours. Copy yours first to keep it either way."
      ),
      tone: .statusPendingText
    ) {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Spacing.sm) { buttons }
        VStack(alignment: .leading, spacing: Spacing.sm) { buttons }
      }
      .padding(.top, Spacing.xs)
    }
    .accessibilityIdentifier("chord-chart-conflict")
    .confirmationDialog(
      "Replace their version with yours?", isPresented: $confirmsKeepMine, titleVisibility: .visible
    ) {
      Button("Keep Mine", role: .destructive) { workspace.keepMine() }
    } message: {
      Text("Saves your chart to Planning Center as it is now. The changes they saved are lost.")
    }
    .task(id: copied) {
      guard copied else { return }
      try? await Task.sleep(for: .seconds(2))
      copied = false
    }
  }

  @ViewBuilder private var buttons: some View {
    Button {
      UIPasteboard.general.string = workspace.draft.chart
      copied = true
    } label: {
      Label(copied ? "Copied" : "Copy Mine", symbol: copied ? .checkmark : .copy)
        .contentTransition(.symbolEffect(.replace))
    }
    .buttonStyle(.pill(.outline, size: .small))
    if theirsLoaded {
      Button("Use Planning Center\u{2019}s") { workspace.useTheirs() }
        .buttonStyle(.pill(.secondary, size: .small))
        .accessibilityLabel(Text("Use the Planning Center version"))
        .accessibilityIdentifier("chord-chart-use-theirs")
      Button("Keep Mine") { confirmsKeepMine = true }
        .buttonStyle(.pill(.primary, size: .small))
        .accessibilityIdentifier("chord-chart-keep-mine")
    } else {
      Button {
        Task { await workspace.loadTheirVersion() }
      } label: {
        HStack(spacing: Spacing.xs) {
          if workspace.isLoadingTheirs { ProgressView().controlSize(.mini) }
          Text("Load Their Version")
        }
      }
      .buttonStyle(.pill(.secondary, size: .small))
      .disabled(workspace.isLoadingTheirs)
    }
  }
}
