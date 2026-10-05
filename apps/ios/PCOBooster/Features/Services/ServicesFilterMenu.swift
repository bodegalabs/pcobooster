import PCOBoosterCore
import SwiftUI

/// The agenda's filter button: which dates to list and which service types to include (the
/// web's date window select and service type multi-select). Toggles keep the menu open so
/// several service types can be switched at once; long lists move to a searchable sheet.
struct ServicesFilterMenu: View {
  @Bindable var model: ServicesHomeModel
  @Binding var isChoosingServiceTypes: Bool

  /// Past this many service types, the menu offers a searchable sheet instead of toggles.
  static let inlineServiceTypeLimit = 8

  var body: some View {
    Menu {
      Section("Dates") {
        Picker("Dates", selection: $model.window) {
          ForEach(ServicesDateWindow.upcoming) { window in
            Text(window.title).tag(window)
          }
        }
        .pickerStyle(.inline)
        Picker("Past", selection: $model.window) {
          Label {
            Text(ServicesDateWindow.recent.title)
          } icon: {
            Image(systemName: "clock.arrow.circlepath")
          }
          .tag(ServicesDateWindow.recent)
        }
        .pickerStyle(.inline)
      }
      Section("Service types") {
        if model.allServiceTypes.count > Self.inlineServiceTypeLimit {
          Button {
            isChoosingServiceTypes = true
          } label: {
            Label {
              Text("Choose service types")
              Text(verbatim: model.serviceTypeSummary)
            } icon: {
              Image(systemName: "checklist")
            }
          }
        } else {
          ForEach(model.allServiceTypes) { serviceType in
            Toggle(
              isOn: Binding(
                get: { model.isSelected(serviceType) },
                set: { model.setSelected(serviceType, $0) })
            ) {
              Text(verbatim: serviceType.name)
            }
            .menuActionDismissBehavior(.disabled)
          }
          if !model.selectsAllServiceTypes {
            Button("Show all service types") {
              model.selectAllServiceTypes()
            }
            .menuActionDismissBehavior(.disabled)
          }
        }
      }
      if model.hasActiveFilters {
        Section {
          Button("Reset filters", systemImage: "arrow.counterclockwise") {
            model.resetFilters()
          }
        }
      }
    } label: {
      Label(
        "Filter",
        systemImage: model.hasActiveFilters
          ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease")
    }
    .accessibilityLabel(Text("Filter plans"))
    .accessibilityValue(Text(verbatim: "\(String(localized: model.window.title)), \(model.serviceTypeSummary)"))
    .accessibilityIdentifier("services-filter")
  }
}

/// The service type filter for organizations with many service types: a searchable checklist
/// that applies each change as it is made (no Done needed; closing keeps the choice).
struct ServiceTypePickerSheet: View {
  @Bindable var model: ServicesHomeModel
  @State private var query = ""
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(filtered) { serviceType in
            Button {
              model.setSelected(serviceType, !model.isSelected(serviceType))
            } label: {
              HStack {
                Text(verbatim: serviceType.name)
                  .foregroundStyle(.ink)
                Spacer()
                if model.isSelected(serviceType) {
                  Image(systemName: "checkmark")
                    .fontWeight(.semibold)
                    .foregroundStyle(.ink)
                }
              }
              .contentShape(.rect)
            }
            .accessibilityAddTraits(model.isSelected(serviceType) ? .isSelected : [])
            .cardRowBackground()
          }
        } header: {
          Text(verbatim: model.selectsAllServiceTypes ? "All selected" : "\(model.selectedIds.count) selected")
            .textCase(nil)
        }
      }
      .canvasBackground()
      .overlay {
        if filtered.isEmpty {
          ContentUnavailableView.search(text: query)
        }
      }
      .searchable(text: $query, prompt: "Search service types")
      .navigationTitle("Service types")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("All") { model.selectAllServiceTypes() }
            .disabled(model.selectsAllServiceTypes)
        }
        ToolbarItem(placement: .topBarLeading) {
          Button("Clear") { model.selectNoServiceTypes() }
            .disabled(model.selectedIds.isEmpty)
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button(role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  private var filtered: [ServiceType] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return model.allServiceTypes }
    return model.allServiceTypes.filter {
      $0.name.range(of: trimmed, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
  }
}
