import type { BuyerCreator } from "@/lib/types";

export interface FilterState {
  search: string;
  beats: string[];
  platforms: string[];
  affinities: string[];
  tiers: string[];
  leans: string[];
  formats: string[];
  geo: string | null;
  audienceMin: number;
  audienceMax: number;
  /** "Only show creators who allow this category" (brand-boundary aware). */
  allowedCategory: string | null;
}

export interface FilterOptions {
  beats: string[];
  platforms: string[];
  affinities: string[];
  tiers: string[];
  leans: string[];
  formats: string[];
  geos: string[];
  /** Categories that can appear as no-go/conditional, for the boundary filter. */
  boundaryCategories: string[];
  audienceBounds: [number, number];
}

export function defaultFilters(bounds: [number, number]): FilterState {
  return {
    search: "",
    beats: [],
    platforms: [],
    affinities: [],
    tiers: [],
    leans: [],
    formats: [],
    geo: null,
    audienceMin: bounds[0],
    audienceMax: bounds[1],
    allowedCategory: null,
  };
}

export function buildOptions(creators: BuyerCreator[]): FilterOptions {
  const beats = new Set<string>();
  const platforms = new Set<string>();
  const affinities = new Set<string>();
  const tiers = new Set<string>();
  const leans = new Set<string>();
  const formats = new Set<string>();
  const geos = new Set<string>();
  const boundaryCategories = new Set<string>();
  let maxAudience = 0;

  for (const c of creators) {
    if (c.primaryBeat) beats.add(c.primaryBeat);
    if (c.brandSafetyTier) tiers.add(c.brandSafetyTier);
    if (c.politicalLean) leans.add(c.politicalLean);
    if (c.homeMarketDMA) geos.add(c.homeMarketDMA);
    c.categoryAffinities.forEach((a) => affinities.add(a));
    c.channels.forEach((ch) => {
      if (ch.platform) platforms.add(ch.platform);
      ch.availableAdFormats.forEach((f) => formats.add(f));
      if (ch.audienceSize && ch.audienceSize > maxAudience)
        maxAudience = ch.audienceSize;
    });
    c.brandBoundary?.noGoCategories.forEach((x) => boundaryCategories.add(x));
    c.brandBoundary?.conditionalCategories.forEach((x) =>
      boundaryCategories.add(x)
    );
  }

  const sorted = (s: Set<string>) => Array.from(s).sort();
  return {
    beats: sorted(beats),
    platforms: sorted(platforms),
    affinities: sorted(affinities),
    tiers: ["Premium", "Standard", "Use-with-context"].filter((t) => tiers.has(t)),
    leans: ["Left", "Center-Left", "Center", "Center-Right", "Right", "Nonpartisan"].filter(
      (l) => leans.has(l)
    ),
    formats: sorted(formats),
    geos: sorted(geos),
    boundaryCategories: sorted(boundaryCategories),
    audienceBounds: [0, Math.ceil(maxAudience / 100_000) * 100_000 || 1_000_000],
  };
}

export function creatorMatches(c: BuyerCreator, f: FilterState): boolean {
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${c.name} ${c.bio ?? ""} ${c.primaryBeat ?? ""} ${c.priorOutlets.join(
      " "
    )}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.beats.length && (!c.primaryBeat || !f.beats.includes(c.primaryBeat)))
    return false;
  if (f.tiers.length && (!c.brandSafetyTier || !f.tiers.includes(c.brandSafetyTier)))
    return false;
  if (f.leans.length && (!c.politicalLean || !f.leans.includes(c.politicalLean)))
    return false;
  if (f.geo && c.homeMarketDMA !== f.geo) return false;

  if (
    f.affinities.length &&
    !f.affinities.some((a) => c.categoryAffinities.includes(a))
  )
    return false;

  if (
    f.platforms.length &&
    !c.channels.some((ch) => f.platforms.includes(ch.platform))
  )
    return false;

  if (
    f.formats.length &&
    !c.channels.some((ch) =>
      ch.availableAdFormats.some((x) => f.formats.includes(x))
    )
  )
    return false;

  // Audience range: the creator's largest channel must fall within range.
  const maxAud = Math.max(0, ...c.channels.map((ch) => ch.audienceSize ?? 0));
  if (maxAud < f.audienceMin || maxAud > f.audienceMax) return false;

  // Brand-boundary aware: exclude creators who declared this category no-go.
  if (
    f.allowedCategory &&
    c.brandBoundary?.noGoCategories.some(
      (x) => x.toLowerCase() === f.allowedCategory!.toLowerCase()
    )
  )
    return false;

  return true;
}

export function activeFilterCount(f: FilterState, bounds: [number, number]): number {
  let n = 0;
  if (f.search) n++;
  n += f.beats.length + f.platforms.length + f.affinities.length;
  n += f.tiers.length + f.leans.length + f.formats.length;
  if (f.geo) n++;
  if (f.allowedCategory) n++;
  if (f.audienceMin !== bounds[0] || f.audienceMax !== bounds[1]) n++;
  return n;
}
