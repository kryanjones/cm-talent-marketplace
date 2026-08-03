/**
 * Pure mapping layer: Sarah's "Revenue Tracker & Sales Pipeline" base → the
 * app's domain types.
 *
 * Her CRM is the single source of truth (decided on the Jul 31 call), so this
 * module adapts to HER schema rather than asking her base to look like ours:
 *
 * - There is no Channels table. A creator's channels are synthesized from the
 *   per-platform stat columns (YouTube Subscribers, Newsletter Open Rate Avg,
 *   Podcast Downloads Per Episode, Total Social Reach).
 * - Rate cards come from the Rates table (creator × ad product × price) and are
 *   attached to synthesized channels via each product's platform tags.
 * - Only creators Sarah is actually selling ("Actively Selling" / "Co-Selling")
 *   appear on the marketplace at all.
 *
 * No imports beyond types: everything here is a pure function of records, so it
 * is testable from fixtures without credentials or the "server-only" guard.
 * lib/data/crm.ts owns fetching, caching, and writes.
 */
import type {
  Booking,
  BrandBoundary,
  Campaign,
  Channel,
  Creator,
  RateCard,
} from "@/lib/types";

export interface CrmRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

// ---------- coercion (REST API shapes: names, plain values) ----------

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : String(v);
  return s.trim() ? s.trim() : null;
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : String(x))).filter(Boolean);
}
function linkedIds(v: unknown): string[] {
  return strArr(v).filter((s) => s.startsWith("rec"));
}
function firstAttachmentUrl(v: unknown): string | null {
  if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object") {
    return (v[0] as { url?: string }).url ?? null;
  }
  return null;
}

// ---------- platform vocabulary ----------

/**
 * Her Integration Types tag platforms with emoji-prefixed select names
 * ("► Video (YT)", "🎧 Podcast", "📧 Newsletter", "＠ Social", "🔴 Livestream").
 * Matched by keyword so a renamed emoji doesn't silently drop a rate card.
 */
const PLATFORM_RULES: Array<{ re: RegExp; platform: string }> = [
  { re: /video|yt|youtube/i, platform: "YouTube" },
  { re: /podcast/i, platform: "Podcast" },
  { re: /newsletter/i, platform: "Newsletter" },
  { re: /social/i, platform: "Social" },
  { re: /livestream/i, platform: "Livestream" },
];

export function normalizePlatform(label: string): string | null {
  for (const rule of PLATFORM_RULES) {
    if (rule.re.test(label)) return rule.platform;
  }
  return null;
}

/** The only creators that exist as far as the marketplace is concerned. */
const SELLABLE_AD_SALES = new Set(["Actively Selling", "Co-Selling"]);

export function isSellable(creatorRec: CrmRecord): boolean {
  const adSales = str(creatorRec.fields["CM Ad Sales"]);
  return adSales != null && SELLABLE_AD_SALES.has(adSales);
}

// ---------- rates ----------

export interface CrmProduct {
  id: string;
  name: string;
  platforms: string[]; // normalized
}

export interface CrmRate {
  creatorRecId: string;
  productName: string;
  platforms: string[]; // normalized
  /** null = product listed but unpriced; 0 = free add-on. */
  usd: number | null;
  active: boolean;
}

export function mapProducts(records: CrmRecord[]): Map<string, CrmProduct> {
  const out = new Map<string, CrmProduct>();
  for (const r of records) {
    const name = str(r.fields["Name"]);
    if (!name) continue;
    const platforms = strArr(r.fields["Platforms"])
      .map(normalizePlatform)
      .filter((p): p is string => p != null);
    out.set(r.id, { id: r.id, name, platforms });
  }
  return out;
}

export function mapRates(
  records: CrmRecord[],
  products: Map<string, CrmProduct>
): CrmRate[] {
  const out: CrmRate[] = [];
  for (const r of records) {
    const creatorRecId = linkedIds(r.fields["Creator"])[0];
    if (!creatorRecId) continue; // stray " - " rows with no creator
    const productId = linkedIds(r.fields["Ad Product"])[0];
    const product = productId ? products.get(productId) : undefined;
    if (!product) continue; // rate rows with no product carry no sellable unit
    out.push({
      creatorRecId,
      productName: product.name,
      platforms: product.platforms,
      usd: num(r.fields["Rate"]),
      active: r.fields["Active"] === true,
    });
  }
  return out;
}

// ---------- channel synthesis ----------

function percentString(v: number | null): string | null {
  if (v == null) return null;
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Build the creator's channels from her per-platform stat columns, then attach
 * formats and rate cards from the Rates rows whose product platforms match.
 * A product tagged for a platform the creator has no stats for (e.g. a
 * livestream shout-out) still creates a channel — with honest nulls — because
 * a priced product IS sellable inventory even when we hold no audience figure.
 */
export function synthesizeChannels(
  rec: CrmRecord,
  rates: CrmRate[]
): Channel[] {
  const f = rec.fields;
  const name = str(f["Creator Talent"]) ?? "";
  const active = rates.filter((r) => r.active);

  const defs: Array<{
    key: string;
    platform: string;
    audienceSize: number | null;
    avgReachPerUnit: number | null;
    avgEngagementRate: number | null;
    formatMetricLabel: string | null;
    formatMetricValue: string | null;
    handleUrl: string | null;
  }> = [];

  const ytSubs = num(f["YouTube Subscribers"]);
  if (ytSubs != null && ytSubs > 0) {
    defs.push({
      key: "yt",
      platform: "YouTube",
      audienceSize: ytSubs,
      avgReachPerUnit: num(f["YouTube Avg. Views/Video"]),
      avgEngagementRate: num(f["YouTube Engagement Rate"]),
      formatMetricLabel: "CTR",
      formatMetricValue: percentString(num(f["YouTube CTR"])),
      handleUrl: str(f["YouTube Channel"]),
    });
  }

  const nlSubs = num(f["Newsletter Subscribers"]);
  if (nlSubs != null && nlSubs > 0) {
    const openRate = num(f["Newsletter Open Rate Avg"]);
    defs.push({
      key: "nl",
      platform: "Newsletter",
      audienceSize: nlSubs,
      // Reach per send is what an advertiser actually buys: subscribers who open.
      avgReachPerUnit: openRate != null ? Math.round(nlSubs * openRate) : nlSubs,
      avgEngagementRate: openRate,
      formatMetricLabel: "Open rate",
      formatMetricValue: percentString(openRate),
      handleUrl: str(f["Newsletter Link"]),
    });
  }

  const podDownloads = num(f["Podcast Downloads Per Episode"]);
  if (podDownloads != null && podDownloads > 0) {
    defs.push({
      key: "pod",
      platform: "Podcast",
      audienceSize: podDownloads,
      avgReachPerUnit: podDownloads,
      avgEngagementRate: null,
      formatMetricLabel: "Downloads / episode",
      formatMetricValue: String(podDownloads),
      handleUrl: str(f["Podcast link"]),
    });
  }

  const socialReach = num(f["Total Social Reach"]);
  if (socialReach != null && socialReach > 0) {
    defs.push({
      key: "social",
      platform: "Social",
      audienceSize: Math.round(socialReach),
      avgReachPerUnit: null,
      avgEngagementRate: null,
      formatMetricLabel: null,
      formatMetricValue: null,
      handleUrl: null,
    });
  }

  // Platforms that only exist because a priced product points at them.
  const covered = new Set(defs.map((d) => d.platform));
  for (const rate of active) {
    for (const p of rate.platforms) {
      if (!covered.has(p)) {
        covered.add(p);
        defs.push({
          key: p.toLowerCase(),
          platform: p,
          audienceSize: null,
          avgReachPerUnit: null,
          avgEngagementRate: null,
          formatMetricLabel: null,
          formatMetricValue: null,
          handleUrl: null,
        });
      }
    }
  }

  return defs.map((d) => {
    // A product belongs on this channel when it is tagged for the platform.
    // Products with no platform tags land on the creator's first channel so
    // they stay visible somewhere rather than vanishing.
    const mine = active.filter((r) =>
      r.platforms.length === 0
        ? d === defs[0]
        : r.platforms.includes(d.platform)
    );
    const rateCard: RateCard = {};
    for (const r of mine) {
      // Unpriced ($—) and free add-on ($0) products are listed as formats but
      // kept out of the rate card: a $0 entry would price into bundles as free.
      if (r.usd != null && r.usd > 0) {
        rateCard[r.productName] = { type: "flat", usd: r.usd };
      }
    }
    return {
      id: `${rec.id}::${d.key}`,
      channelName: `${name} — ${d.platform}`,
      creatorId: rec.id,
      creatorName: name,
      platform: d.platform,
      handleUrl: d.handleUrl,
      audienceSize: d.audienceSize,
      avgEngagementRate: d.avgEngagementRate,
      avgReachPerUnit: d.avgReachPerUnit,
      formatMetricLabel: d.formatMetricLabel,
      formatMetricValue: d.formatMetricValue,
      audienceAgeBands: null,
      audienceGenderSplit: null,
      topGeosDMAs: null,
      audienceIncomeIndex: null,
      audienceEducationIndex: null,
      availableAdFormats: mine.map((r) => r.productName),
      inventorySlotsPerMonth: null,
      leadTimeDays: null,
      rateCard: Object.keys(rateCard).length ? rateCard : null,
      talentReadOK: true,
    } satisfies Channel;
  });
}

// ---------- creator ----------

export function mapCrmCreator(
  rec: CrmRecord,
  rates: CrmRate[]
): Creator | null {
  const f = rec.fields;
  const name = str(f["Creator Talent"]);
  if (!name || !isSellable(rec)) return null;

  const boundary: BrandBoundary = {
    id: `${rec.id}::boundary`,
    creatorId: rec.id,
    creatorName: name,
    noGoCategories: strArr(f["(RED) Restricted Categories"]),
    conditionalCategories: strArr(f["YELLOW (Case by Case Categories)"]),
    // "Brand No-Nos (notes)" is marked internal in her schema, so it is NOT
    // surfaced as conditionsNotes (which buyers see in the expanded card).
    conditionsNotes: null,
    pastBrandPartners: str(f["Existing Brand Relationships"]), // sales-only
    activeExclusivities: str(f["Current Deals & Conflicts"]), // sales-only
    categoryExclusivityAvailable: false,
  };

  return {
    id: rec.id,
    name,
    personaType: null,
    isDemoPersona: false,
    bio: str(f["Bio/Background"]),
    positioning: str(f["Positioning"]), // null until the field is added
    featuredPartnerships: str(f["Featured Partnerships"]),
    teamEmail: str(f["Creator's Biz Lead Email"]) ?? str(f["Talent Email"]),
    agreementStatus:
      (str(f["Agreement Status"]) as Creator["agreementStatus"]) ?? null,
    agreementSignedDate: str(f["Agreement Signed Date"]),
    agreementEnvelopeId: str(f["Agreement Envelope ID"]),
    priceFloor: num(f["Price Floor"]),
    priorOutlets: [],
    primaryBeat: strArr(f["Content Niche"])[0] ?? null,
    homeMarketDMA: null,
    trustSignals: [],
    politicalLean: null,
    brandSafetyTier: null,
    categoryAffinities: strArr(f["Advertiser Category Fit"]),
    status: "Active",
    applicationFeePaid: true,
    dateApproved: null,
    headshot: firstAttachmentUrl(f["Images"]),
    channels: synthesizeChannels(rec, rates),
    brandBoundary: boundary,
  } satisfies Creator;
}

// ---------- deals → campaigns, deliverables → bookings ----------

export function isCmDeal(dealRec: CrmRecord): boolean {
  return dealRec.fields["NOT a CM Deal!"] !== true;
}

function monthKey(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function mapDealToCampaign(
  rec: CrmRecord,
  companyNameById: Map<string, string>
): Campaign {
  const f = rec.fields;
  const companyId = linkedIds(f["Company Name"])[0];
  const advertiser =
    (companyId ? companyNameById.get(companyId) : null) ?? "Unknown advertiser";
  return {
    id: rec.id,
    name: str(f["Campaign Name"]) ?? str(f["Deal Name"]) ?? advertiser,
    advertiser,
    status: str(f["Stage"]) ?? "—",
    startMonth: monthKey(f["Campaign Flight Start"]),
    endMonth: monthKey(f["Campaign Flight End"]),
    contractedReach: null,
    notes: str(f["Campaign Details"]),
  };
}

/**
 * One Deliverable = one placement. The channel is resolved through the
 * deliverable's Integration Type platforms against the creator's synthesized
 * channels; an unmatched platform falls back to the creator's first channel so
 * the placement still counts against SOMEONE's inventory.
 */
export function mapDeliverableToBooking(
  rec: CrmRecord,
  products: Map<string, CrmProduct>,
  channelsByCreatorRec: Map<string, Channel[]>,
  brandByDealId: Map<string, string>
): Booking {
  const f = rec.fields;
  const creatorRecId = linkedIds(f["Creator"])[0] ?? null;
  const productId = linkedIds(f["Integration Type"])[0];
  const product = productId ? products.get(productId) : undefined;
  const channels = creatorRecId
    ? channelsByCreatorRec.get(creatorRecId) ?? []
    : [];
  const channel =
    channels.find((c) => product?.platforms.includes(c.platform)) ??
    channels[0] ??
    null;
  const dealId = linkedIds(f["Deal"])[0] ?? null;
  const live = f["Live"] === true;
  const runDate = str(f["Run Date"]);
  return {
    id: rec.id,
    channelId: channel?.id ?? null,
    brand: (dealId ? brandByDealId.get(dealId) : null) ?? null,
    month: monthKey(runDate),
    slots: 1,
    status: "Confirmed",
    campaignId: dealId,
    liveUrl: str(f["Live Link"]),
    publishedDate: live ? runDate : null,
    impressions: num(f["Delivered Impressions"]),
    clicks: num(f["Delivered Clicks"]),
    deliveryNotes: str(f["Notes"]),
    linkCode: null,
    destinationUrl: null,
  };
}

/**
 * Schedule B, derived rather than maintained: a deal flagged "NOT a CM Deal!"
 * is a relationship the creator brought and keeps — by the MSA's own
 * definition a "Keep it" brand (0%, do not solicit). One row per
 * creator × company on such deals.
 */
export function deriveKeepItRelationships(
  deals: CrmRecord[],
  companyNameById: Map<string, string>
): Array<{
  id: string;
  creatorId: string | null;
  brand: string;
  parentCompany: string | null;
  treatment: string;
  lastDealDate: string | null;
  notes: string | null;
}> {
  const out: ReturnType<typeof deriveKeepItRelationships> = [];
  for (const deal of deals) {
    if (isCmDeal(deal)) continue;
    const brandId = linkedIds(deal.fields["Company Name"])[0];
    const brand = brandId ? companyNameById.get(brandId) : null;
    if (!brand) continue;
    const creatorIds = linkedIds(deal.fields["Creators"]);
    for (const creatorId of creatorIds.length ? creatorIds : [null]) {
      out.push({
        id: `${deal.id}::${creatorId ?? "unassigned"}`,
        creatorId,
        brand,
        parentCompany: null,
        treatment: "Keep it",
        lastDealDate: str(deal.fields["Campaign Flight End"]),
        notes: "Derived from a non-CM deal in the CRM.",
      });
    }
  }
  return out;
}
