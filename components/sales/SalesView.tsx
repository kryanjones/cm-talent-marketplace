"use client";

import { useState } from "react";
import type {
  AdvertiserRelationship,
  Campaign,
  Booking,
  Creator,
  OverlapAssumption,
  SavedBundle,
} from "@/lib/types";
import { InventoryTable } from "./InventoryTable";
import { VettingQueue } from "./VettingQueue";
import { SavedBundles } from "./SavedBundles";
import { CampaignList } from "./CampaignList";

type Tab = "inventory" | "applications" | "bundles" | "campaigns";

export function SalesView({
  active,
  pending,
  bundles,
  overlap,
  bookings,
  relationships,
  campaigns,
}: {
  active: Creator[];
  pending: Creator[];
  bundles: SavedBundle[];
  overlap: OverlapAssumption[];
  bookings: Booking[];
  relationships: AdvertiserRelationship[];
  campaigns: Campaign[];
}) {
  const [tab, setTab] = useState<Tab>("inventory");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "inventory", label: "Inventory", count: active.length },
    { id: "applications", label: "Applications", count: pending.length },
    { id: "bundles", label: "Saved bundles", count: bundles.length },
    { id: "campaigns", label: "Campaigns", count: campaigns.length },
  ];

  return (
    <div className="mx-auto max-w-content px-6">
      <section className="border-b border-hairline py-10">
        <span className="cm-rule-red mb-4" />
        <h1 className="cm-title">Sales desk</h1>
        <p className="cm-body mt-3 max-w-2xl text-ink/60">
          Full inventory with rate cards and availability, the application vetting
          queue, and the bundles buyers are assembling.
        </p>
      </section>

      <nav className="flex gap-1 border-b border-hairline">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`cm-label px-4 py-3 transition-colors duration-micro ${
              tab === t.id ? "text-ink" : "text-ink/45 hover:text-ink"
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1.5 text-accent">{t.count}</span>}
            {tab === t.id && <span className="cm-rule-red mt-2 h-[3px] w-full" />}
          </button>
        ))}
      </nav>

      {tab === "inventory" && (
        <InventoryTable creators={active} bookings={bookings} />
      )}
      {tab === "applications" && <VettingQueue pending={pending} />}
      {tab === "campaigns" && (
        <CampaignList
          campaigns={campaigns}
          bookings={bookings}
          creators={active}
        />
      )}
      {tab === "bundles" && (
        <SavedBundles
          bundles={bundles}
          creators={active}
          overlap={overlap}
          relationships={relationships}
        />
      )}
    </div>
  );
}
