"""Chroma-key the ATTACK CAR green screen -> a transparent, web-sized sprite.

Removes the green background, despills the green fringe on edges, crops to the
car, and downsizes to a sprite we can drive across the Leaflet map.
Output: public/attack-car.png
"""
from PIL import Image

SRC = "ATTACK CAR 1.png"
OUT = "public/attack-car.png"

img = Image.open(SRC).convert("RGBA")
px = img.load()
w, h = img.size

def is_green(r, g, b):
    # chroma-key green: green clearly dominant over red & blue
    return g > 90 and g > r * 1.25 and g > b * 1.25

for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if is_green(r, g, b):
            px[x, y] = (0, 0, 0, 0)
        elif g > r and g > b:
            # despill: pull the green fringe toward the red/blue average so
            # edges don't keep a green halo
            avg = (r + b) // 2
            px[x, y] = (r, min(g, avg + 12), b, a)

# Crop to the visible car (bounding box of non-transparent pixels)
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

# Downsize to a sprite. ~520px wide is crisp on retina, displays ~130-180px.
target_w = 520
scale = target_w / img.width
img = img.resize((target_w, round(img.height * scale)), Image.LANCZOS)

img.save(OUT)
print(f"saved {OUT} {img.size}")
