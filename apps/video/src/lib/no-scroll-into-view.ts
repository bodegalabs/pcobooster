/**
 * The replica scrolls opened panels into view. In the video that scroll lands on the
 * product window itself (an `overflow: hidden` box the camera moves), and it runs from
 * effects that fire at different moments in each render tab, so the run sheet jumped up
 * and down between frames. The camera does the framing here, so scrolling into view does
 * nothing.
 */
Element.prototype.scrollIntoView = function scrollIntoView() {
  // Intentionally empty: the camera frames every target.
};
