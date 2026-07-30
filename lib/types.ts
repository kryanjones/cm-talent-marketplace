/**
 * Domain types for the Talent Marketplace.
 *
 * These are the app's contract. The data layer (lib/data) maps either the live
 * Airtable base or the local seed dataset into these shapes, so components and
 * business logic never depend on the backend.
 */

export type Platform =
  | "YouTube"
  | "Newsletter"
  | "Podcast"
  | "Instagram"
  | "TikTok"
  | "X"
  | "LinkedIn"
  | "Substack";

export type PoliticalLean =
  | "Left"
  | "Center-Left"
  | "Center"
  | "Center-Right"
  | "Right"
  | "Nonpartisan";

export type BrandSafetyTier = "Premium" | "Standard" | "Use-with-context";

export type CreatorStatus = "Active" | "Pending Review" | "Rejected";

export interface AgeBands {
  [band: string]: number; // e.g. { "18-24": 6, "25-34": 18, ... } percentages
}

export interface GenderSplit {
  [key: string]: number; // e.g. { "F": 53, "M": 45, "Other": 2 }
}

export type RateCardEntry =
  | { type: "flat"; usd: number }
  | { type: "cpm"; usd: number };

export interface RateCard {
  [format: string]: RateCardEntry;
}

export interface Channel {
  id: string;
  channelName: string;
  creatorId: string | null;
  creatorName: string;
  platform: Platform | string;
  handleUrl: string | null;
  audienceSize: number | null;
  /** Stored as a fraction (0.0469 = 4.69%). */
  avgEngagementRate: number | null;
  avgReachPerUnit: number | null;
  formatMetricLabel: string | null;
  formatMetricValue: string | null;
  audienceAgeBands: AgeBands | string | null;
  audienceGenderSplit: GenderSplit | string | null;
  topGeosDMAs: string | null;
  audienceIncomeIndex: string | null;
  audienceEducationIndex: string | null;
  availableAdFormats: string[];
  inventorySlotsPerMonth: number | null;
  leadTimeDays: number | null;
  /** Sales-view only. Stripped before reaching the buyer client. */
  rateCard: RateCard | string | null;
  talentReadOK: boolean;
}

export interface Creator {
  id: string;
  name: string;
  personaType: string | null;
  isDemoPersona: boolean;
  bio: string | null;
  /**
   * Human-written sales positioning for the media kit. Optional: the field does
   * not exist in the base yet, so this is null until someone adds a
   * "Positioning" long-text column to Creators. The media kit falls back to Bio.
   * Deliberately not automated — sales owns this copy.
   */
  positioning: string | null;
  priorOutlets: string[];
  primaryBeat: string | null;
  homeMarketDMA: string | null;
  trustSignals: string[];
  politicalLean: PoliticalLean | string | null;
  brandSafetyTier: BrandSafetyTier | string | null;
  categoryAffinities: string[];
  status: CreatorStatus | string;
  applicationFeePaid: boolean;
  dateApproved: string | null;
  headshot: string | null;
  channels: Channel[];
  brandBoundary: BrandBoundary | null;
}

export interface BrandBoundary {
  id: string;
  creatorId: string | null;
  creatorName: string;
  noGoCategories: string[];
  conditionalCategories: string[];
  conditionsNotes: string | null;
  /** Sales-view detail. */
  pastBrandPartners: string | null;
  /** Sales-view detail. */
  activeExclusivities: string | null;
  categoryExclusivityAvailable: boolean;
}

export type OverlapScenario =
  | "Same Creator Cross-Platform"
  | "Same Category Cross-Creator"
  | "Cross-Category Cross-Creator";

export interface OverlapAssumption {
  scenario: OverlapScenario | string;
  /** Fraction, e.g. 0.3 = 30% overlap. */
  overlapCoefficient: number;
}

/** A single selected item in a bundle: a specific channel of a creator. */
export interface BundleComponent {
  creatorId: string;
  channelId: string;
}

export interface SavedBundle {
  id?: string;
  bundleName: string;
  createdBy: string;
  components: BundleComponent[];
  createdAt: string;
}

/** Public-facing creator: rate cards and sales-only boundary fields removed. */
export type BuyerCreator = Omit<Creator, "channels" | "brandBoundary"> & {
  channels: Omit<Channel, "rateCard">[];
  brandBoundary: Omit<
    BrandBoundary,
    "pastBrandPartners" | "activeExclusivities"
  > | null;
};

/** Payload submitted by the public creator application flow. */
export interface CreatorApplication {
  name: string;
  bio: string;
  primaryBeat: string;
  homeMarketDMA: string;
  priorOutlets: string;
  categoryAffinities: string;
  politicalLean: string;
  channels: {
    platform: string;
    handleUrl: string;
    audienceSize: number;
    avgReachPerUnit: number;
  }[];
  noGoCategories: string;
  conditionalCategories: string;
}
