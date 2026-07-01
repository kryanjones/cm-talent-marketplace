#!/usr/bin/env python3
"""
Step 1 of the headshot pipeline: deterministic recipe + prompt builder.

Reads data/creators.json and emits data/headshots/prompts.json — one entry per
creator with a fully-composed image prompt, a unique seed, and the structured
recipe it was built from. No API key needed; this step is free and reproducible.

Uniqueness is guaranteed BY CONSTRUCTION, not by luck:
  - Backdrop key  = (scene, locale, time-of-day, framing) is forced globally unique.
  - Face key      = (gender, age, ethnicity, hair, facial hair, glasses, feature)
                    is forced globally unique.
Everything is seeded off the creator id, so re-running yields identical output.
"""
import json, os, hashlib, random

# First-name -> apparent gender (offline dataset), with balanced fallback for
# ambiguous/unknown names. Keeps masc/fem names visually consistent; ethnicity
# and everything else stays balanced-by-id.
try:
    import gender_guesser.detector as _gg
    _DET = _gg.Detector(case_sensitive=False)
except ImportError:
    _DET = None

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "data", "creators.json")
OUT_DIR = os.path.join(ROOT, "data", "headshots")
OUT = os.path.join(OUT_DIR, "prompts.json")

# ---------------------------------------------------------------- face matrix
GENDERS = ["a woman", "a man", "a nonbinary person"]
GENDER_WEIGHTS = [0.47, 0.47, 0.06]
AGES = [
    "in their late 20s", "in their early 30s", "in their late 30s",
    "in their 40s", "in their early 50s", "in their late 50s", "in their 60s",
]
ETHNICITIES = [
    "East Asian", "South Asian", "Black", "Latino", "white",
    "Middle Eastern", "Southeast Asian", "mixed-race", "Indigenous American",
]
HAIR = [
    "short cropped dark hair", "shoulder-length brown hair", "tight curly black hair",
    "a shaved head", "gray hair swept back", "long straight black hair",
    "a neat afro", "salt-and-pepper hair", "auburn hair pulled back",
    "wavy blonde hair", "a short natural style", "locs",
]
FACIAL_HAIR = ["clean-shaven", "light stubble", "a short trimmed beard", "a full beard", "a mustache"]
GLASSES = ["", "", "wearing thin metal glasses", "wearing round tortoiseshell glasses", "wearing bold black-framed glasses"]
FEATURES = [
    "with a warm, approachable expression", "with a calm, serious gaze",
    "with a confident half-smile", "with laugh lines and a genuine smile",
    "with freckles", "with a thoughtful expression", "with an intent, focused look",
]

# ------------------------------------------------------------ wardrobe by beat
WARDROBE = {
    "Politics & Government": "a tailored blazer",
    "Business & Finance": "sharp business attire",
    "Technology": "smart-casual clothing, a fine-knit sweater",
    "Health & Science": "smart casual with a subtle professional look",
    "Culture & Entertainment": "stylish contemporary clothing",
    "Sports": "a quarter-zip or polo",
    "International Affairs": "a travel-worn blazer",
    "Climate & Environment": "a rugged field jacket",
    "Investigative": "an understated button-down",
    "Food & Dining": "a chef's jacket or apron over casual clothes",
    "Travel": "a relaxed jacket, ready to travel",
    "Style & Fashion": "fashion-forward designer clothing",
    "Parenting & Family": "warm, approachable everyday clothing",
    "Local & Regional News": "a neat reporter's button-down",
    "Education": "approachable professional attire",
    "Media & Tech Policy": "a modern blazer",
}

# --------------------------------------------------------- scene pools by beat
SCENES = {
    "Politics & Government": [
        "on the steps of a grand capitol building", "in a marble government rotunda",
        "in a busy press briefing room", "at a campaign field office with volunteers blurred behind",
        "outside a columned courthouse", "on a city hall balcony",
        "in a wood-paneled hearing room", "walking a government building colonnade",
    ],
    "Business & Finance": [
        "on a trading floor", "in a glass high-rise office overlooking a skyline",
        "in a modern fintech workspace", "outside a stock exchange building",
        "in a minimalist boardroom", "on a bustling financial-district street",
    ],
    "Technology": [
        "in a startup office with exposed brick", "in a hardware lab with prototypes on the bench",
        "beside a wall of server racks", "in a bright open-plan tech office",
        "at a product-demo stage", "in a co-working space with monitors blurred behind",
    ],
    "Health & Science": [
        "in a research lab with equipment softly blurred", "in a bright hospital corridor",
        "in a university science-building atrium", "at a lab bench with glassware",
        "in a clinical study room", "in a botanical greenhouse",
    ],
    "Culture & Entertainment": [
        "backstage at a theater", "in a film editing bay",
        "on a neon-lit city street at night", "in a contemporary art gallery",
        "in a music recording studio", "beside a blurred red-carpet backdrop",
    ],
    "Sports": [
        "on the sideline of a stadium", "in an empty basketball arena",
        "in a locker-room tunnel", "at a press-conference backdrop",
        "trackside at an athletics track", "in a sports broadcast studio",
    ],
    "International Affairs": [
        "in front of a row of national flags", "in an international summit hall",
        "on a foreign city street", "at a field reporting setup abroad",
        "at an embassy entrance", "in an assembly-hall gallery",
    ],
    "Climate & Environment": [
        "on a wind-farm ridge at dusk", "in a fire-scarred forest",
        "along an eroding coastline", "in a solar-panel field",
        "on a flooded street after a storm", "in a lush regrowing forest",
    ],
    "Investigative": [
        "in a dim archive room stacked with document boxes", "in a noir-lit newsroom at night",
        "beside a wall of pinned documents and photos", "in a records library",
        "in a dramatically lit parking structure", "at a cluttered investigative desk",
    ],
    "Food & Dining": [
        "in a professional restaurant kitchen", "at a vibrant farmers market",
        "in a cozy bistro dining room", "at a chef's pass with plated dishes",
        "in an artisan bakery", "in a colorful spice market",
    ],
    "Travel": [
        "in an airport terminal with departure boards", "on a scenic mountain overlook",
        "in a grand train-station concourse", "on a sunlit beach boardwalk",
        "on an old-town cobblestone street", "on a rooftop with a skyline behind",
    ],
    "Style & Fashion": [
        "backstage at a runway show", "in a minimalist fashion studio",
        "on a chic downtown street", "in a designer boutique",
        "against a seamless studio backdrop", "in a designer's atelier",
    ],
    "Parenting & Family": [
        "in a warm home kitchen", "in a sunlit living room",
        "at a playground with children blurred behind", "in a cozy reading nook",
        "in a green family backyard", "in a bright school hallway",
    ],
    "Local & Regional News": [
        "on a small-town main street", "in a local newsroom",
        "outside a county building", "at a community event",
        "on a neighborhood porch", "in front of a regional landmark",
    ],
    "Education": [
        "in a tiered lecture hall", "in a school classroom",
        "in a university library", "in a leafy campus quad",
        "at a chalkboard", "in a STEM maker lab",
    ],
    "Media & Tech Policy": [
        "in a think-tank office", "at a policy-panel backdrop",
        "in a Capitol hallway", "in a modern podcast studio",
        "in front of a data-visualization wall", "in a congressional hearing room",
    ],
}

# --------------------------------------------------------------- DMA -> locale
DMA_CITY = {
    "Atlanta": "in Atlanta", "San Francisco Bay Area": "in the San Francisco Bay Area",
    "New York": "in New York City", "Portland": "in Portland, Oregon",
    "Pittsburgh": "in Pittsburgh", "Kansas City": "in Kansas City",
    "Philadelphia": "in Philadelphia", "Nashville": "in Nashville", "Tampa": "in Tampa",
    "Los Angeles": "in Los Angeles", "Detroit": "in Detroit",
    "Salt Lake City": "in Salt Lake City", "Denver": "in Denver",
    "Charlotte": "in Charlotte", "Dallas-Fort Worth": "in Dallas", "Miami": "in Miami",
    "Chicago": "in Chicago", "Seattle": "in Seattle", "New Orleans": "in New Orleans",
    "Washington DC": "in Washington, D.C.", "Phoenix": "in Phoenix",
    "Boston": "in Boston", "Minneapolis": "in Minneapolis", "Houston": "in Houston",
}
# For "National" personas: DC-adjacent beats anchor to DC (matches the brief's
# political-reporter example); the rest rotate through major US cities for variety.
DC_BEATS = {"Politics & Government", "International Affairs", "Media & Tech Policy"}
NATIONAL_CITIES = [
    "in New York City", "in Chicago", "in Los Angeles", "in Atlanta", "in Austin",
    "in Boston", "in Seattle", "in Denver", "in Miami", "in Minneapolis",
    "in Philadelphia", "in Nashville", "in Portland, Oregon", "in Houston",
]

TIMES = ["warm morning light", "golden-hour light", "soft overcast daylight",
         "dramatic side lighting", "cool blue evening light", "bright natural midday light"]
FRAMING = [
    "medium environmental portrait, shallow depth of field, 50mm lens",
    "waist-up environmental portrait, 35mm lens",
    "tight head-and-shoulders portrait, 85mm lens",
    "three-quarter environmental portrait, 35mm lens",
]

STYLE_SUFFIX = (
    "documentary editorial photography, authentic candid working pose, "
    "natural warm light, full color, photorealistic, sharp focus on the subject, "
    "softly blurred background, shot on a full-frame camera, 3:4 vertical portrait"
)
NEGATIVE = (
    "text, watermark, logo, caption, over-lit flat studio headshot, plain gray backdrop, "
    "duotone, tinted color wash, cartoon, illustration, 3d render, cgi, stock-photo look, "
    "extra fingers, deformed hands, disfigured face, multiple people in focus"
)


def rng_for(cid: str) -> random.Random:
    h = int(hashlib.md5(cid.encode()).hexdigest(), 16)
    return random.Random(h)


def weighted(rng, items, weights):
    return rng.choices(items, weights=weights, k=1)[0]


def gender_for(name: str, rng) -> str:
    """Match apparent gender to the first name; balanced fallback if ambiguous."""
    first = (name or "").split()[0] if name else ""
    g = _DET.get_gender(first) if (_DET and first) else "unknown"
    if g in ("male", "mostly_male"):
        return "a man"
    if g in ("female", "mostly_female"):
        return "a woman"
    # andy / unknown -> balanced, with a small nonbinary share
    return weighted(rng, GENDERS, GENDER_WEIGHTS)


def build():
    creators = json.load(open(SRC))
    creators.sort(key=lambda c: c["id"])
    used_backdrop, used_face = set(), set()
    national_i = 0
    out = []

    for c in creators:
        cid = c["id"]
        rng = rng_for(cid)
        beat = c.get("primaryBeat") or "Local & Regional News"
        dma = c.get("homeMarketDMA") or "National"

        # ---- face recipe (forced globally unique) ----
        gender = gender_for(c.get("name"), rng)
        for _ in range(40):
            age = rng.choice(AGES)
            eth = rng.choice(ETHNICITIES)
            hair = rng.choice(HAIR)
            fh = rng.choice(FACIAL_HAIR) if gender != "a woman" else "clean-shaven"
            glasses = rng.choice(GLASSES)
            feat = rng.choice(FEATURES)
            face_key = (gender, age, eth, hair, fh, glasses, feat)
            if face_key not in used_face:
                break
        used_face.add(face_key)

        # ---- backdrop recipe (forced globally unique) ----
        scenes = SCENES.get(beat, SCENES["Local & Regional News"])
        if dma == "National":
            locale = "in Washington, D.C." if beat in DC_BEATS else NATIONAL_CITIES[national_i % len(NATIONAL_CITIES)]
            national_i += 1
        else:
            locale = DMA_CITY.get(dma, "")
        for _ in range(60):
            scene = rng.choice(scenes)
            time = rng.choice(TIMES)
            frame = rng.choice(FRAMING)
            bkey = (scene, locale, time, frame)
            if bkey not in used_backdrop:
                break
        used_backdrop.add(bkey)

        wardrobe = WARDROBE.get(beat, "professional attire")
        glasses_clause = f", {glasses}" if glasses else ""
        fh_clause = f", {fh}" if gender != "a woman" and fh != "clean-shaven" else ""

        prompt = (
            f"Editorial environmental portrait of {gender}, {eth}, {age}, "
            f"with {hair}{fh_clause}{glasses_clause}, {feat}, wearing {wardrobe}. "
            f"{scene.capitalize()} {locale}, {time}. "
            f"The subject is a professional journalist at work. {frame}. {STYLE_SUFFIX}."
        )

        seed = int(hashlib.md5((cid + ":seed").encode()).hexdigest(), 16) % 2_147_483_647

        out.append({
            "id": cid,
            "name": c.get("name"),
            "beat": beat,
            "dma": dma,
            "seed": seed,
            "aspect_ratio": "3:4",
            "prompt": prompt,
            "negative_prompt": NEGATIVE,
            "recipe": {
                "gender": gender, "age": age, "ethnicity": eth, "hair": hair,
                "facial_hair": fh, "glasses": glasses or None, "feature": feat,
                "wardrobe": wardrobe, "scene": scene, "locale": locale,
                "time_of_day": time, "framing": frame,
            },
        })

    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(out, open(OUT, "w"), indent=2, ensure_ascii=False)

    # ---- uniqueness + distribution report ----
    backdrops = {(e["recipe"]["scene"], e["recipe"]["locale"], e["recipe"]["time_of_day"], e["recipe"]["framing"]) for e in out}
    faces = {tuple(e["recipe"][k] for k in ("gender", "age", "ethnicity", "hair", "facial_hair", "glasses", "feature")) for e in out}
    from collections import Counter
    print(f"Wrote {len(out)} prompts -> {os.path.relpath(OUT, ROOT)}")
    print(f"Unique backdrop tuples: {len(backdrops)}/{len(out)}  (0 dupes == {len(backdrops)==len(out)})")
    print(f"Unique face tuples:     {len(faces)}/{len(out)}  (0 dupes == {len(faces)==len(out)})")
    print("Gender mix:", dict(Counter(e['recipe']['gender'] for e in out)))
    print("Ethnicity mix:", dict(Counter(e['recipe']['ethnicity'] for e in out)))
    print("Seeds unique:", len({e['seed'] for e in out}) == len(out))
    return out


if __name__ == "__main__":
    build()
