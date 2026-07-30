#!/usr/bin/env python3
"""
Seed a demo campaign so the Phase 5 features have something to show.

Everything created here is prefixed "DEMO —" and attaches only to fictional
personas, so it is safe to delete wholesale:

    python3 scripts/demo/seed_campaign_demo.py --remove

The campaign is deliberately IMPERFECT — one placement unmeasured, one
unpublished, one with impressions but no clicks — because that is what the
reporting is built to handle honestly, and a demo where everything is complete
would hide the part worth showing.

Usage:
    python3 scripts/demo/seed_campaign_demo.py            # create
    python3 scripts/demo/seed_campaign_demo.py --remove   # delete everything
"""
import os
import sys
import json
import time
import argparse
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAG = "DEMO — "
CODE = "demo-northwind"


def env():
    out = {}
    for line in open(os.path.join(ROOT, ".env.local")):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().split("  #")[0].strip()
    return out


E = env()
BASE, KEY = E["AIRTABLE_BASE_ID"], E["AIRTABLE_API_KEY"]
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def url(table, q=None):
    u = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(table)}"
    return u + ("?" + urllib.parse.urlencode(q) if q else "")


def fetch_all(table):
    recs, offset = [], None
    while True:
        q = {"pageSize": "100"}
        if offset:
            q["offset"] = offset
        d = json.load(urllib.request.urlopen(urllib.request.Request(url(table, q), headers=H)))
        recs += d["records"]
        offset = d.get("offset")
        if not offset:
            return recs


def create(table, rows):
    """Batch create, 10 at a time — Airtable's per-request limit."""
    made = []
    for i in range(0, len(rows), 10):
        body = json.dumps({"records": [{"fields": f} for f in rows[i : i + 10]], "typecast": True}).encode()
        d = json.load(urllib.request.urlopen(urllib.request.Request(url(table), data=body, headers=H, method="POST")))
        made += [r["id"] for r in d["records"]]
        time.sleep(0.25)  # stay under 5 req/sec
    return made


def delete(table, ids):
    n = 0
    for i in range(0, len(ids), 10):
        q = "&".join("records[]=" + urllib.parse.quote(x) for x in ids[i : i + 10])
        d = json.load(urllib.request.urlopen(urllib.request.Request(url(table) + "?" + q, headers=H, method="DELETE")))
        n += sum(1 for r in d.get("records", []) if r.get("deleted"))
        time.sleep(0.25)
    return n


def remove():
    """Delete anything this script created, identified by the DEMO tag."""
    for table, field in [
        ("Bookings", "Booking ID"),
        ("Campaigns", "Campaign Name"),
        ("Advertiser Relationships", "Relationship ID"),
    ]:
        ids = [r["id"] for r in fetch_all(table) if str(r["fields"].get(field, "")).startswith(TAG)]
        print(f"  {table}: removed {delete(table, ids)}")
    clicks = [r["id"] for r in fetch_all("Link Clicks") if r["fields"].get("Code") == CODE]
    print(f"  Link Clicks: removed {delete('Link Clicks', clicks)}")
    # Clear the demo team emails
    creators = [r for r in fetch_all("Creators") if str(r["fields"].get("Team Email", "")).endswith("example.invalid")]
    for r in creators:
        urllib.request.urlopen(urllib.request.Request(
            url("Creators") + "/" + r["id"],
            data=json.dumps({"fields": {"Team Email": ""}}).encode(), headers=H, method="PATCH"))
        time.sleep(0.2)
    print(f"  Creators: cleared {len(creators)} demo team emails")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--remove", action="store_true")
    args = ap.parse_args()
    if args.remove:
        print("removing demo campaign data…")
        remove()
        return

    creators = [r for r in fetch_all("Creators") if r["fields"].get("Creator ID")]
    by_name = {r["fields"]["Name"]: r for r in creators}
    channels = fetch_all("Channels")

    # Pick four creators who are cleared to sell, so the demo does not trip the
    # agency clearance warning and muddy what it is showing.
    cleared = [
        r for r in creators
        if r["fields"].get("Agreement Status") == "Signed"
        and any(c["fields"].get("Creator") == r["fields"]["Name"] for c in channels)
    ][:4]
    if len(cleared) < 4:
        sys.exit("not enough cleared creators to build the demo")

    picks = []
    for cr in cleared:
        chs = [c for c in channels if c["fields"].get("Creator") == cr["fields"]["Name"]]
        picks.append((cr, chs[0]))

    # --- Schedule B: one keep-it, one hand-it-to-us, so the rate lookup shows
    rels = [
        {"Relationship ID": TAG + "REL-1", "Brand": "Northwind Coffee",
         "Parent Company": "Northwind Group", "Treatment": "Keep it",
         "Creator": [picks[0][0]["id"]], "Notes": "Demo row — creator's own relationship."},
        {"Relationship ID": TAG + "REL-2", "Brand": "Northwind Coffee",
         "Parent Company": "Northwind Group", "Treatment": "Hand it to us",
         "Creator": [picks[1][0]["id"]], "Notes": "Demo row — originated by the creator, we manage it."},
    ]
    create("Advertiser Relationships", rels)
    print(f"  Schedule B: 2 rows ({picks[0][0]['fields']['Name']} keep-it, {picks[1][0]['fields']['Name']} hand-it-to-us)")

    # --- Team emails so the approval flow has somewhere to address
    for cr, _ in picks[:3]:
        urllib.request.urlopen(urllib.request.Request(
            url("Creators") + "/" + cr["id"],
            data=json.dumps({"fields": {"Team Email": "demo-team@example.invalid"}}).encode(),
            headers=H, method="PATCH"))
        time.sleep(0.2)
    print("  Team emails: set on 3 creators (demo-team@example.invalid)")

    # --- Campaign
    camp = create("Campaigns", [{
        "Campaign Name": TAG + "Northwind Coffee — Autumn 2026",
        "Advertiser": "Northwind Coffee",
        "Status": "Live",
        "Start Month": "2026-07-01",
        "End Month": "2026-09-01",
        "Contracted Reach": 900000,
        "Notes": "Demo campaign. Deliberately incomplete so the reporting shows how it handles missing data.",
    }])[0]
    print("  Campaign: 1")

    # --- Placements, deliberately uneven
    # Each placement is built to demonstrate exactly one thing, so the report
    # reads as instructive rather than broken:
    #   1 — clicks we measured ourselves, impressions still owed by the platform
    #   2 — a fully reported placement, so there is a real click rate to show
    #   3 — impressions but zero clicks, which trips the outlier observation
    #   4 — sold but never published
    plan = [
        {"imp": None, "clicks": None, "pub": "2026-07-08", "code": CODE,
         "dest": "https://example.invalid/northwind",
         "note": "Platform impressions not back yet — clicks are our own measurement."},
        {"imp": 188000, "clicks": 940, "pub": "2026-07-14", "code": None, "dest": None,
         "note": None},
        {"imp": 412000, "clicks": 0, "pub": "2026-07-21", "code": None, "dest": None,
         "note": "Published two days late; brand requested a creative swap."},
        {"imp": None, "clicks": None, "pub": None, "code": None, "dest": None, "note": None},
    ]
    rows = []
    for i, ((cr, ch), p) in enumerate(zip(picks, plan), start=1):
        f = {
            "Booking ID": f"{TAG}PLACEMENT-{i}",
            "Channel": [ch["id"]],
            "Brand": "Northwind Coffee",
            "Month": "2026-07-01",
            "Slots": 1,
            "Status": "Confirmed",
            "Campaign": [camp],
        }
        if p["pub"]:
            f["Published Date"] = p["pub"]
            f["Live URL"] = f"https://example.invalid/{cr['fields']['Name'].split()[0].lower()}-placement"
        if p["imp"] is not None:
            f["Impressions"] = p["imp"]
        if p["clicks"] is not None:
            f["Clicks"] = p["clicks"]
        if p["code"]:
            f["Link Code"] = p["code"]
            f["Destination URL"] = p["dest"]
        if p["note"]:
            f["Delivery Notes"] = p["note"]
        rows.append(f)
    create("Bookings", rows)
    print(f"  Placements: {len(rows)} (1 tracked link, 1 unmeasured, 1 unpublished)")

    # --- Clicks on the tracked link, so it reads as measured
    create("Link Clicks", [
        {"Code": CODE, "Clicked At": f"2026-07-{9 + (i % 12):02d}T14:{i % 60:02d}:00Z",
         "Referrer Host": ["youtube.com", "open.spotify.com", "t.co"][i % 3]}
        for i in range(37)
    ])
    print("  Link clicks: 37 on the tracked placement")
    print("\nDone. Remove it all with: python3 scripts/demo/seed_campaign_demo.py --remove")


if __name__ == "__main__":
    main()
