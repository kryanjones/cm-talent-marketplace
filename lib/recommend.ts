/**
 * Rules-based recommendation engine (MVP).
 *
 * Scores creators not yet in the bundle by incremental deduplicated reach,
 * category coherence/diversification, budget-efficiency proxy, and demographic
 * /geographic gap-filling — weighted by the buyer's chosen optimization goal.
 * Returns the top three additions, each with a one-line reason. Respects brand
 * boundaries: never recommends a creator whose no-go categories conflict with an
 * active category filter, and flags exclusivity conflicts when that data exists.
 */
import type { BuyerCreator, Creator } from "@/lib/types";
import {
  calculateBundleReach,
  coefficientsFromAssumptions,
  type OverlapCoefficients,
  type ResolvedComponent,
  DEFAULT_COEFFICIENTS,
} from "@/lib/reach";
import type { OverlapAssumption } from "@/lib/types";

export type OptimizationGoal =
  | "Maximize Reach"
  | "Fit Budget"
  | "Tighten Category"
  | "Expand Audience";

export const GOALS: OptimizationGoal[] = [
  "Maximize Reach",
  "Fit Budget",
  "Tighten Category",
  "Expand Audience",
];

type CreatorLike = BuyerCreator | Creator;

export interface Recommendation {
  creatorId: string;
  creatorName: string;
  reason: string;
  incrementalReach: number;
  score: number;
  flags: string[];
}

interface RecommendInput {
  candidates: CreatorLike[];
  bundleComponents: ResolvedComponent[];
  goal: OptimizationGoal;
  overlap: OverlapAssumption[];
  /** Active category filters; used for boundary-respecting suppression. */
  activeCategories?: string[];
}

function allComponentsOf(c: CreatorLike): ResolvedComponent[] {
  return c.channels.map((channel) => ({
    creator: {
      id: c.id,
      name: c.name,
      primaryBeat: c.primaryBeat,
      categoryAffinities: c.categoryAffinities,
      homeMarketDMA: c.homeMarketDMA,
    },
    channel,
  }));
}

/** Smallest-share age band in the current bundle = the audience "gap". */
function ageGap(components: ResolvedComponent[], coef: OverlapCoefficients): string | null {
  const { demographicComposite } = calculateBundleReach(components, coef);
  const bands = demographicComposite.ageBands;
  if (!bands) return null;
  let min: { band: string; v: number } | null = null;
  for (const [band, v] of Object.entries(bands)) {
    if (!min || v < min.v) min = { band, v };
  }
  return min?.band ?? null;
}

function fmtReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

export function recommend(input: RecommendInput): Recommendation[] {
  const { candidates, bundleComponents, goal, activeCategories = [] } = input;
  const coef = coefficientsFromAssumptions(input.overlap) ?? DEFAULT_COEFFICIENTS;

  const inBundle = new Set(bundleComponents.map((c) => c.creator.id));
  const baseNet = calculateBundleReach(bundleComponents, coef).netReach;

  // Current bundle context for coherence + gap-fill.
  const bundleBeats = new Set(
    bundleComponents.map((c) => c.creator.primaryBeat).filter(Boolean) as string[]
  );
  const bundleAffinities = new Set(
    bundleComponents.flatMap((c) => c.creator.categoryAffinities)
  );
  const bundleGeos = new Set(
    bundleComponents
      .map((c) => c.creator.homeMarketDMA)
      .filter(Boolean) as string[]
  );
  const gapBand = ageGap(bundleComponents, coef);

  // Largest incremental reach across candidates, for normalization.
  type Scored = Recommendation & { sameCategory: boolean; newGeo: boolean };
  const scored: Scored[] = [];

  for (const cand of candidates) {
    if (inBundle.has(cand.id)) continue;
    if (cand.channels.length === 0) continue;

    // Boundary respect: drop candidates whose no-go list hits an active filter.
    const noGo = cand.brandBoundary?.noGoCategories ?? [];
    const conflict = activeCategories.some((cat) =>
      noGo.some((n) => n.toLowerCase() === cat.toLowerCase())
    );
    if (conflict) continue;

    const candComponents = allComponentsOf(cand);
    const after = calculateBundleReach(
      [...bundleComponents, ...candComponents],
      coef
    ).netReach;
    const inc = Math.max(0, after - baseNet);

    const sameCategory =
      (!!cand.primaryBeat && bundleBeats.has(cand.primaryBeat)) ||
      cand.categoryAffinities.some((a) => bundleAffinities.has(a));
    const newGeo = !!cand.homeMarketDMA && !bundleGeos.has(cand.homeMarketDMA);

    const flags: string[] = [];
    const conditional = cand.brandBoundary?.conditionalCategories ?? [];
    const conditionalHit = activeCategories.find((cat) =>
      conditional.some((n) => n.toLowerCase() === cat.toLowerCase())
    );
    if (conditionalHit) flags.push(`${conditionalHit} accepted with conditions`);
    // Exclusivity data only exists on the full (sales) Creator shape.
    const excl = (cand as Creator).brandBoundary?.activeExclusivities;
    if (excl) flags.push(`Active exclusivity: ${excl}`);

    scored.push({
      creatorId: cand.id,
      creatorName: cand.name,
      incrementalReach: inc,
      score: 0,
      reason: "",
      flags,
      sameCategory,
      newGeo,
    });
  }

  if (scored.length === 0) return [];

  const maxInc = Math.max(...scored.map((s) => s.incrementalReach), 1);

  for (const s of scored) {
    const reachScore = s.incrementalReach / maxInc; // 0..1

    switch (goal) {
      case "Maximize Reach":
        s.score = reachScore;
        break;
      case "Tighten Category":
        // Heavily reward coherence; reach is a tiebreaker.
        s.score = (s.sameCategory ? 1 : 0.15) * 0.7 + reachScore * 0.3;
        break;
      case "Expand Audience":
        // Reward new geography + reach; coherence not required.
        s.score = reachScore * 0.55 + (s.newGeo ? 0.45 : 0);
        break;
      case "Fit Budget":
        // No rates in buyer view: proxy "efficiency" = strong incremental reach
        // from a smaller audience footprint (less duplication, leaner buy).
        s.score = reachScore;
        break;
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  // Build reasons.
  for (const s of top) {
    const reach = fmtReach(s.incrementalReach);
    if (goal === "Tighten Category" && s.sameCategory) {
      const cat =
        [...bundleAffinities][0] ?? [...bundleBeats][0] ?? "the category";
      s.reason = `stays within ${cat} for category coherence — adds ${reach} reach`;
    } else if (goal === "Expand Audience" && s.newGeo) {
      const cand = candidates.find((c) => c.id === s.creatorId);
      const geo = cand?.homeMarketDMA ?? "a new market";
      s.reason = `adds ${reach} low-overlap reach in underrepresented ${geo}`;
    } else if (goal === "Expand Audience" && gapBand) {
      s.reason = `helps fill your ${gapBand} age gap — adds ${reach} reach`;
    } else if (goal === "Fit Budget") {
      s.reason = `efficient add: ${reach} incremental reach from a lean footprint`;
    } else {
      // Maximize Reach (default)
      const cand = candidates.find((c) => c.id === s.creatorId);
      const geoNote =
        s.newGeo && cand?.homeMarketDMA
          ? ` in underrepresented ${cand.homeMarketDMA}`
          : "";
      s.reason = `adds ${reach} low-overlap reach${geoNote}`;
    }
  }

  return top.map(({ sameCategory, newGeo, ...rec }) => rec);
}
