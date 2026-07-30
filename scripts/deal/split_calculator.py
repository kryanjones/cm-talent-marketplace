#!/usr/bin/env python3
"""
Deal split calculator — prototype for Decision 1 (how a bundle's money divides).

Runs one real bundle through three models:

  A. COST-UP            Each creator is paid their rate-card price for the
                        placements sold; CM's cut is a take rate on top.

  B. PURE VALUE POOL    Same gross. The creator pool ignores rate cards and
                        divides by delivered value:
                            value_i  = Σ (avg_reach_per_unit × units)
                            weight_i = engagement ÷ PLATFORM benchmark
                            share_i  = Σ(value × weight) ÷ Σ_all(value × weight)

  C. FLOOR + PREMIUM    The bundle sells above the sum of its parts. Every
                        creator is floored at their rate card, and only the
                        premium divides by delivered value.

Two things this prototype established that the formula alone did not:

  1. The quality weight must benchmark against PLATFORM, not category.
     Engagement spans ~39× across platforms in this data (X ≈ 1.1%,
     Substack ≈ 43%), so any coarser benchmark hands newsletter creators the
     pool on format alone. Dividing by the channel's own platform mean asks the
     only fair question: does this audience respond better than others on the
     same surface? 1.00 = average for that surface.

  2. A rate-card floor makes a value pool mathematically IDENTICAL to cost-up
     unless the bundle carries a premium. If gross = cost + margin, the pool
     equals total cost exactly, so flooring everyone at rate card leaves
     nothing to redistribute. The premium is the only thing there is to split
     on performance — which is what model C shows.

Usage:
    python3 scripts/deal/split_calculator.py
    python3 scripts/deal/split_calculator.py --take 0.35 --premium 0.25
"""
import json
import os
import argparse
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

# A realistic cross-format bundle: video + podcast + newsletter + social,
# four creators, one beat (Politics & Government). Deliberately mixes a very
# large audience that under-performs its platform with smaller audiences that
# over-perform theirs — that is where the models disagree.
DEMO_BUNDLE = [
    {"creator": "Tomas Halloran", "platform": "YouTube",    "format": "Mid-roll",           "units": 2},
    {"creator": "Jordan Sorensen","platform": "Podcast",    "format": "Podcast Host-read",  "units": 2},
    {"creator": "Beatriz Bauer",  "platform": "Newsletter", "format": "Newsletter Primary", "units": 3},
    {"creator": "Owen Brennan",   "platform": "Instagram",  "format": "IG Post",            "units": 3},
]


def load():
    creators = json.load(open(os.path.join(DATA, "creators.json")))
    channels = json.load(open(os.path.join(DATA, "channels.json")))
    return creators, channels


def platform_benchmarks(channels):
    acc = defaultdict(list)
    for c in channels:
        if c["avgEngagementRate"]:
            acc[c["platform"]].append(c["avgEngagementRate"])
    return {p: sum(v) / len(v) for p, v in acc.items()}


def placement_price(channel, fmt, units):
    rc = channel.get("rateCard")
    if not isinstance(rc, dict) or fmt not in rc:
        return 0.0
    entry, reach = rc[fmt], (channel.get("avgReachPerUnit") or 0)
    if entry.get("type") == "flat":
        return entry["usd"] * units
    if entry.get("type") == "cpm":
        return entry["usd"] * (reach / 1000.0) * units
    return 0.0


def resolve(bundle, creators, channels, bench):
    """Turn the human-readable bundle into priced, weighted line items."""
    by_name = {c["name"]: c for c in creators}
    lines = []
    for item in bundle:
        cr = by_name[item["creator"]]
        ch = next(c for c in channels
                  if c["creatorId"] == cr["id"] and c["platform"] == item["platform"])
        units = item["units"]
        reach = (ch.get("avgReachPerUnit") or 0) * units
        eng = ch.get("avgEngagementRate") or 0
        weight = eng / (bench.get(ch["platform"]) or 1.0)
        lines.append({
            "creator": cr["name"], "platform": ch["platform"], "format": item["format"],
            "units": units, "rate_card": placement_price(ch, item["format"], units),
            "reach": reach, "weight": weight, "weighted": reach * weight,
        })
    return lines


def split(lines, take_rate=0.30, premium=0.0):
    cost = defaultdict(float)
    weighted = defaultdict(float)
    reach = defaultdict(float)
    for l in lines:
        cost[l["creator"]] += l["rate_card"]
        weighted[l["creator"]] += l["weighted"]
        reach[l["creator"]] += l["reach"]

    total_cost = sum(cost.values())
    total_weighted = sum(weighted.values()) or 1.0

    # A — cost-up
    gross_a = total_cost / (1 - take_rate)

    # B — pure value pool at the SAME gross (no floor)
    pool_b = gross_a * (1 - take_rate)
    share_b = {k: pool_b * (w / total_weighted) for k, w in weighted.items()}

    # C — bundle carries a premium; floors hold; only the premium splits on value
    gross_c = gross_a * (1 + premium)
    pool_c = gross_c * (1 - take_rate)
    surplus = pool_c - total_cost
    share_c = {k: cost[k] + surplus * (weighted[k] / total_weighted) for k in cost}

    rows = []
    for k in cost:
        rows.append({
            "creator": k, "reach": reach[k],
            "weight": weighted[k] / reach[k] if reach[k] else 1.0,
            "a": cost[k], "a_pct": cost[k] / total_cost if total_cost else 0,
            "b": share_b[k], "b_pct": share_b[k] / pool_b if pool_b else 0,
            "c": share_c[k], "c_pct": share_c[k] / pool_c if pool_c else 0,
        })
    rows.sort(key=lambda r: -r["reach"])
    return {
        "rows": rows, "total_cost": total_cost, "take_rate": take_rate, "premium": premium,
        "gross_a": gross_a, "cm_a": gross_a - total_cost,
        "gross_c": gross_c, "cm_c": gross_c - pool_c, "pool_c": pool_c, "surplus": surplus,
    }


def money(n):
    return f"${n:,.0f}"


def report(lines, r):
    print("=" * 92)
    print(f"DEAL SPLIT PROTOTYPE   ·   CM take {r['take_rate']*100:.0f}%   ·   "
          f"bundle premium {r['premium']*100:.0f}%")
    print("=" * 92)

    print("\nTHE BUNDLE")
    print(f"  {'Creator':<18}{'Platform':<12}{'Format':<20}{'Units':>6}{'Reach':>10}{'Qual':>7}{'Rate card':>12}")
    for l in lines:
        print(f"  {l['creator']:<18}{l['platform']:<12}{l['format']:<20}{l['units']:>6}"
              f"{l['reach']/1000:>9,.0f}K{l['weight']:>7.2f}{money(l['rate_card']):>12}")
    print(f"  {'':<56}{'TOTAL':>17}{money(r['total_cost']):>12}")

    print("\nWHAT THE BRAND PAYS")
    print(f"  A / B  cost + margin              {money(r['gross_a']):>12}   (CM {money(r['cm_a'])})")
    print(f"  C      cost + margin + premium    {money(r['gross_c']):>12}   (CM {money(r['cm_c'])})")
    print(f"         premium to divide on performance{money(r['surplus']):>19}")

    print("\nHOW THE CREATOR POOL DIVIDES")
    print(f"  {'Creator':<18}{'Qual':>6}{'A: Cost-up':>19}{'B: Pure value':>19}{'C: Floor+premium':>22}")
    for row in r["rows"]:
        print(f"  {row['creator']:<18}{row['weight']:>6.2f}"
              f"{money(row['a']):>13}{row['a_pct']*100:>5.0f}%"
              f"{money(row['b']):>13}{row['b_pct']*100:>5.0f}%"
              f"{money(row['c']):>16}{row['c_pct']*100:>5.0f}%")

    print("\n  Qual = engagement ÷ that platform's mean. 1.00 = average for that surface.")
    biggest = max(r["rows"], key=lambda x: abs(x["b"] - x["a"]))
    print(f"  Widest disagreement: {biggest['creator']} moves "
          f"{money(abs(biggest['b'] - biggest['a']))} between A and B "
          f"({biggest['a_pct']*100:.0f}% → {biggest['b_pct']*100:.0f}% of the pool).")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--take", type=float, default=0.30)
    ap.add_argument("--premium", type=float, default=0.20)
    args = ap.parse_args()

    creators, channels = load()
    bench = platform_benchmarks(channels)
    lines = resolve(DEMO_BUNDLE, creators, channels, bench)
    report(lines, split(lines, take_rate=args.take, premium=args.premium))

    print("\nPLATFORM BENCHMARKS (mean engagement, the 1.00 baseline)")
    print("  " + "   ".join(f"{p} {v*100:.1f}%" for p, v in
                            sorted(bench.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
