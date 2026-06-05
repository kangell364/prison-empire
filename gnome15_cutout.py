"""GNOME 14 is a 4-pose turnaround on green. Key the green, isolate the FIRST
(left, front-facing) figure, and export a single transparent customer sprite
matching the other gnomes (~360px wide). Output: public/gnome-15.webp
"""
from PIL import Image

SRC = "GNOME 15.png"
OUT = "public/gnome-15.webp"

img = Image.open(SRC).convert("RGBA")
px = img.load()
w, h = img.size

def is_green(r, g, b):
    return g > 110 and g > r * 1.25 and g > b * 1.25

# 1) chroma-key the green background -> transparent (+ light despill)
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if is_green(r, g, b):
            px[x, y] = (0, 0, 0, 0)
        elif g > r and g > b:
            avg = (r + b) // 2
            px[x, y] = (r, min(g, avg + 12), b, a)

# 2) find the four figure clusters by per-column opaque-pixel count
col = [0] * w
for x in range(w):
    c = 0
    for y in range(0, h, 3):            # sample every 3rd row for speed
        if px[x, y][3] > 0:
            c += 1
    col[x] = c

thresh = 4
runs = []
start = None
for x in range(w):
    if col[x] > thresh and start is None:
        start = x
    elif col[x] <= thresh and start is not None:
        if x - start > w * 0.04:        # ignore tiny specks
            runs.append((start, x))
        start = None
if start is not None:
    runs.append((start, w))

if not runs:
    raise SystemExit("no figure found")
x0, x1 = runs[0]                          # FIRST (leftmost, front-facing) figure
pad = int((x1 - x0) * 0.04)
fig = img.crop((max(0, x0 - pad), 0, min(w, x1 + pad), h))

# 3) tight-crop to the figure, resize to ~360px wide (match the other gnomes)
bbox = fig.getbbox()
if bbox:
    fig = fig.crop(bbox)
target_w = 360
fig = fig.resize((target_w, round(fig.height * target_w / fig.width)), Image.LANCZOS)
fig.save(OUT, "WEBP", quality=90, method=6)
print(f"saved {OUT} {fig.size} (from {len(runs)} figures)")
