#!/usr/bin/env python3
"""
Step 3b: crop every generated image to a clean 3:4 portrait and downscale for web.
Reads data/headshots/out/*, writes data/headshots/final/{id}.jpg (800x1067).

Center-crop by default; face-aware crop if opencv is available (keeps the face
off the very top/bottom). Deps: pip install pillow  (opencv-python optional).
"""
import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "data", "headshots", "out")
FINAL_DIR = os.path.join(ROOT, "data", "headshots", "final")
TARGET_W, TARGET_H = 800, 1067  # 3:4

def face_center(path):
    try:
        import cv2
        img = cv2.imread(path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = cascade.detectMultiScale(gray, 1.1, 5)
        if len(faces):
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            return (x + w / 2, y + h / 2)
    except Exception:
        pass
    return None

def main():
    from PIL import Image
    os.makedirs(FINAL_DIR, exist_ok=True)
    n = 0
    for fn in sorted(os.listdir(OUT_DIR)):
        if not fn.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        cid = os.path.splitext(fn)[0]
        src = os.path.join(OUT_DIR, fn)
        im = Image.open(src).convert("RGB")
        w, h = im.size
        target_ratio = TARGET_W / TARGET_H
        # crop to 3:4
        if w / h > target_ratio:
            new_w = int(h * target_ratio); x0 = (w - new_w) // 2
            box = (x0, 0, x0 + new_w, h)
        else:
            new_h = int(w / target_ratio)
            fc = face_center(src)
            cy = fc[1] if fc else h * 0.42  # bias slightly above center for headroom
            y0 = int(max(0, min(h - new_h, cy - new_h * 0.45)))
            box = (0, y0, w, y0 + new_h)
        im = im.crop(box).resize((TARGET_W, TARGET_H), Image.LANCZOS)
        im.save(os.path.join(FINAL_DIR, f"{cid}.jpg"), "JPEG", quality=88)
        n += 1
    print(f"Processed {n} -> {os.path.relpath(FINAL_DIR, ROOT)} ({TARGET_W}x{TARGET_H})")

if __name__ == "__main__":
    main()
