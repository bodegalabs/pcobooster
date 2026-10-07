# Side by side of the Swift reference and the Expo app, with a difference panel, and a summary
# line: the share of pixels that differ by more than a small tolerance, ignoring the status bar.
# Usage: uv run --with pillow python scripts/compare.py <swift.png> <expo.png> <out.png>
import sys

from PIL import Image, ImageChops, ImageDraw, ImageOps

# Channel difference below this is antialiasing or color conversion noise.
TOLERANCE = 24
# The status bar and Dynamic Island, in pixels at 3x.
STATUS_BAR = 150

swift_path, expo_path, out_path = sys.argv[1:4]
swift = Image.open(swift_path).convert("RGB")
expo = Image.open(expo_path).convert("RGB").resize(swift.size)
difference = ImageChops.difference(swift, expo).convert("L")
body = difference.crop((0, STATUS_BAR, difference.width, difference.height))
histogram = body.histogram()
differing = sum(histogram[TOLERANCE:])
share = differing / (body.width * body.height)

panel = ImageOps.autocontrast(ImageOps.invert(difference))
gap = 24
label = 60
canvas = Image.new("RGB", (swift.width * 3 + gap * 2, swift.height + label), "white")
draw = ImageDraw.Draw(canvas)
for index, (image, title) in enumerate(
    [(swift, "SwiftUI"), (expo, "Expo / React Native"), (panel.convert("RGB"), "Difference")]
):
    x = index * (swift.width + gap)
    canvas.paste(image, (x, label))
    draw.text((x + 20, 15), title, fill="black", font_size=36)
canvas.save(out_path)
print(f"{out_path}: {share:.1%} of pixels differ")
