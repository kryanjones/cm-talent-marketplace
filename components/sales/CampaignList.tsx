"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Booking, Campaign, Creator } from "@/lib/types";
import { buildReport } from "@/lib/campaign";
import { compactNumber } from "@/lib/format";
import { Chip, Eyebrow } from "@/components/ui";

const STATUS_TONE: Record<string, string> = {
  Live: "text-success",
  Planned: "text-ink/50",
  Complete: "text-info",
  Cancelled: "text-accent",
};

export function CampaignList({
  campaigns,
  bookings,
  creators,
  trackedClicks,
}: {
  campaigns: Campaign[];
  bookings: Booking[];
  creators: Creator[];
  trackedClicks: Record<string, number>;
}) {
  const reports = useMemo(
    () => campaigns.map((c) => buildReport(c, bookings, creators, trackedClicks)),
    [campaigns, bookings, creators, trackedClicks]
  );

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-10">
        <Eyebrow>Campaigns</Eyebrow>
        <p className="cm-body max-w-2xl text-ink/55">
          No campaigns yet. Create one in the Campaigns table in Airtable, then
          link its placements by setting the Campaign field on the relevant
          Bookings rows — a booking already holds the inventory, so linking it
          turns it into a tracked placement.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <Eyebrow>
        {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
      </Eyebrow>
      {reports.map((r) => (
        <div key={r.campaign.id} className="border border-hairline p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="cm-h3 font-bold">
                {r.campaign.name || r.campaign.advertiser}
              </h3>
              <p className="cm-fine mt-1 text-ink/50">
                {r.campaign.advertiser}
                {r.campaign.startMonth ? ` · ${r.campaign.startMonth}` : ""}
                {r.campaign.endMonth ? ` – ${r.campaign.endMonth}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`cm-label ${STATUS_TONE[r.campaign.status] ?? "text-ink/50"}`}
              >
                {r.campaign.status}
              </span>
              <Link
                href={`/campaign/${r.campaign.id}`}
                className="cm-label text-accent underline-offset-4 hover:underline"
              >
                Wrap report →
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <Stat label="Creators" v={String(r.creatorCount)} />
            <Stat label="Live" v={`${r.livePlacements} of ${r.placementCount}`} />
            <Stat
              label="Impressions"
              v={r.impressionsReported ? compactNumber(r.impressions) : "—"}
              accent={r.impressionsReported > 0}
            />
            <Stat
              label="Delivery"
              v={
                r.deliveryVsContracted != null
                  ? `${Math.round(r.deliveryVsContracted * 100)}%`
                  : "—"
              }
            />
          </div>

          {r.partiallyMeasured && (
            <p className="cm-fine mt-3 text-warning">
              {r.impressionsReported} of {r.placementCount} placements have figures
              recorded — the rest are unmeasured, not zero.
            </p>
          )}
          {r.placementCount === 0 && (
            <div className="mt-3">
              <Chip tone="muted">No placements linked yet</Chip>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, v, accent }: { label: string; v: string; accent?: boolean }) {
  return (
    <div>
      <span className="cm-fine text-ink/45">{label}</span>
      <p className={`cm-sans text-lg font-bold tabular-nums ${accent ? "text-accent" : ""}`}>
        {v}
      </p>
    </div>
  );
}
