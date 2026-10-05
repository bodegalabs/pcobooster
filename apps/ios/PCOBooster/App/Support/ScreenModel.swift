import Observation
import PCOBoosterCore
import SwiftUI

/// A screen's `@Observable` model, built once per view identity with the app's dependencies,
/// before the screen's first frame (so values cached on disk paint without a skeleton flash).
/// Rebuilding the view (a parent re-render) keeps the same model; a new identity (a different
/// route, an account switch) builds a new one.
///
/// ```swift
/// struct RunSheetView: View {
///   let context: PlanContext
///   @ScreenModel private var model: RunSheetModel
///
///   init(context: PlanContext) {
///     self.context = context
///     _model = ScreenModel { app in RunSheetModel(queries: app.queries, context: context) }
///   }
/// }
/// ```
@propertyWrapper
struct ScreenModel<Model: AnyObject>: DynamicProperty {
  @Environment(AppModel.self) private var app
  @State private var storage = ScreenModelStorage<Model>()
  private let make: @MainActor (AppModel) -> Model

  init(_ make: @escaping @MainActor (AppModel) -> Model) {
    self.make = make
  }

  var wrappedValue: Model {
    if let model = storage.model {
      return model
    }
    let model = make(app)
    storage.model = model
    return model
  }

  func update() {
    if storage.model == nil {
      storage.model = make(app)
    }
  }
}

/// Holds the model outside observation, so creating it never invalidates the view.
final class ScreenModelStorage<Model: AnyObject> {
  var model: Model?
}

extension View {
  /// Tells cached reads whether this screen is showing: `appear()` on appear (stale values
  /// revalidate), `disappear()` when covered or gone (invalidations stop refetching for it).
  /// Apply it on the screen that holds the states.
  ///
  /// `.queryLifecycle(model.items, model.times)`
  func queryLifecycle(_ states: any QueryLifecycleObserving...) -> some View {
    onAppear {
      for state in states { state.appear() }
    }
    .onDisappear {
      for state in states { state.disappear() }
    }
  }
}

/// A `QueryState` of any value type.
@MainActor
protocol QueryLifecycleObserving: AnyObject {
  func appear()
  func disappear()
}

extension QueryState: QueryLifecycleObserving {}
