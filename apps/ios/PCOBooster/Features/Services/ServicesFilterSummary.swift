import PCOBoosterCore
import SwiftUI

/// What the agenda is narrowed to, when it isn't the default ("Next 14 days · Youth Night"), with
/// a way back to every service type in the next 60 days. Quiet, like a Mail filter bar.
struct ServicesFilterSummary: View {
  let model: ServicesHomeModel

  var body: some View {
    HStack(spacing: Spacing.sm) {
      Image(systemName: "line.3.horizontal.decrease")
        .imageScale(.small)
        .foregroundStyle(.inkTertiary)
        .accessibilityHidden(true)
      Text(verbatim: summary)
        .font(.footnote.weight(.medium))
        .foregroundStyle(.inkSecondary)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button("Reset") { model.resetFilters() }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.ink)
        .buttonStyle(.borderless)
        .accessibilityLabel(Text("Reset filters"))
    }
    .padding(.horizontal, Spacing.md)
    .padding(.vertical, Spacing.sm)
    .frame(minHeight: 36)
    .background(.surfaceMuted, in: .capsule)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("services-filter-summary")
  }

  private var summary: String {
    var parts: [String] = []
    if model.window != .default {
      parts.append(String(localized: model.window.title))
    }
    if !model.selectsAllServiceTypes {
      parts.append(model.serviceTypeSummary)
    }
    return parts.joined(separator: " \u{B7} ")
  }
}

/// The end of the agenda: which window it covers, and the next step out of it (every upcoming
/// plan, or back to upcoming from recent plans).
struct AgendaWindowFooter: View {
  @Bindable var model: ServicesHomeModel

  var body: some View {
    if let text {
      VStack(spacing: Spacing.sm) {
        Text(verbatim: text)
          .font(.footnote)
          .foregroundStyle(.inkTertiary)
          .multilineTextAlignment(.center)
        if let action {
          Button(action.title) { model.window = action.window }
            .buttonStyle(.pill(.outline, size: .small))
        }
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, Spacing.lg)
      .accessibilityElement(children: .contain)
    }
  }

  private var text: String? {
    switch model.window {
    case .next14Days: "Plans in the next 14 days."
    case .next30Days: "Plans in the next 30 days."
    case .next60Days: "Plans in the next 60 days."
    case .allUpcoming: nil
    case .recent: "The latest past plans of each service type."
    }
  }

  private var action: (title: LocalizedStringKey, window: ServicesDateWindow)? {
    switch model.window {
    case .next14Days, .next30Days, .next60Days: ("Show all upcoming", .allUpcoming)
    case .allUpcoming: nil
    case .recent: ("Show upcoming plans", .default)
    }
  }
}
