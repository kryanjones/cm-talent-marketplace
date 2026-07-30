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

/** Master representation agreement state. Only "Signed" clears a creator to sell. */
export type AgreementStatus = "Not sent" | "Sent" | "Signed" | "Declined";

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
  /**
   * Cleared, client-facing partnership examples — the ONLY partner data that is
   * safe to publish. Distinct from BrandBoundary.pastBrandPartners, which is the
   * raw internal record and stays sales-only: some advertisers treat their
   * creator spend as confidential, so a brand appears publicly only when
   * somebody deliberately adds it to this field.
   *
   * Optional; the "Featured Partnerships" column does not exist in the base yet.
   * One entry per line, or comma-separated. A line may carry a short note after
   * an em dash or pipe, e.g. "Delta — three-part travel series".
   */
  featuredPartnerships: string | null;
  /**
   * Where pitch-approval requests go — the creator's manager or team address.
   * INTERNAL. Stripped by toBuyerCreator: a contact address is not something a
   * buyer should be able to lift out of the page source.
   */
  teamEmail: string | null;
  /**
   * Master representation agreement — the authority to sell on this creator's
   * behalf. Under the agency model this is the thing that makes a pitch legal:
   * without a signed agreement we are not their agent and cannot commit their
   * inventory to a brand. INTERNAL.
   */
  agreementStatus: AgreementStatus | null;
  agreementSignedDate: string | null;
  /** DocuSign envelope, once the agreement has been sent for signature. */
  agreementEnvelopeId: string | null;
  /**
   * Schedule C price floor, per placement. Below this we do not bring the
   * creator a deal at all (MSA §4.3). Null means no floor set. INTERNAL.
   */
  priceFloor: number | null;
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

/**
 * One booked (or held) placement against a channel's monthly inventory.
 *
 * Capacity already exists per channel as `Inventory Slots Per Month`; this is
 * the other half — what has actually been taken. Lives in an optional
 * "Bookings" table. Until that table exists the app reports capacity with
 * nothing booked, which is honest: we do not know of any bookings.
 */
export interface Booking {
  id: string;
  channelId: string | null;
  /** Advertiser the slot is held for. */
  brand: string | null;
  /** Any date inside the booked month; normalised to a YYYY-MM key. */
  month: string | null;
  slots: number;
  /** Held is provisional, Confirmed is sold. Both consume inventory. */
  status: "Held" | "Confirmed" | string;
}

/**
 * One row of a creator's Schedule B — a pre-existing advertiser relationship
 * and how it is treated. Absent from this list means a new brand at 20%.
 */
export interface AdvertiserRelationship {
  id: string;
  creatorId: string | null;
  brand: string;
  parentCompany: string | null;
  /** "Keep it" (0%, do not solicit) or "Hand it to us" (15%). */
  treatment: string;
  lastDealDate: string | null;
  notes: string | null;
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

/**
 * Public-facing creator: rate cards, the team contact address, and the
 * sales-only boundary fields are all removed.
 */
export type BuyerCreator = Omit<
  Creator,
  | "channels"
  | "brandBoundary"
  | "teamEmail"
  | "agreementStatus"
  | "agreementSignedDate"
  | "agreementEnvelopeId"
  | "priceFloor"
> & {
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
