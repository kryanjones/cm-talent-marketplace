#!/usr/bin/env python3
"""
Step 3a of the headshot pipeline: QA + duplicate detection.

Scans data/headshots/out/*, and flags:
  - near-identical images / backdrops (perceptual hash; always available)
  - same-looking faces (face embeddings via InsightFace, if installed)

Prints a list of creator ids to re-roll. Feed them back to generate.py:
    python3 scripts/headshots/generate.py --ids id1,id2,id3
(generate.py overwrites, and each id keeps its unique seed — bump the seed in
prompts.json for a flagged id if you want a materially different result.)

Light deps:   pip install pillow imagehash
Face dedup:   pip install insightface onnxruntime   (optional but recommended)
"""
import os, json, argparse, itertools

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "data", "headshots", "out")

# thresholds (tune as needed)
PHASH_MAX_DISTANCE = 6      # <= this Hamming distance == near-identical image
# Calibrated on this set: mean pairwise cosine ~0.26; even the single closest
# pair (0.74) is visibly two different people (same demographic + editorial
# framing inflates scores). ArcFace "same identity" only becomes convincing well
# above this. 0.78 flags genuine near-clones without false-positiving lookalikes.
FACE_MIN_COSINE = 0.78


def list_images():
    files = []
    for fn in sorted(os.listdir(OUT_DIR)):
        if fn.lower().endswith((".jpg", ".jpeg", ".png")):
            files.append((os.path.splitext(fn)[0], os.path.join(OUT_DIR, fn)))
    return files


def phash_pass(files):
    try:
        from PIL import Image
        import imagehash
    except ImportError:
        print("[phash] skipped — run: pip install pillow imagehash")
        return set()
    hashes = {cid: imagehash.phash(Image.open(p).convert("RGB")) for cid, p in files}
    flagged = set()
    for (a, ha), (b, hb) in itertools.combinations(hashes.items(), 2):
        if (ha - hb) <= PHASH_MAX_DISTANCE:
            print(f"[phash] near-identical: {a} ~ {b} (dist={ha - hb})")
            flagged.add(b)  # re-roll the second of the pair
    return flagged


def face_pass(files):
    try:
        import numpy as np
        from insightface.app import FaceAnalysis
    except ImportError:
        print("[face] skipped — run: pip install insightface onnxruntime  (recommended)")
        return set()
    app = FaceAnalysis(name="buffalo_l")
    app.prepare(ctx_id=-1, det_size=(640, 640))
    embs = {}
    for cid, p in files:
        import cv2
        img = cv2.imread(p)
        faces = app.get(img)
        if not faces:
            print(f"[face] NO FACE detected: {cid} (re-roll)")
            embs[cid] = None
            continue
        f = max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
        e = f.normed_embedding
        embs[cid] = e
    flagged = {cid for cid, e in embs.items() if e is None}
    valid = {cid: e for cid, e in embs.items() if e is not None}
    for (a, ea), (b, eb) in itertools.combinations(valid.items(), 2):
        cos = float(np.dot(ea, eb))
        if cos >= FACE_MIN_COSINE:
            print(f"[face] same-looking: {a} ~ {b} (cos={cos:.2f})")
            flagged.add(b)
    return flagged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-face", action="store_true", help="skip face embedding pass")
    args = ap.parse_args()
    files = list_images()
    print(f"Scanning {len(files)} images in {os.path.relpath(OUT_DIR, ROOT)}")
    flagged = set()
    flagged |= phash_pass(files)
    if not args.no_face:
        flagged |= face_pass(files)
    print("\n=== RE-ROLL LIST ===")
    if flagged:
        print(",".join(sorted(flagged)))
        print(f"\n{len(flagged)} to re-roll. Then:")
        print(f"  python3 scripts/headshots/generate.py --ids {','.join(sorted(flagged))}")
    else:
        print("None — all images are unique and every image has a detectable face. ✅")


if __name__ == "__main__":
    main()
