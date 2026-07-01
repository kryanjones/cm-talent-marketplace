/**
 * Bundle reach math.
 *
 * Pure functions, no I/O — safe to run on the server or in the client. The
 * deduplicated-reach estimate is deliberately a transparent heuristic driven by
 * the tunable `Overlap Assumptions` coefficients, NOT real cross-audience data.
 * The net figure is always labeled an estimate in the UI. Architecture note:
 * swap `overlapFractionFor` for a real overlap-data lookup later and the rest of
 * the pipeline is unchanged.
 */
import type {
  Channel,
  Creator,
  OverlapAssumption,
  AgeBands,
  GenderSplit,
} from "@/lib/types";

/** A channel with or without its (sales-only) rate card. */
export type ChannelLike = Omit<Channel, "rateCard"> & { rateCard?: Channel["rateCard"] };

export interface ResolvedComponent {
  creator: Pick<
    Creator,
    "id" | "name" | "primaryBeat" | "categoryAffinities" | "homeMarketDMA"
  >;
  channel: ChannelLike;
}

export interface OverlapCoefficients {
  sameCreator: number; // Same Creator Cross-Platform
  sameCategory: number; // Same Category Cross-Creator
  crossCategory: number; // Cross-Category Cross-Creator
}

export const DEFAULT_COEFFICIENTS: OverlapCoefficients = {
  sameCreator: 0.3,
  sameCategory: 0.15,
  crossCategory: 0.05,
};

export function coefficientsFromAssumptions(
  rows: OverlapAssumption[]
): OverlapCoefficients {
  const find = (needle: string) =>
    rows.find((r) =>
      String(r.scenario).toLowerCase().includes(needle)
    )?.overlapCoefficient;
  return {
    sameCreator: find("same creator") ?? DEFAULT_COEFFICIENTS.sameCreator,
    sameCategory: find("same category") ?? DEFAULT_COEFFICIENTS.sameCategory,
    crossCategory: find("cross-category") ?? DEFAULT_COEFFICIENTS.crossCategory,
  };
}

/** The overlap relationship (and coefficient) between two components. */
export function overlapFractionFor(
  a: ResolvedComponent,
  b: ResolvedComponent,
  coef: OverlapCoefficients
): number {
  if (a.creator.id === b.creator.id) return coef.sameCreator;
  const sameBeat =
    !!a.creator.primaryBeat && a.creator.primaryBeat === b.creator.primaryBeat;
  const sharedAffinity = a.creator.categoryAffinities.some((x) =>
    b.creator.categoryAffinities.includes(x)
  );
  if (sameBeat || sharedAffinity) return coef.sameCategory;
  return coef.crossCategory;
}

function reachOf(c: ResolvedComponent): number {
  return c.channel.avgReachPerUnit ?? c.channel.audienceSize ?? 0;
}

export interface BundleReach {
  componentCount: number;
  grossReach: number;
  netReach: number; // estimated, deduplicated
  impliedOverlapPct: number; // 0..1
  blendedEngagementRate: number | null; // reach-weighted, fraction
  combinedFormats: string[];
  demographicComposite: {
    ageBands: AgeBands | null;
    genderSplit: GenderSplit | null;
  };
  geoFootprint: string[];
  /** Per-component incremental (deduplicated) reach, keyed by channel id. */
  incrementalByChannel: Record<string, number>;
}

function parseAge(v: Channel["audienceAgeBands"]): AgeBands | null {
  if (!v || typeof v === "string") return null;
  return v;
}
function parseGender(v: Channel["audienceGenderSplit"]): GenderSplit | null {
  if (!v || typeof v === "string") return null;
  return v;
}

/**
 * Core reach calculation.
 *
 * Net (deduplicated) reach uses an incremental model: order components by raw
 * reach descending, then each component contributes reach * (1 - strongest
 * overlap with everything already counted). The biggest channel anchors at full
 * reach; each addition is discounted by its strongest audience overlap with the
 * existing selection. This is stable, order-independent given the sort, and
 * yields a natural "incremental reach" per component for the recommender.
 */
export function calculateBundleReach(
  components: ResolvedComponent[],
  coef: OverlapCoefficients = DEFAULT_COEFFICIENTS
): BundleReach {
  const grossReach = components.reduce((s, c) => s + reachOf(c), 0);

  // Sort by raw reach desc; largest anchors the net.
  const ordered = [...components].sort((a, b) => reachOf(b) - reachOf(a));

  let netReach = 0;
  const counted: ResolvedComponent[] = [];
  const incrementalByChannel: Record<string, number> = {};

  for (const c of ordered) {
    const r = reachOf(c);
    let strongestOverlap = 0;
    for (const prev of counted) {
      strongestOverlap = Math.max(
        strongestOverlap,
        overlapFractionFor(c, prev, coef)
      );
    }
    const incremental = r * (1 - strongestOverlap);
    incrementalByChannel[c.channel.id] = incremental;
    netReach += incremental;
    counted.push(c);
  }

  const impliedOverlapPct = grossReach > 0 ? (grossReach - netReach) / grossReach : 0;

  // Reach-weighted blended engagement.
  let engNum = 0;
  let engDen = 0;
  for (const c of components) {
    if (c.channel.avgEngagementRate != null) {
      const w = reachOf(c) || 1;
      engNum += c.channel.avgEngagementRate * w;
      engDen += w;
    }
  }
  const blendedEngagementRate = engDen > 0 ? engNum / engDen : null;

  // Combined formats (union).
  const formatSet = new Set<string>();
  for (const c of components) c.channel.availableAdFormats.forEach((f) => formatSet.add(f));

  // Demographic composite — reach-weighted across channels that report it.
  const ageAcc: Record<string, number> = {};
  let ageWeight = 0;
  const genderAcc: Record<string, number> = {};
  let genderWeight = 0;
  for (const c of components) {
    const w = reachOf(c) || 1;
    const age = parseAge(c.channel.audienceAgeBands);
    if (age) {
      ageWeight += w;
      for (const [k, v] of Object.entries(age)) ageAcc[k] = (ageAcc[k] ?? 0) + v * w;
    }
    const gender = parseGender(c.channel.audienceGenderSplit);
    if (gender) {
      genderWeight += w;
      for (const [k, v] of Object.entries(gender))
        genderAcc[k] = (genderAcc[k] ?? 0) + v * w;
    }
  }
  const ageBands =
    ageWeight > 0
      ? Object.fromEntries(
          Object.entries(ageAcc).map(([k, v]) => [k, round1(v / ageWeight)])
        )
      : null;
  const genderSplit =
    genderWeight > 0
      ? Object.fromEntries(
          Object.entries(genderAcc).map(([k, v]) => [k, round1(v / genderWeight)])
        )
      : null;

  // Geo footprint (union of channel top geos + creator home DMAs).
  const geoSet = new Set<string>();
  for (const c of components) {
    if (c.channel.topGeosDMAs) {
      c.channel.topGeosDMAs
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((g) => geoSet.add(g));
    }
    if (c.creator.homeMarketDMA) geoSet.add(c.creator.homeMarketDMA);
  }

  return {
    componentCount: components.length,
    grossReach: Math.round(grossReach),
    netReach: Math.round(netReach),
    impliedOverlapPct,
    blendedEngagementRate,
    combinedFormats: Array.from(formatSet).sort(),
    demographicComposite: { ageBands, genderSplit },
    geoFootprint: Array.from(geoSet),
    incrementalByChannel,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Incremental net reach a candidate set of components would add to an existing
 * bundle. Used by the recommendation engine to reward low-overlap additions.
 */
export function incrementalReach(
  existing: ResolvedComponent[],
  additions: ResolvedComponent[],
  coef: OverlapCoefficients = DEFAULT_COEFFICIENTS
): number {
  const before = calculateBundleReach(existing, coef).netReach;
  const after = calculateBundleReach([...existing, ...additions], coef).netReach;
  return after - before;
}
