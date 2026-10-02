#if DEBUG
import PCOBoosterCore
import SwiftUI

/// Debug section tool: the access review with sample permissions, the no-Services screen, and
/// the not-found page, since the mock account is an organization administrator.
struct AccessPreviewsView: View {
  @State private var reviewSample: AccessSample?
  @State private var isNoServicesPresented = false

  var body: some View {
    List {
      Section {
        ForEach(AccessSample.allCases.filter { $0 != .none }) { sample in
          Button(sample.title) { reviewSample = sample }
            .foregroundStyle(.ink)
            .cardRowBackground()
        }
      } header: {
        SectionHeader("Access review")
      } footer: {
        Text("Launch with -PCOBAccessSample limited to see the review open on its own.")
      }
      Section {
        Button("No Services access") { isNoServicesPresented = true }
          .foregroundStyle(.ink)
          .cardRowBackground()
        NavigationLink("Page not found") {
          ProductNotFoundView()
        }
        .foregroundStyle(.ink)
        .cardRowBackground()
      } header: {
        SectionHeader("Screens")
      }
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .navigationTitle("Access Previews")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(item: $reviewSample) { sample in
      AccessReviewSheet(review: sample.review())
    }
    .fullScreenCover(isPresented: $isNoServicesPresented) {
      NoServicesAccessScreen()
        .overlay(alignment: .topLeading) {
          Button(role: .close) { isNoServicesPresented = false }
            .buttonStyle(.glass)
            .padding(.leading, Spacing.lg)
            .padding(.top, Spacing.xs)
        }
    }
  }
}
#endif
