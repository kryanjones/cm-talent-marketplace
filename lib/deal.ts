/**
 * Deal pricing and creator splits.
 *
 * SALES-ONLY. Everything here reads rate cards, so it must never be imported
 * into a buyer-facing surface.
 *
 * TypeScript port of scripts/deal/split_calculator.py, which was validated
 * against the live rate-card data. Two findings from that prototype are load-
 * bearing and are preserved here:
 *
 *  1. The quality weight benchmarks against PLATFORM, not category. Engagement
 *     spans ~39x across surfaces (X ~1.1%, Substack ~43%), so any coarser
 *     benchmark hands the pool to newsletter creators on format alone.
 *
 *  2. A rate-card floor makes a value pool identical to cost-up unless the
 *     bundle carries a premium. At cost + margin the pool equals total cost
 *     exactly, so flooring everyone leaves nothing to redistribute. Only the
 *     premium can be split on performance.
 */
import type { Channel, Creator, RateCard } from "@/lib/types";

export type PricingModel = "cost-up" | "floor-premium";

export interface DealLineInput {
  creatorId: string;
  channelId: string;
  format: string;
  units: number;
}

export interface DealLine extends DealLineInput {
  creatorName: string;
  platform: string;
  price: number;
  reach: number;
  /** engagement ÷ platform mean. 1.00 = average for that surface. */
  weight: number;
  weightedValue: number;
  availableFormats: string[];
}

export interface CreatorSplit {
  creatorId: string;
  creatorName: string;
  reach: number;
  /** Reach-weighted quality across this creator's lines. */
  weight: number;
  costUp: number;
  costUpPct: number;
  pool: number;
  poolPct: number;
  delta: number;
}

export interface DealResult {
  lines: DealLine[];
  creatorTotal: number;
  takeRate: number;
  premium: number;
  /** Cost + margin. What the brand pays under cost-up. */
  grossCostUp: number;
  cmCutCostUp: number;
  /** Cost + margin + premium. What the brand pays under floor+premium. */
  grossWithPremium: number;
  cmCutWithPremium: number;
  creatorPool: number;
  /** The part of the pool that divides on performance. */
  surplus: number;
  splits: CreatorSplit[];
}

/** Mean engagement per platform — the 1.00 baseline for the quality weight. */
export function platformBenchmarks(creators: Creator[]): Record<string, number> {
  const acc: Record<string, number[]> = {};
  for (const c of creators) {
    for (const ch of c.channels) {
      if (ch.avgEngagementRate == null) continue;
      (acc[ch.platform] ??= []).push(ch.avgEngagementRate);
    }
  }
  const out: Record<string, number> = {};
  for (const [platform, values] of Object.entries(acc)) {
    out[platform] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return out;
}

export function formatsFor(channel: Channel): string[] {
  const rc = channel.rateCard;
  return rc && typeof rc !== "string" ? Object.keys(rc) : [];
}

/** Rate-card price for this many units of a format. 0 when unpriceable. */
export function placementPrice(
  channel: Channel,
  format: string,
  units: number
): number {
  const rc = channel.rateCard as RateCard | string | null;
  if (!rc || typeof rc === "string") return 0;
  const entry = rc[format];
  if (!entry) return 0;
  if (entry.type === "flat") return entry.usd * units;
  // CPM prices against the reach the placement actually delivers.
  return entry.usd * ((channel.avgReachPerUnit ?? 0) / 1000) * units;
}

/**
 * The format a line should start on.
 *
 * The first priceable entry in the rate card, because rate cards are authored
 * with the marquee format first — Integrated Segment before Pre-roll,
 * Newsletter Primary before Secondary. Defaulting to the *cheapest* format
 * instead makes every line open at the smallest possible number (a $150
 * integrated segment opening as a $23 pre-roll), which understates the deal and
 * leaves sales correcting every row before they can quote.
 */
export function primaryFormat(channel: Channel): string | null {
  for (const format of formatsFor(channel)) {
    if (placementPrice(channel, format, 1) > 0) return format;
  }
  return null;
}

/** The cheapest priceable format — kept for budget-fitting callers. */
export function cheapestFormat(channel: Channel): string | null {
  let best: { format: string; price: number } | null = null;
  for (const format of formatsFor(channel)) {
    const price = placementPrice(channel, format, 1);
    if (price > 0 && (!best || price < best.price)) best = { format, price };
  }
  return best?.format ?? null;
}

export function priceDeal(
  inputs: DealLineInput[],
  creators: Creator[],
  opts: { takeRate?: number; premium?: number } = {}
): DealResult {
  const takeRate = opts.takeRate ?? 0.3;
  const premium = opts.premium ?? 0;
  const bench = platformBenchmarks(creators);
  const byCreator = new Map(creators.map((c) => [c.id, c]));

  const lines: DealLine[] = [];
  for (const input of inputs) {
    const creator = byCreator.get(input.creatorId);
    const channel = creator?.channels.find((ch) => ch.id === input.channelId);
    if (!creator || !channel) continue;
    const reach = (channel.avgReachPerUnit ?? 0) * input.units;
    const benchmark = bench[channel.platform] || 1;
    const weight = (channel.avgEngagementRate ?? benchmark) / benchmark;
    lines.push({
      ...input,
      creatorName: creator.name,
      platform: channel.platform,
      price: placementPrice(channel, input.format, input.units),
      reach,
      weight,
      weightedValue: reach * weight,
      availableFormats: formatsFor(channel),
    });
  }

  const cost = new Map<string, number>();
  const weighted = new Map<string, number>();
  const reachBy = new Map<string, number>();
  for (const l of lines) {
    cost.set(l.creatorId, (cost.get(l.creatorId) ?? 0) + l.price);
    weighted.set(l.creatorId, (weighted.get(l.creatorId) ?? 0) + l.weightedValue);
    reachBy.set(l.creatorId, (reachBy.get(l.creatorId) ?? 0) + l.reach);
  }

  const creatorTotal = [...cost.values()].reduce((a, b) => a + b, 0);
  const totalWeighted = [...weighted.values()].reduce((a, b) => a + b, 0) || 1;

  const grossCostUp = takeRate < 1 ? creatorTotal / (1 - takeRate) : creatorTotal;
  const grossWithPremium = grossCostUp * (1 + premium);
  const creatorPool = grossWithPremium * (1 - takeRate);
  // Every creator is floored at their rate card; only what is left over after
  // paying all the floors divides on delivered performance.
  const surplus = Math.max(0, creatorPool - creatorTotal);

  const splits: CreatorSplit[] = [];
  for (const [creatorId, costUp] of cost) {
    const share = (weighted.get(creatorId) ?? 0) / totalWeighted;
    const pool = costUp + surplus * share;
    const reach = reachBy.get(creatorId) ?? 0;
    splits.push({
      creatorId,
      creatorName:
        lines.find((l) => l.creatorId === creatorId)?.creatorName ?? creatorId,
      reach,
      weight: reach ? (weighted.get(creatorId) ?? 0) / reach : 1,
      costUp,
      costUpPct: creatorTotal ? costUp / creatorTotal : 0,
      pool,
      poolPct: creatorPool ? pool / creatorPool : 0,
      delta: pool - costUp,
    });
  }
  splits.sort((a, b) => b.reach - a.reach);

  return {
    lines,
    creatorTotal,
    takeRate,
    premium,
    grossCostUp,
    cmCutCostUp: grossCostUp - creatorTotal,
    grossWithPremium,
    cmCutWithPremium: grossWithPremium - creatorPool,
    creatorPool,
    surplus,
    splits,
  };
}
