#!/usr/bin/env python3
"""
Step 4: publish the finished headshots.

Two destinations:

  --dest public
      Copies data/headshots/final/* into public/headshots/ and (optionally)
      sets each creator's Headshot cell to "/headshots/{id}.jpg". Works today
      because Headshot is a URL/text field. Simplest for local + Vercel.

  --dest airtable
      Uploads the image bytes straight into the Headshot ATTACHMENT field via
      Airtable's content upload API — no external hosting needed. Prerequisite:
      change the Headshot field type to "Attachment" in the Airtable UI first
      (the token can't change field types). The app already reads attachments.

Reads AIRTABLE_API_KEY / AIRTABLE_BASE_ID from .env.local.
"""
import os, sys, json, base64, shutil, argparse, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FINAL_DIR = os.path.join(ROOT, "data", "headshots", "final")

def load_env():
    env = {}
    p = os.path.join(ROOT, ".env.local")
    for line in open(p):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env

def finals():
    return [(os.path.splitext(f)[0], os.path.join(FINAL_DIR, f))
            for f in sorted(os.listdir(FINAL_DIR)) if f.endswith(".jpg")]

def airtable_get_all(base, key, table):
    recs, offset = [], None
    while True:
        q = {"pageSize": "100"}
        if offset: q["offset"] = offset
        url = f"https://api.airtable.com/v0/{base}/{urllib.parse.quote(table)}?" + urllib.parse.urlencode(q)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        d = json.load(urllib.request.urlopen(req))
        recs += d["records"]; offset = d.get("offset")
        if not offset: break
    return recs

def patch(base, key, table, rec_id, fields):
    url = f"https://api.airtable.com/v0/{base}/{urllib.parse.quote(table)}/{rec_id}"
    body = json.dumps({"fields": fields}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

def upload_attachment(base, key, rec_id, field, path):
    # Airtable content API: push bytes directly into an attachment field.
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    url = f"https://content.airtable.com/v0/{base}/{rec_id}/{urllib.parse.quote(field)}/uploadAttachment"
    body = json.dumps({"contentType": "image/jpeg", "file": b64,
                       "filename": os.path.basename(path)}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", choices=["public", "airtable"], required=True)
    ap.add_argument("--set-airtable-url", action="store_true",
                    help="(public dest) also set Headshot to /headshots/{id}.jpg")
    ap.add_argument("--field", default="Headshot")
    args = ap.parse_args()
    items = finals()
    if not items:
        sys.exit("No finished images in data/headshots/final — run postprocess.py first.")

    if args.dest == "public":
        dst = os.path.join(ROOT, "public", "headshots")
        os.makedirs(dst, exist_ok=True)
        for cid, path in items:
            shutil.copy(path, os.path.join(dst, f"{cid}.jpg"))
        print(f"Copied {len(items)} -> public/headshots/")
        if args.set_airtable_url:
            env = load_env(); base, key = env["AIRTABLE_BASE_ID"], env["AIRTABLE_API_KEY"]
            recs = airtable_get_all(base, key, "Creators")
            by_cid = {(r["fields"].get("Creator ID") or r["id"]): r["id"] for r in recs}
            for cid, _ in items:
                rid = by_cid.get(cid)
                if rid:
                    patch(base, key, "Creators", rid, {args.field: f"/headshots/{cid}.jpg"})
            print("Set Headshot cells to /headshots/{id}.jpg")
        return

    # airtable attachment upload
    env = load_env(); base, key = env["AIRTABLE_BASE_ID"], env["AIRTABLE_API_KEY"]
    recs = airtable_get_all(base, key, "Creators")
    by_cid = {(r["fields"].get("Creator ID") or r["id"]): r["id"] for r in recs}
    ok = miss = 0
    for cid, path in items:
        rid = by_cid.get(cid)
        if not rid:
            miss += 1; print(f"  ? no record for {cid}"); continue
        upload_attachment(base, key, rid, args.field, path)
        ok += 1; print(f"  ✓ {cid}")
    print(f"Uploaded {ok} attachments (missing {miss}). Field must be type Attachment.")

if __name__ == "__main__":
    main()
