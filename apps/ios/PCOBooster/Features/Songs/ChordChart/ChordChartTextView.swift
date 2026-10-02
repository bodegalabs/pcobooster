import PCOBoosterCore
import SwiftUI
import UIKit

/// Edits the text view from outside it: the Insert menu and the keyboard bar put text at the
/// caret (replacing the selection), which the text view's own undo can take back.
@MainActor
@Observable
final class ChordChartTextController {
  @ObservationIgnored weak var textView: UITextView?
  @ObservationIgnored var onChange: ((String) -> Void)?

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
    if let position = textView.position(from: textView.selectedTextRange?.start ?? textView.endOfDocument, offset: -1) {
      textView.selectedTextRange = textView.textRange(from: position, to: position)
    }
  }

  func dismissKeyboard() {
    textView?.resignFirstResponder()
  }

  private func replaceSelection(with text: String) {
    guard let textView, textView.isEditable else { return }
    if !textView.isFirstResponder { textView.becomeFirstResponder() }
    guard let range = textView.selectedTextRange ?? textView.textRange(
      from: textView.endOfDocument, to: textView.endOfDocument)
    else {
      return
    }
    textView.replace(range, withText: text)
    (textView.delegate as? ChordChartTextView.Coordinator)?.reportIfChanged(textView)
  }
}

/// The chart text: monospaced, colored as you type (`ChordChartHighlighter`), with a keyboard bar
/// of chords in the written key, brackets, and section headings. Lines wrap by default so a
/// phone shows whole lines; turning wrapping off keeps chords over their lyric columns and
/// scrolls sideways, like the web's editor. Autocorrect, smart quotes, and smart dashes are off,
/// since they would rewrite chords and Services codes.
struct ChordChartTextView: UIViewRepresentable {
  let text: String
  let isEditable: Bool
  let wrapsLines: Bool
  let placeholder: String
  let controller: ChordChartTextController
  /// Chords for the keyboard bar, in the written key.
  let chords: [String]
  let onChange: (String) -> Void
  let onSave: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onChange: onChange, onSave: onSave)
  }

  func makeUIView(context: Context) -> ChartTextView {
    let view = ChartTextView()
    view.delegate = context.coordinator
    view.onSave = { context.coordinator.onSave() }
    view.backgroundColor = .clear
    view.autocorrectionType = .no
    view.spellCheckingType = .no
    view.smartQuotesType = .no
    view.smartDashesType = .no
    view.smartInsertDeleteType = .no
    view.autocapitalizationType = .sentences
    view.keyboardDismissMode = .interactive
    view.alwaysBounceVertical = true
    view.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 96, right: 12)
    view.accessibilityLabel = String(localized: "Lyrics and chords")
    view.accessibilityIdentifier = "chord-chart-text"
    view.placeholderLabel.text = placeholder
    view.registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (view: ChartTextView, _: UITraitCollection) in
      view.rehighlight()
    }

    let bar = context.coordinator.makeKeyboardBar(controller: controller, chords: chords)
    view.inputAccessoryView = bar

    controller.textView = view
    controller.onChange = onChange
    view.text = text
    context.coordinator.lastReported = text
    view.isEditable = isEditable
    view.setWrapsLines(wrapsLines)
    view.rehighlight()
    return view
  }

  func updateUIView(_ view: ChartTextView, context: Context) {
    context.coordinator.onChange = onChange
    context.coordinator.onSave = onSave
    controller.textView = view
    controller.onChange = onChange
    if view.isEditable != isEditable {
      view.isEditable = isEditable
      if !isEditable { view.resignFirstResponder() }
    }
    view.setWrapsLines(wrapsLines)
    view.placeholderLabel.text = placeholder
    context.coordinator.updateKeyboardBar(controller: controller, chords: chords)
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
    private var keyboardBar: UIHostingController<ChordChartKeyboardBar>?

    init(onChange: @escaping (String) -> Void, onSave: @escaping () -> Void) {
      self.onChange = onChange
      self.onSave = onSave
    }

    func textViewDidChange(_ textView: UITextView) {
      (textView as? ChartTextView)?.rehighlight()
      (textView as? ChartTextView)?.updatePlaceholder()
      reportIfChanged(textView)
    }

    func reportIfChanged(_ textView: UITextView) {
      guard textView.text != lastReported else { return }
      lastReported = textView.text
      (textView as? ChartTextView)?.rehighlight()
      onChange(textView.text)
    }

    func makeKeyboardBar(controller: ChordChartTextController, chords: [String]) -> UIView {
      let hosting = UIHostingController(rootView: ChordChartKeyboardBar(controller: controller, chords: chords))
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

    func updateKeyboardBar(controller: ChordChartTextController, chords: [String]) {
      guard let keyboardBar, keyboardBar.rootView.chords != chords else { return }
      keyboardBar.rootView = ChordChartKeyboardBar(controller: controller, chords: chords)
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

/// The bar above the keyboard: empty brackets, the written key's chords as `[G]` buttons, the
/// section headings, and Done.
struct ChordChartKeyboardBar: View {
  let controller: ChordChartTextController
  let chords: [String]

  /// The web's Insert menu sections.
  static let sections = ["VERSE 1", "PRE-CHORUS", "CHORUS", "BRIDGE", "TAG", "INSTRUMENTAL"]

  var body: some View {
    HStack(spacing: Spacing.sm) {
      ScrollView(.horizontal) {
        HStack(spacing: Spacing.xs + 2) {
          Button {
            controller.insertBrackets()
          } label: {
            Text(verbatim: "[ ]").font(.monoCaption.weight(.semibold))
          }
          .accessibilityLabel(Text("Insert chord brackets"))
          ForEach(chords, id: \.self) { chord in
            Button {
              controller.insertChord(chord)
            } label: {
              Text(verbatim: KeyBadge.display(chord)).font(.monoCaption.weight(.semibold))
            }
            .accessibilityLabel(Text("Insert chord \(KeyBadge.spoken(chord))"))
          }
          Menu {
            ForEach(Self.sections, id: \.self) { section in
              Button(section) { controller.insertLine(section) }
            }
          } label: {
            Label("Section", systemImage: "text.insert")
              .font(.footnote.weight(.semibold))
          }
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        .padding(.horizontal, Spacing.md)
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
}
