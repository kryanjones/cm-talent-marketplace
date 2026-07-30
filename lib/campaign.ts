/**
 * Campaign delivery and wrap reporting.
 *
 * The one rule this module exists to enforce: a missing metric is UNKNOWN, not
 * zero. Nothing collects impressions or clicks automatically — they are entered
 * from platform dashboards or reported by creators — so treating a blank as 0
 * would silently understate every campaign and make a half-measured buy look
 * like a failed one. Totals therefore always travel with the count of
 * placements they were actually derived from.
 */
import type { Booking, Campaign, Creator } from "@/lib/types";

export interface PlacementRow {
  bookingId: string;
  creatorId: string | null;
  creatorName: string;
  platform: string;
  month: string | null;
  publishedDate: string | null;
  liveUrl: string | null;
  slots: number;
  impressions: number | null;
  clicks: number | null;
  /** Where the click figure came from — tracked links are measured by us. */
  clickSource: "tracked" | "reported" | null;
  linkCode: string | null;
  deliveryNotes: string | null;
  /** Live once it has a URL and a published date. */
  isLive: boolean;
}

export interface CampaignReport {
  campaign: Campaign;
  placements: PlacementRow[];
  creatorCount: number;
  placementCount: number;
  livePlacements: number;
  /** Sum of entered impressions, and how many placements contributed. */
  impressions: number;
  impressionsReported: number;
  clicks: number;
  clicksReported: number;
  /** Clicks ÷ impressions, but only across placements reporting BOTH. */
  clickRate: number | null;
  /** Delivered vs. what was quoted, when a contracted figure exists. */
  deliveryVsContracted: number | null;
  /** True when some placements have no figures — reporting is incomplete. */
  partiallyMeasured: boolean;
}

export function buildReport(
  campaign: Campaign,
  bookings: Booking[],
  creators: Creator[],
  /** code → clicks, from our own redirect. Beats a hand-entered figure. */
  trackedClicks: Record<string, number> = {}
): CampaignReport {
  const creatorByChannel = new Map<string, Creator>();
  for (const c of creators) {
    for (const ch of c.channels) creatorByChannel.set(ch.id, c);
  }
  const platformByChannel = new Map<string, string>();
  for (const c of creators) {
    for (const ch of c.channels) platformByChannel.set(ch.id, ch.platform);
  }

  const mine = bookings.filter((b) => b.campaignId === campaign.id);

  const placements: PlacementRow[] = mine.map((b) => {
    const creator = b.channelId ? creatorByChannel.get(b.channelId) : undefined;
    const tracked = b.linkCode ? trackedClicks[b.linkCode] : undefined;
    return {
      bookingId: b.id,
      creatorId: creator?.id ?? null,
      creatorName: creator?.name ?? "Unknown creator",
      platform: (b.channelId && platformByChannel.get(b.channelId)) || "—",
      month: b.month,
      publishedDate: b.publishedDate,
      liveUrl: b.liveUrl,
      slots: b.slots,
      impressions: b.impressions,
      // A tracked count is measured rather than transcribed, so it wins.
      clicks: tracked ?? b.clicks,
      clickSource: tracked != null ? "tracked" : b.clicks != null ? "reported" : null,
      linkCode: b.linkCode,
      deliveryNotes: b.deliveryNotes,
      isLive: Boolean(b.liveUrl && b.publishedDate),
    };
  });

  const withImpressions = placements.filter((p) => p.impressions != null);
  const withClicks = placements.filter((p) => p.clicks != null);
  // Click rate only over placements reporting BOTH numbers — dividing a
  // partial click total by a partial impression total invents a rate.
  const withBoth = placements.filter(
    (p) => p.impressions != null && p.clicks != null
  );

  const impressions = withImpressions.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const clicks = withClicks.reduce((s, p) => s + (p.clicks ?? 0), 0);
  const bothImpressions = withBoth.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const bothClicks = withBoth.reduce((s, p) => s + (p.clicks ?? 0), 0);

  return {
    campaign,
    placements,
    creatorCount: new Set(placements.map((p) => p.creatorId).filter(Boolean)).size,
    placementCount: placements.length,
    livePlacements: placements.filter((p) => p.isLive).length,
    impressions,
    impressionsReported: withImpressions.length,
    clicks,
    clicksReported: withClicks.length,
    clickRate: bothImpressions > 0 ? bothClicks / bothImpressions : null,
    deliveryVsContracted:
      campaign.contractedReach && campaign.contractedReach > 0 && withImpressions.length
        ? impressions / campaign.contractedReach
        : null,
    partiallyMeasured:
      placements.length > 0 && withImpressions.length < placements.length,
  };
}

/**
 * Observations worth putting in front of a human — deliberately not
 * "recommendations". These are arithmetic on entered data, and the wrap report
 * is explicitly a human-plus-machine document, so the software says what it can
 * see and leaves the strategy to whoever writes the recap.
 */
export function observations(r: CampaignReport): string[] {
  const out: string[] = [];
  if (r.placementCount === 0) return ["No placements attached to this campaign yet."];

  if (r.livePlacements < r.placementCount) {
    out.push(
      `${r.placementCount - r.livePlacements} of ${r.placementCount} placements have no live link or publish date recorded.`
    );
  }
  if (r.partiallyMeasured) {
    out.push(
      `Performance is recorded for ${r.impressionsReported} of ${r.placementCount} placements — totals below cover only those.`
    );
  }
  if (r.deliveryVsContracted != null) {
    const pct = Math.round(r.deliveryVsContracted * 100);
    out.push(
      pct >= 100
        ? `Delivered ${pct}% of the reach quoted to the advertiser.`
        : `Delivered ${pct}% of the reach quoted so far${
            r.partiallyMeasured ? ", on partial reporting" : ""
          }.`
    );
  }
  // Per-placement outliers, only where there is enough to compare against.
  const measured = r.placements.filter((p) => p.impressions != null);
  if (measured.length >= 3) {
    const mean = measured.reduce((s, p) => s + (p.impressions ?? 0), 0) / measured.length;
    const best = measured.reduce((a, b) => ((b.impressions ?? 0) > (a.impressions ?? 0) ? b : a));
    const worst = measured.reduce((a, b) => ((b.impressions ?? 0) < (a.impressions ?? 0) ? b : a));
    if ((best.impressions ?? 0) > mean * 1.5) {
      out.push(
        `${best.creatorName} on ${best.platform} is the strongest placement, well above the campaign average.`
      );
    }
    if ((worst.impressions ?? 0) < mean * 0.5) {
      out.push(
        `${worst.creatorName} on ${worst.platform} is running well below the campaign average — worth a look before the next flight.`
      );
    }
  }
  const zeroClicks = r.placements.filter(
    (p) => p.clicks === 0 && (p.impressions ?? 0) > 0
  );
  if (zeroClicks.length) {
    out.push(
      `${zeroClicks.map((p) => `${p.creatorName} (${p.platform})`).join(", ")} recorded impressions but no clicks — worth checking the link or call to action.`
    );
  }
  return out;
}

/** The launch email: what went live, and where to see it. */
export function launchEmail(r: CampaignReport): { subject: string; body: string } {
  const live = r.placements.filter((p) => p.isLive);
  const lines = live
    .map(
      (p) =>
        `- ${p.creatorName} — ${p.platform}${
          p.publishedDate ? ` (live ${p.publishedDate})` : ""
        }\n  ${p.liveUrl}`
    )
    .join("\n");
  const body =
    `Hi,\n\n` +
    `${r.campaign.name} is live. Here is everything that has published so far:\n\n` +
    `${lines || "Nothing has published yet."}\n\n` +
    `${live.length} of ${r.placementCount} placements are live across ` +
    `${r.creatorCount} creator${r.creatorCount === 1 ? "" : "s"}. ` +
    `We will follow up with performance once the numbers settle, and send a full ` +
    `wrap at the end of the flight.\n\n` +
    `Collective Media`;
  return { subject: `${r.campaign.name} — live links`, body };
}
