/**
 * The replica scrolls opened panels into view smoothly, which plays out over wall-clock
 * time while frames are captured one at a time. In the video every scroll lands at once,
 * so a frame always shows the scroll finished.
 */
// oxlint-disable-next-line typescript/unbound-method -- called below with the element as `this`
const nativeScrollIntoView = Element.prototype.scrollIntoView;

Element.prototype.scrollIntoView = function scrollIntoView(
  this: Element,
  options?: boolean | ScrollIntoViewOptions
) {
  const instant =
    options === undefined || options === true || options === false
      ? options
      : { ...options, behavior: "instant" as const };
  nativeScrollIntoView.call(this, instant);
};
