import PCOBoosterCore
import SwiftUI
import UIKit

@main
struct PCOBoosterApp: App {
  @State private var launch: Launch

  init() {
    Self.styleNavigationTitles()
    do {
      _launch = State(initialValue: .ready(try AppModel.live()))
    } catch {
      _launch = State(initialValue: .misconfigured(error))
    }
  }

  var body: some Scene {
    WindowGroup {
      switch launch {
      case .ready(let app):
        #if DEBUG
        if app.launchOptions.showsGallery {
          DesignSystemGallery()
        } else {
          AppRootView(app: app)
        }
        #else
        AppRootView(app: app)
        #endif
      case .misconfigured(let error):
        ConfigurationErrorView(error: error)
      }
    }
    .commands {
      AppCommands(app: launch.app)
    }
  }

  /// Navigation titles in ink, like every other heading, instead of system black or white.
  private static func styleNavigationTitles() {
    guard let ink = UIColor(named: "Colors/Ink") else { return }
    let bar = UINavigationBar.appearance()
    bar.largeTitleTextAttributes = [.foregroundColor: ink]
    bar.titleTextAttributes = [.foregroundColor: ink]
  }

  private enum Launch {
    case ready(AppModel)
    case misconfigured(AppConfigurationError)

    var app: AppModel? {
      if case .ready(let app) = self { app } else { nil }
    }
  }
}
