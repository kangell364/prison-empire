"""GNOME 16 — clown turnaround on green, with a RAINBOW AFRO (green tufts).
A loose green-key would hole the hair, so key only colors CLOSE to the actual
background green (sampled from the corners). Then isolate the first figure.
Output: public/gnome-16.webp
"""
import numpy as np
from PIL import Image

SRC = "GNOME 16.png"
OUT = "public/gnome-16.webp"
TOL = 55          # RGB distance from the sampled bg green to treat as background

im = Image.open(SRC).convert("RGBA")
a = np.asarray(im).astype(np.int16)
h, w, _ = a.shape
rgb = a[:, :, :3]

# Sample the background green from the four corners (robust median).
patches = np.concatenate([
    rgb[:40, :40].reshape(-1, 3), rgb[:40, -40:].reshape(-1, 3),
    rgb[-40:, :40].reshape(-1, 3), rgb[-40:, -40:].reshape(-1, 3),
])
bg = np.median(patches, axis=0)
print("bg green:", bg.tolist())

dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
mask = dist < TOL                      # True = background
a[:, :, 3][mask] = 0                    # punch transparent

# Light green despill on the kept fringe.
keep = ~mask
g_dom = (rgb[:, :, 1] > rgb[:, :, 0]) & (rgb[:, :, 1] > rgb[:, :, 2]) & keep
avg = ((rgb[:, :, 0] + rgb[:, :, 2]) // 2)
a[:, :, 1] = np.where(g_dom, np.minimum(a[:, :, 1], avg + 14), a[:, :, 1])

out = np.clip(a, 0, 255).astype(np.uint8)
alpha = out[:, :, 3]

# Isolate the FIRST (leftmost) figure: cluster columns that have opaque pixels.
col = (alpha > 0).sum(axis=0)
thr = max(4, int(h * 0.01))
runs, start = [], None
for x in range(w):
    if col[x] > thr and start is None:
        start = x
    elif col[x] <= thr and start is not None:
        if x - start > w * 0.04:
            runs.append((start, x))
        start = None
if start is not None:
    runs.append((start, w))
x0, x1 = runs[0]
pad = int((x1 - x0) * 0.04)
fig = Image.fromarray(out).crop((max(0, x0 - pad), 0, min(w, x1 + pad), h))

bbox = fig.getbbox()
if bbox:
    fig = fig.crop(bbox)
tw = 360
fig = fig.resize((tw, round(fig.height * tw / fig.width)), Image.LANCZOS)
fig.save(OUT, "WEBP", quality=90, method=6)
print(f"saved {OUT} {fig.size} (from {len(runs)} figures)")
