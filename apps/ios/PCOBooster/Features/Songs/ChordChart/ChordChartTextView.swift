import PCOBoosterCore
import SwiftUI
import UIKit

/// Edits the text view from outside it: the Insert menu and the keyboard bar put text at the
/// caret (replacing the selection), which the text view's own undo can take back. Also carries
/// what the keyboard bar shows (the written key's chords and the save status), so the bar
/// follows the editor without rebuilding.
@MainActor
@Observable
final class ChordChartTextController {
  /// Chords for the keyboard bar, in the written key.
  var chords: [String] = []
  var status: ChordChartSaveLabel = .checking
  /// The keyboard is up for the chart.
  private(set) var isEditing = false

  @ObservationIgnored weak var textView: UITextView?

  /// A section heading or Services code on its own line (the web's `insertAtCaret`).
  func insertLine(_ snippet: String) {
    guard let textView, textView.isEditable else { return }
    let text = textView.text as NSString
    let location = min(textView.selectedRange.location, text.length)
    let atLineStart = location == 0 || text.character(at: location - 1) == 10
    replaceSelection(with: "\(atLineStart ? "" : "\n")\(snippet)\n")
  }

  /// An inline chord, `[G]`, at the caret.
  func insertChord(_ chord: String) {
    replaceSelection(with: "[\(chord)]")
  }

  /// Empty brackets with the caret between them, ready for a chord.
  func insertBrackets() {
    guard let textView, textView.isEditable else { return }
    replaceSelection(with: "[]")
    if let end = textView.selectedTextRange?.start,
      let position = textView.position(from: end, offset: -1)
    {
      textView.selectedTextRange = textView.textRange(from: position, to: position)
    }
  }

  func dismissKeyboard() {
    textView?.resignFirstResponder()
  }

  fileprivate func setEditing(_ editing: Bool) {
    if isEditing != editing { isEditing = editing }
  }

  private func replaceSelection(with text: String) {
    guard let textView, textView.isEditable else { return }
    if !textView.isFirstResponder { textView.becomeFirstResponder() }
    guard
      let range = textView.selectedTextRange
        ?? textView.textRange(from: textView.endOfDocument, to: textView.endOfDocument)
    else {
      return
    }
    textView.replace(range, withText: text)
    (textView.delegate as? ChordChartTextView.Coordinator)?.reportIfChanged(textView)
  }
}

/// The chart text: monospaced, colored as you type (`ChordChartHighlighter`), with a keyboard bar
/// of chords in the written key, brackets, section headings, and codes. Lines wrap by default so
/// a phone shows whole lines; turning wrapping off keeps chords over their lyric columns and
/// scrolls sideways, like the web's editor. Autocorrect, smart quotes, and smart dashes are off,
/// since they would rewrite chords and Services codes. Command-S saves from a hardware keyboard.
struct ChordChartTextView: UIViewRepresentable {
  let text: String
  let isEditable: Bool
  let wrapsLines: Bool
  let placeholder: String
  let controller: ChordChartTextController
  let onChange: (String) -> Void
  let onSave: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onChange: onChange, onSave: onSave, controller: controller)
  }

  func makeUIView(context: Context) -> ChartTextView {
    let view = ChartTextView()
    view.delegate = context.coordinator
    view.onSave = { [weak coordinator = context.coordinator] in coordinator?.onSave() }
    view.backgroundColor = .clear
    view.autocorrectionType = .no
    view.spellCheckingType = .no
    view.smartQuotesType = .no
    view.smartDashesType = .no
    view.smartInsertDeleteType = .no
    view.autocapitalizationType = .sentences
    view.keyboardDismissMode = .interactive
    view.alwaysBounceVertical = true
    view.adjustsFontForContentSizeCategory = true
    view.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 32, right: 12)
    view.accessibilityLabel = String(localized: "Lyrics and chords")
    view.accessibilityIdentifier = "chord-chart-text"
    view.placeholderLabel.text = placeholder
    view.registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: ChartTextView, _: UITraitCollection) in
      view.rehighlight()
    }
    view.inputAccessoryView = context.coordinator.makeKeyboardBar()

    controller.textView = view
    view.text = text
    context.coordinator.lastReported = text
    view.isEditable = isEditable
    view.setWrapsLines(wrapsLines)
    view.rehighlight()
    view.updatePlaceholder()
    return view
  }

  func updateUIView(_ view: ChartTextView, context: Context) {
    context.coordinator.onChange = onChange
    context.coordinator.onSave = onSave
    controller.textView = view
    if view.isEditable != isEditable {
      view.isEditable = isEditable
      if !isEditable { view.resignFirstResponder() }
    }
    view.setWrapsLines(wrapsLines)
    view.placeholderLabel.text = placeholder
    // Changes from outside the text view (transpose, import, revert, their version) replace the
    // text; the caret stays where it was, within the new text.
    if view.text != text, view.markedTextRange == nil {
      let selection = view.selectedRange
      view.text = text
      let length = (text as NSString).length
      view.selectedRange = NSRange(location: min(selection.location, length), length: 0)
      context.coordinator.lastReported = text
      view.rehighlight()
    }
    view.updatePlaceholder()
  }

  @MainActor
  final class Coordinator: NSObject, UITextViewDelegate {
    var onChange: (String) -> Void
    var onSave: () -> Void
    var lastReported = ""
    private let controller: ChordChartTextController
    private var keyboardBar: UIHostingController<ChordChartKeyboardBar>?

    init(
      onChange: @escaping (String) -> Void, onSave: @escaping () -> Void,
      controller: ChordChartTextController
    ) {
      self.onChange = onChange
      self.onSave = onSave
      self.controller = controller
    }

    func textViewDidChange(_ textView: UITextView) {
      (textView as? ChartTextView)?.updatePlaceholder()
      reportIfChanged(textView)
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
      controller.setEditing(true)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
      controller.setEditing(false)
    }

    func reportIfChanged(_ textView: UITextView) {
      guard textView.text != lastReported else { return }
      lastReported = textView.text
      (textView as? ChartTextView)?.rehighlight()
      onChange(textView.text)
    }

    func makeKeyboardBar() -> UIView {
      let hosting = UIHostingController(rootView: ChordChartKeyboardBar(controller: controller))
      hosting.view.backgroundColor = .clear
      hosting.sizingOptions = []
      keyboardBar = hosting
      let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 56))
      container.autoresizingMask = [.flexibleWidth]
      container.backgroundColor = .clear
      hosting.view.translatesAutoresizingMaskIntoConstraints = false
      container.addSubview(hosting.view)
      NSLayoutConstraint.activate([
        hosting.view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
        hosting.view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        hosting.view.topAnchor.constraint(equalTo: container.topAnchor),
        hosting.view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
      ])
      return container
    }
  }
}

/// The chart's `UITextView`: re-colors itself, shows a placeholder while empty, saves on
/// Command-S from a hardware keyboard, and wraps lines or scrolls sideways.
final class ChartTextView: UITextView {
  let placeholderLabel = UILabel()
  var onSave: (() -> Void)?
  private var wrapsLines = true

  override init(frame: CGRect, textContainer: NSTextContainer?) {
    super.init(frame: frame, textContainer: textContainer)
    placeholderLabel.numberOfLines = 0
    placeholderLabel.textColor = ChordChartHighlighter.color("InkTertiary")
    placeholderLabel.isAccessibilityElement = false
    addSubview(placeholderLabel)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not used")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let inset = textContainerInset
    let padding = textContainer.lineFragmentPadding
    let width = bounds.width - inset.left - inset.right - padding * 2
    let size = placeholderLabel.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    placeholderLabel.frame = CGRect(x: inset.left + padding, y: inset.top, width: width, height: size.height)
  }

  override var keyCommands: [UIKeyCommand]? {
    let save = UIKeyCommand(
      title: String(localized: "Save Now"), action: #selector(saveCommand), input: "s",
      modifierFlags: .command)
    save.wantsPriorityOverSystemBehavior = true
    return (super.keyCommands ?? []) + [save]
  }

  @objc private func saveCommand() {
    onSave?()
  }

  func rehighlight() {
    guard markedTextRange == nil else { return }
    let selection = selectedRange
    ChordChartHighlighter.apply(to: textStorage, traits: traitCollection)
    typingAttributes = ChordChartHighlighter.baseAttributes(traits: traitCollection)
    placeholderLabel.font = ChordChartHighlighter.font(traits: traitCollection)
    if selectedRange != selection { selectedRange = selection }
  }

  func updatePlaceholder() {
    placeholderLabel.isHidden = !text.isEmpty
  }

  func setWrapsLines(_ wraps: Bool) {
    guard wraps != wrapsLines else { return }
    wrapsLines = wraps
    textContainer.widthTracksTextView = wraps
    if wraps {
      textContainer.size = CGSize(width: bounds.width, height: .greatestFiniteMagnitude)
    } else {
      textContainer.size = CGSize(width: 4000, height: CGFloat.greatestFiniteMagnitude)
    }
    alwaysBounceHorizontal = !wraps
    showsHorizontalScrollIndicator = !wraps
    setNeedsLayout()
  }
}

/// The bar above the keyboard: the save status, empty brackets, the written key's chords as
/// `[G]` buttons, section headings and codes, and Hide Keyboard.
struct ChordChartKeyboardBar: View {
  let controller: ChordChartTextController

  var body: some View {
    HStack(spacing: Spacing.sm) {
      statusIcon
        .padding(.leading, Spacing.md)
      ScrollView(.horizontal) {
        HStack(spacing: Spacing.xs + 2) {
          Button {
            controller.insertBrackets()
          } label: {
            Text(verbatim: "[ ]").font(.monoCaption.weight(.semibold))
          }
          .accessibilityLabel(Text("Insert chord brackets"))
          ForEach(controller.chords, id: \.self) { chord in
            Button {
              controller.insertChord(chord)
            } label: {
              Text(verbatim: KeyBadge.display(chord)).font(.monoCaption.weight(.semibold))
            }
            .accessibilityLabel(Text("Insert chord \(KeyBadge.spoken(chord))"))
          }
          Menu {
            Section("Section") {
              ForEach(ChordChartSnippets.sections, id: \.self) { section in
                Button(section) { controller.insertLine(section) }
              }
            }
            Section("Planning Center Codes") {
              ForEach(ChordChartSnippets.codes, id: \.text) { code in
                Button(code.label) { controller.insertLine(code.text) }
              }
            }
          } label: {
            Label("Insert", systemImage: "text.badge.plus")
              .font(.footnote.weight(.semibold))
          }
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        .padding(.horizontal, Spacing.xs)
      }
      .scrollIndicators(.hidden)
      Button {
        controller.dismissKeyboard()
      } label: {
        Image(systemName: "keyboard.chevron.compact.down")
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.circle)
      .accessibilityLabel(Text("Hide keyboard"))
      .padding(.trailing, Spacing.md)
    }
    .frame(height: 52)
    .tint(.ink)
  }

  /// A quiet mark for where the save stands, so typing never hides it.
  @ViewBuilder private var statusIcon: some View {
    let status = controller.status
    Group {
      if status.isBusy {
        ProgressView().controlSize(.small)
      } else {
        Image(systemName: Self.symbol(status))
          .foregroundStyle(status == .saved ? Color.statusConfirmed : .inkSecondary)
          .contentTransition(.symbolEffect(.replace))
      }
    }
    .font(.body)
    .frame(width: 24, height: 24)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: status.full))
  }

  private static func symbol(_ status: ChordChartSaveLabel) -> String {
    switch status {
    case .saved: "checkmark.circle.fill"
    case .unsaved: "circle.dotted"
    case .paused: "exclamationmark.triangle.fill"
    case .viewOnly: "lock.fill"
    case .checking, .saving: "arrow.triangle.2.circlepath"
    }
  }
}
