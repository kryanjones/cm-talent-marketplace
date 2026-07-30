/**
 * Deal pricing and creator splits, per the executed agreement.
 *
 * SALES-ONLY. Everything here reads rate cards.
 *
 * The numbers are not ours to choose. MSA §6.1 and the Deal Summary fix the
 * commission at 20% for new advertisers, 15% for hand-it-to-us brands, and 0%
 * for keep-it brands, and MSA §1.1(m) fixes what the commission is calculated
 * on. Both are encoded here rather than left adjustable, because a rate typed
 * into a form is a rate that can breach the agreement.
 *
 * Placement Fee — the base for every calculation — is what the advertiser pays
 * for the placement itself, net of:
 *   (i)  any commission or discount a media buying agency retains before the
 *        money reaches us, and
 *   (ii) Pass-Through Costs: paid media, documented production, travel, gifting.
 * MSA §1.1(m): "No other deduction, offset, or charge of any kind shall reduce
 * the Placement Fee." So there is deliberately no other lever in this module.
 */
import type { Channel, Creator, RateCard } from "@/lib/types";

/** How a given advertiser is treated for this creator (Schedule B). */
export type Treatment = "Keep it" | "Hand it to us" | "New";

/** MSA §6.1. Not configurable. */
export const COMMISSION_RATE: Record<Treatment, number> = {
  "Keep it": 0,
  "Hand it to us": 0.15,
  New: 0.2,
};

export function rateFor(treatment: Treatment): number {
  return COMMISSION_RATE[treatment];
}

export interface DealLineInput {
  creatorId: string;
  channelId: string;
  format: string;
  units: number;
}

export interface DealLine extends DealLineInput {
  creatorName: string;
  platform: string;
  /** Rate-card value of the placement, before any deduction. */
  gross: number;
  reach: number;
  availableFormats: string[];
  /** Below this creator's Schedule C floor, if one is set. */
  belowFloor: boolean;
}

export interface CreatorSplit {
  creatorId: string;
  creatorName: string;
  treatment: Treatment;
  rate: number;
  gross: number;
  /** Gross less this creator's share of agency cut and pass-throughs. */
  placementFee: number;
  commission: number;
  creatorShare: number;
  belowFloor: boolean;
  priceFloor: number | null;
}

export interface DealResult {
  lines: DealLine[];
  /** What the advertiser is billed for the placements themselves. */
  grossPlacements: number;
  /** Retained by a media buying agency before the money reaches us. */
  agencyDeduction: number;
  /** Advertiser-funded costs that sit outside the split entirely. */
  passThroughs: number;
  /** MSA §1.1(m). The base for all commission. */
  placementFee: number;
  /** What the advertiser pays in total, including pass-throughs. */
  advertiserTotal: number;
  commission: number;
  creatorTotal: number;
  splits: CreatorSplit[];
  /** Lines priced under the relevant creator's Schedule C floor. */
  belowFloorCount: number;
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
  if (!rc || typeof rc !== "object") return 0;
  const entry = rc[format];
  if (!entry) return 0;
  if (entry.type === "flat") return entry.usd * units;
  return entry.usd * ((channel.avgReachPerUnit ?? 0) / 1000) * units;
}

/**
 * The format a line should start on: the first priceable entry in the rate
 * card, because rate cards are authored with the marquee format first.
 * Defaulting to the cheapest opens a $150 integrated segment as a $23 pre-roll.
 */
export function primaryFormat(channel: Channel): string | null {
  for (const format of formatsFor(channel)) {
    if (placementPrice(channel, format, 1) > 0) return format;
  }
  return null;
}

export interface DealOptions {
  /** Fraction the media buying agency retains, e.g. 0.15. */
  agencyCut?: number;
  /** Advertiser-funded costs outside the split, in dollars. */
  passThroughs?: number;
  /** How this advertiser is treated, per creator id. Absent ⇒ "New" (20%). */
  treatments?: Record<string, Treatment>;
}

export function priceDeal(
  inputs: DealLineInput[],
  creators: Creator[],
  opts: DealOptions = {}
): DealResult {
  const agencyCut = Math.min(Math.max(opts.agencyCut ?? 0, 0), 0.9);
  const passThroughs = Math.max(opts.passThroughs ?? 0, 0);
  const treatments = opts.treatments ?? {};
  const byCreator = new Map(creators.map((c) => [c.id, c]));

  const lines: DealLine[] = [];
  for (const input of inputs) {
    const creator = byCreator.get(input.creatorId);
    const channel = creator?.channels.find((ch) => ch.id === input.channelId);
    if (!creator || !channel) continue;
    const gross = placementPrice(channel, input.format, input.units);
    const floor = creator.priceFloor;
    lines.push({
      ...input,
      creatorName: creator.name,
      platform: channel.platform,
      gross,
      reach: (channel.avgReachPerUnit ?? 0) * input.units,
      availableFormats: formatsFor(channel),
      // Schedule C is a per-placement floor, so compare the unit price.
      belowFloor: floor != null && input.units > 0 && gross / input.units < floor,
    });
  }

  const grossPlacements = lines.reduce((s, l) => s + l.gross, 0);
  const agencyDeduction = grossPlacements * agencyCut;
  // Pass-throughs are advertiser-funded costs, not placement value: they are
  // removed before commission and never form part of anyone's share.
  const placementFee = Math.max(0, grossPlacements - agencyDeduction - passThroughs);

  // Each creator's share of the deductions follows their share of the gross,
  // so one creator's pass-through does not dilute another's fee.
  const grossBy = new Map<string, number>();
  for (const l of lines) {
    grossBy.set(l.creatorId, (grossBy.get(l.creatorId) ?? 0) + l.gross);
  }

  const splits: CreatorSplit[] = [];
  for (const [creatorId, gross] of grossBy) {
    const creator = byCreator.get(creatorId);
    const treatment = treatments[creatorId] ?? "New";
    const rate = rateFor(treatment);
    const share = grossPlacements > 0 ? gross / grossPlacements : 0;
    const fee = placementFee * share;
    const commission = fee * rate;
    splits.push({
      creatorId,
      creatorName: creator?.name ?? creatorId,
      treatment,
      rate,
      gross,
      placementFee: fee,
      commission,
      // MSA §6.1: "Creator shall be entitled to the balance of the Placement Fee."
      creatorShare: fee - commission,
      belowFloor: lines.some((l) => l.creatorId === creatorId && l.belowFloor),
      priceFloor: creator?.priceFloor ?? null,
    });
  }
  splits.sort((a, b) => b.gross - a.gross);

  return {
    lines,
    grossPlacements,
    agencyDeduction,
    passThroughs,
    placementFee,
    advertiserTotal: grossPlacements + passThroughs,
    commission: splits.reduce((s, x) => s + x.commission, 0),
    creatorTotal: splits.reduce((s, x) => s + x.creatorShare, 0),
    splits,
    belowFloorCount: lines.filter((l) => l.belowFloor).length,
  };
}
