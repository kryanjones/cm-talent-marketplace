/**
 * Cold-start bundle planner.
 *
 * The recommendation engine in lib/recommend.ts answers "what should I add to
 * this bundle?" — it scores incremental reach against an existing selection and
 * returns nothing when the bundle is empty. This module answers the question a
 * buyer asks before any of that: "here is my brief, what should I be looking
 * at?" It assembles an opening bundle from scratch.
 *
 * SERVER-SIDE ONLY, by necessity. Budget matching needs rate cards, and rate
 * cards are stripped from buyer-facing data (see toBuyerCreator). So this runs
 * where the full Creator record is available and returns component IDs, a
 * narrative, and reach figures — never a price. That is also the behaviour we
 * want: the bundle silently fits the stated budget without printing rates.
 */
import type { Creator, Channel, OverlapAssumption, RateCard } from "@/lib/types";
import {
  calculateBundleReach,
  coefficientsFromAssumptions,
  type ResolvedComponent,
} from "@/lib/reach";
import type { OptimizationGoal } from "@/lib/recommend";
import { compactNumber, percent } from "@/lib/format";

export interface Brief {
  /**
   * What the buyer is advertising — an ADVERTISER INDUSTRY such as Alcohol,
   * Crypto or Pharma. This is the brand-safety axis: creators declare no-go and
   * conditional categories against these, so this is what filters the roster.
   */
  industry: string | null;
  /**
   * Audience interest to lean into, such as Food & Cooking or Travel. A
   * different axis entirely — it drives category coherence, not eligibility.
   * Creators never declare an interest as "no-go", so this must not be used for
   * brand-safety filtering.
   */
  affinity: string | null;
  goal: OptimizationGoal;
  /** Upper bound in USD. The plan never exceeds it. */
  budget: number;
  /** Optional preferred markets (DMA names). */
  markets?: string[];
  /** Optional preferred platforms. */
  platforms?: string[];
}

export interface PlanSummary {
  creatorCount: number;
  channelCount: number;
  grossReach: number;
  netReach: number;
  overlapPct: number;
  blendedEngagement: number | null;
  formats: string[];
  platforms: string[];
  markets: string[];
  beats: string[];
}

export interface PlanResult {
  components: { creatorId: string; channelId: string }[];
  summary: PlanSummary;
  /** Plain-language explanation, derived from the data — not generated prose. */
  narrative: { headline: string; points: string[] };
  /** How many creators were withheld because they decline this industry. */
  excludedForBoundaries: number;
  /** Creators in the plan who accept this industry only with conditions. */
  conditional: { name: string; note: string | null }[];
  /** True when the budget could not buy anything at all. */
  empty: boolean;
}

const MAX_CREATORS = 6;
const MAX_CHANNELS = 10;

/** Cheapest way to buy one unit on this channel, or null if it cannot be priced. */
function unitPrice(channel: Channel): number | null {
  const rc = channel.rateCard as RateCard | string | null;
  if (!rc || typeof rc === "string") return null;
  const reach = channel.avgReachPerUnit ?? 0;
  let best: number | null = null;
  for (const entry of Object.values(rc)) {
    const price =
      entry.type === "flat" ? entry.usd : entry.usd * (reach / 1000);
    if (price > 0 && (best === null || price < best)) best = price;
  }
  return best;
}

function toComponent(creator: Creator, channel: Channel): ResolvedComponent {
  return {
    creator: {
      id: creator.id,
      name: creator.name,
      primaryBeat: creator.primaryBeat,
      categoryAffinities: creator.categoryAffinities,
      homeMarketDMA: creator.homeMarketDMA,
    },
    channel,
  };
}

/**
 * Creators who have declared this advertiser industry off-limits are never
 * surfaced — not ranked lower, not shown with a warning. Withheld.
 */
function respectsBoundaries(creator: Creator, industry: string | null): boolean {
  if (!industry) return true;
  const noGo = creator.brandBoundary?.noGoCategories ?? [];
  return !noGo.some((n) => n.toLowerCase() === industry.toLowerCase());
}

/** Accepts the industry, but with conditions attached (e.g. no talent read). */
function isConditional(creator: Creator, industry: string | null): boolean {
  if (!industry) return false;
  const cond = creator.brandBoundary?.conditionalCategories ?? [];
  return cond.some((n) => n.toLowerCase() === industry.toLowerCase());
}

/** Goal-specific multiplier applied to a candidate's reach-per-dollar score. */
function goalMultiplier(
  goal: OptimizationGoal,
  creator: Creator,
  brief: Brief,
  chosen: ResolvedComponent[]
): number {
  const beats = new Set(chosen.map((c) => c.creator.primaryBeat).filter(Boolean));
  const markets = new Set(chosen.map((c) => c.creator.homeMarketDMA).filter(Boolean));
  const affinities = new Set(chosen.flatMap((c) => c.creator.categoryAffinities));

  const sharesCategory =
    (!!brief.affinity && creator.categoryAffinities.includes(brief.affinity)) ||
    creator.categoryAffinities.some((a) => affinities.has(a)) ||
    (!!creator.primaryBeat && beats.has(creator.primaryBeat));

  switch (goal) {
    case "Tighten Category":
      // Strongly prefer creators who sit in the buyer's category.
      return sharesCategory ? 1.6 : 0.5;
    case "Expand Audience":
      // Prefer markets not already represented.
      return creator.homeMarketDMA && !markets.has(creator.homeMarketDMA) ? 1.5 : 0.8;
    case "Fit Budget":
      // Efficiency is already the base score; nudge toward the buyer's category.
      return sharesCategory ? 1.15 : 1;
    case "Maximize Reach":
    default:
      return 1;
  }
}

/**
 * Greedy assembly. At each step, take the channel that adds the most
 * deduplicated reach per dollar (goal-weighted) and still fits the remaining
 * budget. Greedy is the right shape here: incremental dedup reach is
 * diminishing — each pick makes similar audiences worth less — so the marginal
 * value of a candidate genuinely depends on what has already been chosen.
 */
export function planBundle(
  creators: Creator[],
  overlap: OverlapAssumption[],
  brief: Brief
): PlanResult {
  const coef = coefficientsFromAssumptions(overlap);

  const active = creators.filter((c) => c.status === "Active");
  const eligible = active.filter((c) => respectsBoundaries(c, brief.industry));
  const excludedForBoundaries = active.length - eligible.length;

  // Build the purchasable universe: one entry per priceable channel.
  type Candidate = {
    creator: Creator;
    channel: Channel;
    price: number;
    component: ResolvedComponent;
  };
  const universe: Candidate[] = [];
  for (const creator of eligible) {
    for (const channel of creator.channels) {
      if (brief.platforms?.length && !brief.platforms.includes(channel.platform)) continue;
      const price = unitPrice(channel);
      if (price === null || price <= 0) continue;
      universe.push({ creator, channel, price, component: toComponent(creator, channel) });
    }
  }

  // Market preference is a soft filter: try to honour it, fall back if it
  // starves the plan of inventory.
  let pool = universe;
  if (brief.markets?.length) {
    const preferred = universe.filter(
      (u) => u.creator.homeMarketDMA && brief.markets!.includes(u.creator.homeMarketDMA)
    );
    if (preferred.length >= 3) pool = preferred;
  }

  // "Tighten Category" means what it says: restrict the pool to creators who
  // actually carry the stated audience interest, rather than merely preferring
  // them. A weighted nudge loses to reach-per-dollar and produces a plan that
  // claims coherence it does not have. Falls back if that starves the pool.
  let tightenedOn: string | null = null;
  if (brief.goal === "Tighten Category" && brief.affinity) {
    const inCategory = pool.filter((u) =>
      u.creator.categoryAffinities.includes(brief.affinity!)
    );
    if (inCategory.length >= 4) {
      pool = inCategory;
      tightenedOn = brief.affinity;
    }
  }

  const chosen: ResolvedComponent[] = [];
  const chosenIds = new Set<string>();
  const creatorIds = new Set<string>();
  let spend = 0;
  let baseNet = 0;

  while (chosen.length < MAX_CHANNELS) {
    let best: { cand: Candidate; score: number; net: number } | null = null;

    for (const cand of pool) {
      if (chosenIds.has(cand.channel.id)) continue;
      if (spend + cand.price > brief.budget) continue;
      if (!creatorIds.has(cand.creator.id) && creatorIds.size >= MAX_CREATORS) continue;

      const net = calculateBundleReach([...chosen, cand.component], coef).netReach;
      const incremental = net - baseNet;
      if (incremental <= 0) continue;

      const perDollar = incremental / cand.price;
      const score = perDollar * goalMultiplier(brief.goal, cand.creator, brief, chosen);
      if (!best || score > best.score) best = { cand, score, net };
    }

    if (!best) break;
    chosen.push(best.cand.component);
    chosenIds.add(best.cand.channel.id);
    creatorIds.add(best.cand.creator.id);
    spend += best.cand.price;
    baseNet = best.net;

    // "Fit Budget" stops once the plan is comfortably inside the number rather
    // than spending to the last dollar.
    if (brief.goal === "Fit Budget" && spend >= brief.budget * 0.8) break;
  }

  const reach = calculateBundleReach(chosen, coef);
  const summary: PlanSummary = {
    creatorCount: creatorIds.size,
    channelCount: chosen.length,
    grossReach: reach.grossReach,
    netReach: reach.netReach,
    overlapPct: reach.impliedOverlapPct,
    blendedEngagement: reach.blendedEngagementRate,
    formats: reach.combinedFormats,
    platforms: Array.from(new Set(chosen.map((c) => c.channel.platform))).sort(),
    markets: Array.from(
      new Set(chosen.map((c) => c.creator.homeMarketDMA).filter(Boolean) as string[])
    ),
    beats: Array.from(
      new Set(chosen.map((c) => c.creator.primaryBeat).filter(Boolean) as string[])
    ),
  };

  // Creators in the plan who will take this industry, but with conditions.
  // Surfaced rather than hidden — it is a term of the deal, not a disqualifier.
  const conditional = eligible
    .filter((c) => creatorIds.has(c.id) && isConditional(c, brief.industry))
    .map((c) => ({
      name: c.name,
      note: c.brandBoundary?.conditionsNotes ?? null,
    }));

  return {
    components: chosen.map((c) => ({
      creatorId: c.creator.id,
      channelId: c.channel.id,
    })),
    summary,
    narrative: buildNarrative(
      brief,
      summary,
      excludedForBoundaries,
      conditional,
      tightenedOn
    ),
    excludedForBoundaries,
    conditional,
    empty: chosen.length === 0,
  };
}

/**
 * The "why this bundle works" explanation.
 *
 * Deliberately assembled from the data rather than written by a language model:
 * every clause is a fact we can point at, and the numbers cannot drift from
 * what the bundle panel shows. Natural-language phrasing can be layered on
 * later without changing what is asserted.
 */
function buildNarrative(
  brief: Brief,
  s: PlanSummary,
  excluded: number,
  conditional: { name: string; note: string | null }[],
  tightenedOn: string | null
): { headline: string; points: string[] } {
  const points: string[] = [];

  if (s.creatorCount === 0) {
    return {
      headline: "Nothing fits this brief yet.",
      points: [
        "No combination of inventory fits inside this budget. Widening the budget, the platform mix, or the market usually opens it up.",
      ],
    };
  }

  const platformPhrase =
    s.platforms.length > 1
      ? `${s.platforms.slice(0, -1).join(", ")} and ${s.platforms.slice(-1)}`
      : s.platforms[0];

  const headline =
    `${s.creatorCount} creator${s.creatorCount === 1 ? "" : "s"} across ` +
    `${platformPhrase}, reaching an estimated ${compactNumber(s.netReach)} people.`;

  // Cross-format story — the thing a buyer cannot get from a single creator.
  if (s.platforms.length > 1) {
    points.push(
      `Runs across ${s.platforms.length} formats — ${platformPhrase} — so the same audience meets the message in more than one place.`
    );
  }

  // Honest reach math.
  points.push(
    `${compactNumber(s.grossReach)} gross reach, ${compactNumber(s.netReach)} after removing an estimated ${percent(
      s.overlapPct
    )} audience overlap between these creators.`
  );

  // No blended engagement claim here either: averaging an open rate with a
  // social engagement rate reads well and measures nothing. Per-channel rates
  // are on each creator's media kit, labelled by platform.

  // Category coherence or spread, depending on what was asked for. Only claims
  // concentration when the pool was genuinely restricted to that interest.
  if (tightenedOn) {
    points.push(
      `Every creator here carries a ${tightenedOn} audience, so the buy stays coherent rather than scattered.`
    );
  } else if (s.beats.length > 1) {
    points.push(
      `Spans ${s.beats.length} beats — ${s.beats.slice(0, 3).join(", ")}${
        s.beats.length > 3 ? " and others" : ""
      } — for audiences that do not fully overlap.`
    );
  }

  if (s.markets.length > 1) {
    points.push(
      `Covers ${s.markets.length} markets including ${s.markets.slice(0, 3).join(", ")}.`
    );
  }

  if (s.formats.length) {
    points.push(
      `Available ad formats include ${s.formats.slice(0, 4).join(", ")}${
        s.formats.length > 4 ? `, plus ${s.formats.length - 4} more` : ""
      }.`
    );
  }

  // Brand safety, stated as a positive.
  if (brief.industry && excluded > 0) {
    points.push(
      `Every creator here is cleared for ${brief.industry}. ${excluded} who decline that category were withheld before this plan was built.`
    );
  } else if (brief.industry) {
    points.push(`Every creator here is open to working with ${brief.industry}.`);
  }

  if (conditional.length) {
    const names = conditional.map((c) => c.name).join(", ");
    points.push(
      `${names} will run ${brief.industry} with conditions attached — worth covering early in the conversation.`
    );
  }

  points.push("Pricing is prepared by the Collective Media team on request.");

  return { headline, points };
}

/** Budget bands offered in the brief form, in USD. */
export const BUDGET_BANDS: { label: string; value: number }[] = [
  { label: "Under $25K", value: 25_000 },
  { label: "$25K – $50K", value: 50_000 },
  { label: "$50K – $100K", value: 100_000 },
  { label: "$100K – $250K", value: 250_000 },
  { label: "$250K+", value: 750_000 },
];
