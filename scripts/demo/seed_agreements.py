#!/usr/bin/env python3
"""
Seed master-agreement status across the fictional demo personas.

The agency model means a creator can only be sold once a signed master
representation agreement is on file. For the demo we want that to look like a
real roster: most creators cleared, a handful mid-signature, a few untouched,
one or two declined — so the distinction is visible rather than theoretical.

SAFETY: only ever writes to records with `Is Demo Persona` checked. Real talent
onboarded later carries its actual agreement status and this script will skip
them, no matter how often it is run.

Deterministic: status and signed date are derived from the Creator ID, so
re-running produces the same roster rather than reshuffling it.

Usage:
    python3 scripts/demo/seed_agreements.py            # apply
    python3 scripts/demo/seed_agreements.py --dry-run  # show the split only
"""
import os
import sys
import json
import time
import hashlib
import argparse
import datetime
import urllib.request
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Roughly a real agency roster: most cleared, a small visible tail that is not.
# Proportions are applied as exact counts rather than per-record probability —
# at 200 records a hash-bucketed draw swings several points either way, which
# put "Declined" at 4% in one run. Exact slicing keeps the demo predictable.
SIGNED_SHARE = 0.89
SENT_SHARE = 0.06      # out for signature
NOT_SENT_SHARE = 0.035
# remainder -> "Declined"


def load_env():
    env = {}
    for line in open(os.path.join(ROOT, ".env.local")):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def rank(creator_id: str) -> int:
    """Stable shuffle key, so the same creators land in the same buckets."""
    return int(hashlib.md5(f"agreement:{creator_id}".encode()).hexdigest(), 16)


def assign_statuses(creator_ids: list[str]) -> dict[str, str]:
    """Exact counts, assigned by a deterministic shuffle of the ids."""
    order = sorted(creator_ids, key=rank)
    total = len(order)
    n_signed = round(total * SIGNED_SHARE)
    n_sent = round(total * SENT_SHARE)
    n_not_sent = round(total * NOT_SENT_SHARE)
    out: dict[str, str] = {}
    for i, cid in enumerate(order):
        if i < n_signed:
            out[cid] = "Signed"
        elif i < n_signed + n_sent:
            out[cid] = "Sent"
        elif i < n_signed + n_sent + n_not_sent:
            out[cid] = "Not sent"
        else:
            out[cid] = "Declined"
    return out


def signed_date(creator_id: str, today: datetime.date) -> str:
    """Spread signatures over the preceding ~18 months, deterministically."""
    n = int(hashlib.md5(f"signed:{creator_id}".encode()).hexdigest(), 16) % 540
    return (today - datetime.timedelta(days=n + 14)).isoformat()


def fetch_all(base, key, table):
    recs, offset = [], None
    while True:
        q = {"pageSize": "100"}
        if offset:
            q["offset"] = offset
        url = f"https://api.airtable.com/v0/{base}/{urllib.parse.quote(table)}?" + urllib.parse.urlencode(q)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        d = json.load(urllib.request.urlopen(req))
        recs += d["records"]
        offset = d.get("offset")
        if not offset:
            return recs


def patch_batch(base, key, table, records):
    url = f"https://api.airtable.com/v0/{base}/{urllib.parse.quote(table)}"
    body = json.dumps({"records": records, "typecast": True}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="PATCH",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    env = load_env()
    base, key = env["AIRTABLE_BASE_ID"], env["AIRTABLE_API_KEY"]
    today = datetime.date.today()

    creators = fetch_all(base, key, "Creators")
    demo = [r for r in creators if r["fields"].get("Is Demo Persona") is True]
    real = [r for r in creators if r["fields"].get("Is Demo Persona") is not True]

    print(f"{len(creators)} creators — {len(demo)} demo personas, {len(real)} real (skipped)")
    if real:
        for r in real[:5]:
            print("   skipping real record:", r["fields"].get("Name"))

    ids = [r["fields"].get("Creator ID") or r["id"] for r in demo]
    statuses = assign_statuses(ids)

    updates, tally = [], {}
    for r in demo:
        cid = r["fields"].get("Creator ID") or r["id"]
        status = statuses[cid]
        tally[status] = tally.get(status, 0) + 1
        fields = {"Agreement Status": status}
        # A signed date only makes sense once it is actually signed.
        fields["Agreement Signed Date"] = signed_date(cid, today) if status == "Signed" else None
        updates.append({"id": r["id"], "fields": fields})

    total = len(updates) or 1
    print("\nplanned split:")
    for k in ["Signed", "Sent", "Not sent", "Declined"]:
        n = tally.get(k, 0)
        print(f"   {k:<10} {n:>4}  ({n * 100 // total}%)")

    if args.dry_run:
        print("\ndry run — nothing written")
        return

    done = 0
    for i in range(0, len(updates), 10):
        patch_batch(base, key, "Creators", updates[i : i + 10])
        done += len(updates[i : i + 10])
        time.sleep(0.25)  # stay under Airtable's 5 req/sec
        if (i // 10) % 5 == 0:
            print(f"   ...{done}/{len(updates)}")
    print(f"\nupdated {done} demo personas")


if __name__ == "__main__":
    main()
