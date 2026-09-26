"""Favicons and the home-screen icon from the logo's TV box.

Usage: python3 scripts/brand-favicon.py <out_dir>/larpbox-logo-full.png <out_dir>
Copy favicon-32.png, favicon-64.png and apple-touch-icon.png to apps/web/public/.
"""
import sys
from PIL import Image
full = Image.open(sys.argv[1]).convert('RGBA')
out = sys.argv[2]
w, h = full.size
# The TV box (with antennae) is the right-most element of the trimmed logo.
alpha = full.getchannel('A')
# Find the TV region: columns right of the "X", rows from the antennae to the bottom.
box = (int(w * 0.785), int(h * 0.33), w, h)
tv = full.crop(box)
bbox = tv.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
tv = tv.crop(bbox)
side = max(tv.size)
square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
square.alpha_composite(tv, ((side - tv.width) // 2, (side - tv.height) // 2))
square.save(f'{out}/tv-square.png')
for size in (32, 64):
    square.resize((size, size), Image.LANCZOS).save(f'{out}/favicon-{size}.png')
# Apple touch icon: opaque paper background with padding (iOS fills transparency with black).
touch = Image.new('RGBA', (180, 180), (246, 243, 235, 255))
inner = square.resize((148, 148), Image.LANCZOS)
touch.alpha_composite(inner, (16, 16))
touch.convert('RGB').save(f'{out}/apple-touch-icon.png')
print('tv crop', tv.size)
