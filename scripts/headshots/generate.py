#!/usr/bin/env python3
"""
Step 2 of the headshot pipeline: generate images from data/headshots/prompts.json.

Provider-pluggable and dependency-light (standard library only). Resumable:
already-generated files are skipped, so you can smoke-test a few, inspect, then
run the rest. Images are saved to data/headshots/out/{id}.<ext>.

Usage:
  PROVIDER=fal FAL_KEY=...            python3 scripts/headshots/generate.py --limit 5
  PROVIDER=replicate REPLICATE_API_TOKEN=... python3 scripts/headshots/generate.py
  PROVIDER=openai OPENAI_API_KEY=...  python3 scripts/headshots/generate.py
  PROVIDER=gemini GEMINI_API_KEY=...  python3 scripts/headshots/generate.py

Flags:
  --limit N     only generate the first N missing (smoke test)
  --ids a,b,c   only these creator ids (re-rolls after dedup)
  --concurrency N   parallel requests (default 4)
"""
import os, sys, json, base64, argparse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROMPTS = os.path.join(ROOT, "data", "headshots", "prompts.json")
OUT_DIR = os.path.join(ROOT, "data", "headshots", "out")

PROVIDER = os.environ.get("PROVIDER", "fal").lower()


def _post(url, headers, payload, timeout=180):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={**headers, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def _download(url, timeout=120) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


# ------------------------------------------------------------ provider adapters
# Each returns (image_bytes, ext).

def gen_fal(entry):
    key = os.environ["FAL_KEY"]
    res = _post(
        "https://fal.run/fal-ai/flux-pro/v1.1",
        {"Authorization": f"Key {key}"},
        {"prompt": entry["prompt"], "image_size": "portrait_4_3",
         "seed": entry["seed"], "num_images": 1, "output_format": "jpeg",
         "safety_tolerance": "2"},
    )
    return _download(res["images"][0]["url"]), "jpg"


def gen_replicate(entry):
    token = os.environ["REPLICATE_API_TOKEN"]
    res = _post(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions",
        {"Authorization": f"Bearer {token}", "Prefer": "wait"},
        {"input": {"prompt": entry["prompt"], "aspect_ratio": "3:4",
                   "seed": entry["seed"], "output_format": "jpg", "safety_tolerance": 2}},
    )
    out = res.get("output")
    url = out[0] if isinstance(out, list) else out
    return _download(url), "jpg"


def gen_openai(entry):
    key = os.environ["OPENAI_API_KEY"]
    res = _post(
        "https://api.openai.com/v1/images/generations",
        {"Authorization": f"Bearer {key}"},
        {"model": "gpt-image-1", "prompt": entry["prompt"],
         "size": "1024x1536", "quality": "medium", "n": 1},
    )
    return base64.b64decode(res["data"][0]["b64_json"]), "png"


def gen_gemini(entry):
    key = os.environ["GEMINI_API_KEY"]
    res = _post(
        f"https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key={key}",
        {},
        {"instances": [{"prompt": entry["prompt"]}],
         "parameters": {"sampleCount": 1, "aspectRatio": "3:4",
                        "negativePrompt": entry.get("negative_prompt", "")}},
    )
    b64 = res["predictions"][0]["bytesBase64Encoded"]
    return base64.b64decode(b64), "png"


ADAPTERS = {"fal": gen_fal, "replicate": gen_replicate, "openai": gen_openai, "gemini": gen_gemini}


def already_done(cid):
    for ext in ("jpg", "png"):
        if os.path.exists(os.path.join(OUT_DIR, f"{cid}.{ext}")):
            return True
    return False


def run_one(entry, adapter):
    cid = entry["id"]
    last = None
    for attempt in range(3):
        try:
            img, ext = adapter(entry)
            path = os.path.join(OUT_DIR, f"{cid}.{ext}")
            with open(path, "wb") as f:
                f.write(img)
            return cid, True, os.path.getsize(path)
        except Exception as e:  # noqa
            last = e
    return cid, False, str(last)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ids", type=str, default="")
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()

    if PROVIDER not in ADAPTERS:
        sys.exit(f"Unknown PROVIDER={PROVIDER}. Choose: {', '.join(ADAPTERS)}")
    adapter = ADAPTERS[PROVIDER]
    os.makedirs(OUT_DIR, exist_ok=True)
    entries = json.load(open(PROMPTS))

    if args.ids:
        wanted = set(args.ids.split(","))
        entries = [e for e in entries if e["id"] in wanted]
    else:
        entries = [e for e in entries if not already_done(e["id"])]
    if args.limit:
        entries = entries[: args.limit]

    print(f"Provider={PROVIDER} | to generate: {len(entries)} | concurrency={args.concurrency}")
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = [ex.submit(run_one, e, adapter) for e in entries]
        for fut in as_completed(futs):
            cid, success, info = fut.result()
            if success:
                ok += 1
                print(f"  ✓ {cid} ({info} bytes)")
            else:
                fail += 1
                print(f"  ✗ {cid} -> {info}")
    print(f"Done. ok={ok} fail={fail}. Images in {os.path.relpath(OUT_DIR, ROOT)}")


if __name__ == "__main__":
    main()
