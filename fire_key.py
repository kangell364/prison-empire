#!/usr/bin/env python3
# Edit the image-to-video fire clip into a reusable "fire on black" burn element:
# key out everything but the flames (warmth + brightness mask), trim to the
# rise+engulf (drop the slow recede where the card reappears), downscale, and
# encode a compact MP4. Used by CardBurn via <video> + mix-blend-mode:screen,
# which works on every browser (incl. iOS/Safari) with no alpha-video needed.
import cv2, numpy as np, imageio_ffmpeg, subprocess, os

SRC = 'Image to video 丨 only fire coming up from the bottom of the picture until it com.mp4'
OUT = 'public/fire-burn.mp4'
W, H = 360, 720
F0, F1, STEP = 22, 116, 2          # rise→engulf window, every other frame ≈ 2× speed (~1.5s)

def key_fire(f):
    b, r = f[:, :, 0].astype(int), f[:, :, 2].astype(int)
    bright = f.max(2).astype(int)
    warm = r - b                                   # fire = warm (high R, low B)
    mask = ((warm > 40) & (bright > 100)).astype(np.float32)
    mask = cv2.GaussianBlur(mask, (7, 7), 0)
    mask = np.clip(mask * 1.15, 0, 1)[..., None]   # tighten edges
    return (f.astype(np.float32) * mask).astype(np.uint8)

v = cv2.VideoCapture(SRC)
frames = []
for i in range(F0, F1, STEP):
    v.set(cv2.CAP_PROP_POS_FRAMES, i)
    ok, f = v.read()
    if not ok: break
    frames.append(cv2.cvtColor(cv2.resize(key_fire(f), (W, H)), cv2.COLOR_BGR2RGB))
v.release()

ff = imageio_ffmpeg.get_ffmpeg_exe()
tmp = '_fire_raw.mp4'
wr = imageio_ffmpeg.write_frames(tmp, (W, H), fps=30, codec='libx264',
                                 macro_block_size=8, quality=7)
wr.send(None)
for fr in frames:
    wr.send(np.ascontiguousarray(fr))
wr.close()

# re-encode web-friendly (yuv420p, faststart) and shrink
subprocess.run([ff, '-y', '-i', tmp, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart', '-crf', '30', '-an', OUT],
               check=True, capture_output=True)
os.remove(tmp)
print(f'wrote {OUT}  frames={len(frames)}  {os.path.getsize(OUT)//1024} KB')
