# Headshot generation pipeline

Batch-generates a unique, beat-matched AI headshot for every persona and loads
them into Airtable. Uniqueness (no duplicate backdrops, no duplicate faces) is
guaranteed at the prompt stage and verified again after generation.

```
data/headshots/
  prompts.json     ← step 1 output (recipes + prompts, committed)
  out/             ← step 2 output (raw generations)
  final/           ← step 3b output (3:4, web-sized)
```

## Prerequisites
- An API key for ONE provider: `fal` (default), `replicate`, `openai`, or `gemini`.
- Python deps for the local steps:
  ```
  python3 -m pip install --break-system-packages pillow imagehash
  # optional but recommended (best face-duplicate detection + face-aware crop):
  python3 -m pip install --break-system-packages numpy opencv-python insightface onnxruntime
  ```

## Steps

**1. Build prompts** (free, no key, already run):
```
python3 scripts/headshots/build_prompts.py
```
Deterministic; re-run any time. Guarantees unique backdrops + faces.

**2. Smoke-test 5 images**, inspect `data/headshots/out/`, then run the rest:
```
PROVIDER=fal FAL_KEY=xxx python3 scripts/headshots/generate.py --limit 5
PROVIDER=fal FAL_KEY=xxx python3 scripts/headshots/generate.py            # the rest (resumable)
```

**3a. Dedup / QA** — flags near-identical backdrops and same-looking faces:
```
python3 scripts/headshots/dedup.py
# re-roll any flagged ids:
python3 scripts/headshots/generate.py --ids CR-012,CR-119
```
(To force a materially different result for a flagged id, bump its `seed` in
`prompts.json` before re-rolling.)

**3b. Crop + resize** to 3:4 / 800×1067:
```
python3 scripts/headshots/postprocess.py
```

**4. Publish** — pick one:
```
# A) Airtable attachment (no external hosting). First change the Headshot
#    field type to "Attachment" in the Airtable UI, then:
python3 scripts/headshots/upload.py --dest airtable

# B) Serve from the app and set Headshot to a site-relative URL:
python3 scripts/headshots/upload.py --dest public --set-airtable-url
```

## Cost / time
~200 images × ~1.3 avg attempts ≈ ~260 generations. At ~$0.04/image ≈ **$8–12**
(FLUX 1.1 pro / Imagen 4). A few minutes with concurrency=4.

## Knobs
- **Name↔gender matching:** faces are assigned from a balanced diversity matrix
  keyed by creator id, NOT inferred from names (name inference is biased/unreliable).
  Edit the face-assignment block in `build_prompts.py` to change this.
- **Scene pools / city map / lighting:** all in `build_prompts.py` dictionaries.
- **Dedup strictness:** `PHASH_MAX_DISTANCE` and `FACE_MIN_COSINE` in `dedup.py`.
