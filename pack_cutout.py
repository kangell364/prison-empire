"""5 CARD PACK front + back — chroma-green cutout for the spin-open animation.
The packs sit on a flat lime-green background, but the art INSIDE has teal/green
elements (the OUTCAST skull), so a plain color key would eat them. Instead we
flood-fill the green from the borders and only drop the connected background
region, leaving interior art intact. Output: transparent webp for public/.
"""
from collections import deque
import numpy as np
from PIL import Image

JOBS = [
    ("5 CARD PACK FRONT.png", "public/pack-front.webp"),
    ("5 CARD PACK BACK.png",  "public/pack-back.webp"),
]
TARGET_W = 640     # working + output width (packs are tall portraits)
TOL      = 78      # color distance from bg green that still counts as background

for src, out in JOBS:
    im = Image.open(src).convert("RGBA")
    # Downscale to the output size first so the border flood-fill is fast.
    h = round(im.height * TARGET_W / im.width)
    im = im.resize((TARGET_W, h), Image.LANCZOS)
    a = np.asarray(im).astype(np.int16)
    rgb = a[:, :, :3]
    H, W = h, TARGET_W

    # Background green = median of the four corners.
    corners = np.concatenate([
        rgb[:40, :40].reshape(-1, 3), rgb[:40, -40:].reshape(-1, 3),
        rgb[-40:, :40].reshape(-1, 3), rgb[-40:, -40:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    green = dist < TOL                              # color-keyed candidates

    # Flood-fill from every green border pixel — only background connected to the
    # edge gets removed; interior teal art (not edge-connected) is kept.
    bgmask = np.zeros((H, W), dtype=bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if green[y, x] and not bgmask[y, x]:
                bgmask[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if green[y, x] and not bgmask[y, x]:
                bgmask[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and green[ny, nx] and not bgmask[ny, nx]:
                bgmask[ny, nx] = True; dq.append((ny, nx))

    a[:, :, 3][bgmask] = 0

    # De-fringe: dampen residual green spill on kept pixels near the cut edge.
    keep = ~bgmask
    g_dom = (rgb[:, :, 1] > rgb[:, :, 0]) & (rgb[:, :, 1] > rgb[:, :, 2]) & keep
    avg = (rgb[:, :, 0] + rgb[:, :, 2]) // 2
    a[:, :, 1] = np.where(g_dom, np.minimum(a[:, :, 1], avg + 18), a[:, :, 1])

    o = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    bbox = o.getbbox()
    if bbox:
        o = o.crop(bbox)
    o.save(out, "WEBP", quality=90, method=6)
    print(f"saved {out} {o.size}")
