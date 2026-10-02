import SwiftUI

/// An inline notice inside content, like the web `Alert`: a tone icon and one or two lines of
/// text on a soft solid fill with a hairline outline. `.info` uses the info surface and blue icon;
/// `.destructive` a soft red fill for problems the user should act on. Keep it short and rare.
///
/// `InfoBanner("Avery is also scheduled for Vocals on this plan.")`,
/// `InfoBanner("Some availability failed to load.", tone: .destructive) { Button("Retry") { retry() } }`.
struct InfoBanner<Action: View>: View {
  enum Tone: Hashable, Sendable {
    case info
    case destructive
  }

  private let message: Text
  private let tone: Tone
  private let action: Action

  init(_ message: LocalizedStringKey, tone: Tone = .info, @ViewBuilder action: () -> Action) {
    self.message = Text(message)
    self.tone = tone
    self.action = action()
  }

  /// For runtime messages, such as an API error's `data.message`.
  init(verbatim message: String, tone: Tone = .info, @ViewBuilder action: () -> Action) {
    self.message = Text(verbatim: message)
    self.tone = tone
    self.action = action()
  }

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Image(symbol: tone == .info ? .info : .alert)
        .foregroundStyle(tone == .info ? Color.statusInfo : Color.destructive)
        .accessibilityHidden(true)
      message
        .font(.rowDetail)
        .foregroundStyle(.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
      action
        .buttonStyle(.pill(.outline, size: .small))
    }
    .padding(Spacing.md)
    .background(fill, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .hairlineBorder(RoundedRectangle.inner, color: border)
    .accessibilityElement(children: .combine)
  }

  private var fill: Color {
    tone == .info ? .infoSurface : Color.destructive.opacity(0.08)
  }

  private var border: Color {
    tone == .info ? .infoBorder : Color.destructive.opacity(0.25)
  }
}

extension InfoBanner where Action == EmptyView {
  init(_ message: LocalizedStringKey, tone: Tone = .info) {
    self.init(message, tone: tone) { EmptyView() }
  }

  init(verbatim message: String, tone: Tone = .info) {
    self.init(verbatim: message, tone: tone) { EmptyView() }
  }
}

#Preview("Info banners") {
  VStack(spacing: Spacing.md) {
    InfoBanner("Avery is also scheduled for Vocals on this plan.")
    InfoBanner("Some availability failed to load.", tone: .destructive) {
      Button("Retry") {}
    }
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
