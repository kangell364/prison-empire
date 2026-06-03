#!/usr/bin/env python3
"""Optimize card/boss art to the player-card pipeline.

The player cards in public/ are ~720px-wide JPGs (~60 KB). Raw art exports
(e.g. the "GAURD BOSS N.png" files) are multi-megabyte PNGs — ~130x heavier —
which makes the Fight screen crawl. This script crushes any source image down
to the same shape so a boss tile loads as light as a player card.

Usage:
    # one or more source images -> optimized JPGs in public/
    python3 scripts/optimize-art.py "GAURD BOSS 4.png" public/guard-boss-4.jpg
    python3 scripts/optimize-art.py "ART.png"            # -> public/art.jpg

Then point the card's `avatar` at the new /public path (e.g. in
src/data/bossLadder.js for bosses, or gameData.js for player cards).
"""
import sys
import os
from PIL import Image

TARGET_W = 720   # matches the existing player-card art width
QUALITY  = 82    # visually lossless at tile/hero size; lands ~50-70 KB


def optimize(src, dst=None):
    if dst is None:
        base = os.path.splitext(os.path.basename(src))[0]
        slug = base.strip().lower().replace(' ', '-')
        dst = os.path.join('public', f'{slug}.jpg')
    im = Image.open(src).convert('RGB')
    w, h = im.size
    if w > TARGET_W:
        im = im.resize((TARGET_W, round(h * TARGET_W / w)), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print(f'{src} ({w}x{h}) -> {dst} ({im.size[0]}x{im.size[1]}, {os.path.getsize(dst)//1024} KB)')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    # Forms: (src), (src dst), or many srcs.
    if len(args) == 2 and not args[1].lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        optimize(args[0], args[1])
    elif len(args) == 2 and args[1].startswith('public/'):
        optimize(args[0], args[1])
    else:
        for src in args:
            optimize(src)
