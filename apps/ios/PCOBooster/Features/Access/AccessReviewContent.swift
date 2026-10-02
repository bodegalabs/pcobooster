import PCOBoosterCore
import SwiftUI

/// The body of the access review (the web's `AccessReviewDialog`): what pcobooster.com can do
/// with this person's Planning Center permissions, one row per feature this deployment shows.
/// The automatic prompt shows it as a page with a large header; the account sheet pushes it
/// under its own navigation title.
struct AccessReviewContent: View {
  enum Presentation {
    /// The automatic prompt: a centered icon, title, and description.
    case page
    /// Pushed in the account sheet, under the "Your Access" title.
    case pushed
  }

  let review: AccessReview
  let presentation: Presentation
  var retry: () -> Void = {}

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xl) {
      switch presentation {
      case .page:
        pageHeader
      case .pushed:
        if review.status == .ready {
          Text(description)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, Spacing.xs)
        }
      }
      switch review.status {
      case .loading:
        loadingCard
          .transition(.opacity)
      case .failed:
        InfoBanner(
          "Planning Center didn't answer, so your permissions couldn't be checked. Try again in a moment.",
          tone: .destructive
        ) {
          Button("Retry", action: retry)
        }
        .transition(.opacity)
      case .ready:
        featureCard
          .transition(.opacity)
        if review.isRestricted {
          Text(
            "Permissions are set in Planning Center, in each person's Services and People settings. Changes show up here within a few minutes."
          )
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, Spacing.xs)
        }
      }
    }
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: review.status)
  }

  private var description: LocalizedStringKey {
    review.isRestricted
      ? "pcobooster.com can only do what your Planning Center permissions allow. Some of it won't work for you yet."
      : "Your Planning Center permissions let you use everything here."
  }

  private var pageHeader: some View {
    VStack(spacing: Spacing.md) {
      AppSymbol.access.image
        .font(.system(size: 30, weight: .regular))
        .foregroundStyle(.ink)
        .frame(width: 64, height: 64)
        .background(.surfaceMuted, in: .rect(cornerRadius: Radius.tile, style: .continuous))
        .accessibilityHidden(true)
      Text("Your Planning Center access")
        .font(.heroTitle)
        .foregroundStyle(.ink)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Group {
        if review.status == .loading {
          Text("Checking your permissions\u{2026}")
        } else {
          Text(description)
        }
      }
      .font(.rowDetail)
      .foregroundStyle(.inkSecondary)
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, Spacing.lg)
  }

  private var featureCard: some View {
    VStack(spacing: 0) {
      ForEach(Array(review.features.enumerated()), id: \.element.id) { index, entry in
        if index > 0 {
          Hairline(color: .hairlineSubtle)
            .padding(.leading, 22 + Spacing.md)
        }
        FeatureAccessRow(entry: entry)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .surfaceCard()
  }

  private var loadingCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(0..<4, id: \.self) { index in
        HStack(alignment: .top, spacing: Spacing.md) {
          Skeleton(.round, width: 20, height: 20)
          VStack(alignment: .leading, spacing: Spacing.sm) {
            Skeleton(.text, width: [150, 120, 170, 110][index], height: 12)
            Skeleton(.text, width: [220, 190, 240, 160][index], height: 10)
          }
        }
        .padding(.vertical, Spacing.md)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .surfaceCard()
    .accessibilityElement()
    .accessibilityLabel(Text("Checking your permissions"))
  }
}

#if DEBUG
#Preview("Access review, limited") {
  ScrollView {
    AccessReviewContent(review: AccessSample.limited.review(), presentation: .page)
      .padding(Spacing.lg)
  }
  .background(.surfaceCanvas)
}
#endif
