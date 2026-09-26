"""Cut the Larpbox TV logo out of its white background (a step toward the favicons).

The app shows the original PNG unchanged (apps/web/src/assets/brand/larpbox-logo.png) on its white
pages; this cut-out only feeds scripts/brand-favicon.py, whose icons need a transparent TV box.

Usage (Python 3 with Pillow and NumPy):
  python3 scripts/brand-logo.py apps/web/src/assets/brand/larpbox-logo.png <out_dir> <preview_dir>
then run scripts/brand-favicon.py on <out_dir>/larpbox-logo-full.png.
The background is pure white (255,255,255); the logo's fill is cream (~252,250,245), so large
pure-white regions are background even when enclosed, and small white specks inside the fill stay.
"""
import sys
from collections import deque
from PIL import Image, ImageFilter
import numpy as np

src, out_dir, preview_dir = sys.argv[1:4]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.int32)
h, w, _ = a.shape
white = (a[:, :, 0] >= 250) & (a[:, :, 1] >= 250) & (a[:, :, 2] >= 250)

# Connected components of pure white; drop components smaller than 60 px (texture specks).
label = np.zeros((h, w), dtype=np.int32)
background = np.zeros((h, w), dtype=bool)
next_label = 0
for y in range(h):
    for x in range(w):
        if not white[y, x] or label[y, x]:
            continue
        next_label += 1
        label[y, x] = next_label
        queue = deque([(y, x)])
        pixels = []
        while queue:
            cy, cx = queue.popleft()
            pixels.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = next_label
                    queue.append((ny, nx))
        if len(pixels) >= 60:
            ys, xs = zip(*pixels)
            background[list(ys), list(xs)] = True

alpha = np.where(background, 0, 255).astype(np.float64)
rgb = a.astype(np.float64)

# Soft edge: pixels touching the background are anti-aliased ink over white. Convert them with
# "color to alpha" against white so no light halo remains on a colored page.
bg_img = Image.fromarray((background * 255).astype(np.uint8))
near = np.asarray(bg_img.filter(ImageFilter.MaxFilter(5))) > 0
fringe = near & ~background
lum_min = rgb.min(axis=2)
neutral = (rgb.max(axis=2) - lum_min) < 24
edge = fringe & neutral & (lum_min < 250)
fa = (255.0 - lum_min) / 255.0
fa = np.clip(fa, 0.0, 1.0)
for c in range(3):
    channel = rgb[:, :, c]
    unmixed = np.where(fa > 0, (channel - (1 - fa) * 255.0) / np.maximum(fa, 1e-6), 0)
    rgb[:, :, c] = np.where(edge, np.clip(unmixed, 0, 255), channel)
alpha = np.where(edge, fa * 255.0, alpha)

rgba = np.dstack([rgb, alpha]).round().astype(np.uint8)
cut = Image.fromarray(rgba, 'RGBA')
bbox = cut.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
pad = 6
bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
cut = cut.crop(bbox)
print('trimmed size', cut.size, 'background px', int(background.sum()), 'edge px', int(edge.sum()))
cut.save(f'{out_dir}/larpbox-logo-full.png')

for width in (1040, 480):
    height = round(cut.height * width / cut.width)
    resized = cut.resize((width, height), Image.LANCZOS)
    resized.save(f'{out_dir}/larpbox-logo-{width}.webp', 'WEBP', quality=86, method=6)
    print('webp', width, height)

# Previews on the app's paper color and on dark ink, to check for halos.
for name, color in (('paper', (246, 243, 235)), ('ink', (23, 23, 23)), ('blue', (234, 240, 255))):
    bg = Image.new('RGBA', cut.size, color + (255,))
    bg.alpha_composite(cut)
    bg.convert('RGB').save(f'{preview_dir}/logo-on-{name}.png')
