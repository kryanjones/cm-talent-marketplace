"use client";

import { useMemo, useState } from "react";
import type { AdvertiserRelationship, BundleComponent, Creator } from "@/lib/types";
import {
  priceDeal,
  primaryFormat,
  COMMISSION_RATE,
  type DealLineInput,
  type Treatment,
} from "@/lib/deal";
import { compactNumber, usd } from "@/lib/format";
import { Eyebrow } from "@/components/ui";

/**
 * Prices a saved buyer bundle under the executed agreement.
 *
 * SALES-ONLY — reads rate cards.
 *
 * There is no commission control here on purpose. MSA §6.1 fixes the rate at
 * 20 / 15 / 0 depending on how the advertiser is treated on that creator's
 * Schedule B, so the rate is looked up, not chosen. What sales does enter is
 * what the contract says varies deal to deal: the advertiser, whatever a media
 * buying agency takes off the top, and the pass-through costs.
 */
export function DealCalculator({
  components,
  creators,
  relationships,
}: {
  components: BundleComponent[];
  creators: Creator[];
  relationships: AdvertiserRelationship[];
}) {
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);

  const [lines, setLines] = useState<DealLineInput[]>(() =>
    components
      .map((comp) => {
        const channel = byId
          .get(comp.creatorId)
          ?.channels.find((ch) => ch.id === comp.channelId);
        const format = channel ? primaryFormat(channel) : null;
        return format
          ? { creatorId: comp.creatorId, channelId: comp.channelId, format, units: 1 }
          : null;
      })
      .filter(Boolean) as DealLineInput[]
  );
  const [advertiser, setAdvertiser] = useState("");
  const [agencyCut, setAgencyCut] = useState(0);
  const [passThroughs, setPassThroughs] = useState(0);

  /**
   * Schedule B lookup. Matches the advertiser by brand or by parent company —
   * the 15% rate follows a hand-it-to-us brand into sibling brands under the
   * same parent, so a match on parent counts.
   */
  const treatments = useMemo(() => {
    const q = advertiser.trim().toLowerCase();
    const out: Record<string, Treatment> = {};
    if (!q) return out;
    for (const rel of relationships) {
      if (!rel.creatorId) continue;
      const brand = rel.brand.trim().toLowerCase();
      const parent = (rel.parentCompany ?? "").trim().toLowerCase();
      const hit = (brand && brand === q) || (parent && parent === q);
      if (!hit) continue;
      if (rel.treatment === "Keep it") out[rel.creatorId] = "Keep it";
      else if (rel.treatment === "Hand it to us" && out[rel.creatorId] !== "Keep it")
        out[rel.creatorId] = "Hand it to us";
    }
    return out;
  }, [advertiser, relationships]);

  const deal = useMemo(
    () => priceDeal(lines, creators, { agencyCut, passThroughs, treatments }),
    [lines, creators, agencyCut, passThroughs, treatments]
  );

  const keepIt = deal.splits.filter((s) => s.treatment === "Keep it");

  function update(index: number, patch: Partial<DealLineInput>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  if (lines.length === 0) {
    return (
      <p className="cm-fine text-ink/50">
        None of these channels carry a rate card, so this bundle cannot be priced yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Advertiser + the two deal-specific deductions */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Advertiser</span>
          <input
            value={advertiser}
            onChange={(e) => setAdvertiser(e.target.value)}
            placeholder="e.g. Patagonia"
            className="cm-sans w-52 border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Agency cut</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={90}
              value={Math.round(agencyCut * 100)}
              onChange={(e) =>
                setAgencyCut(Math.min(90, Math.max(0, Number(e.target.value) || 0)) / 100)
              }
              className="cm-sans w-16 border border-hairline bg-bg px-2 py-2 text-right text-sm outline-none focus:border-ink"
            />
            <span className="cm-fine text-ink/45">%</span>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Pass-throughs</span>
          <input
            type="number"
            min={0}
            value={passThroughs}
            onChange={(e) => setPassThroughs(Math.max(0, Number(e.target.value) || 0))}
            className="cm-sans w-32 border border-hairline bg-bg px-3 py-2 text-right text-sm outline-none focus:border-ink"
          />
        </label>
      </div>
      <p className="cm-fine -mt-2 text-ink/40">
        Agency cut is what a media buying agency retains before the money reaches
        us. Pass-throughs are advertiser-funded costs outside the split — paid
        media, production, travel, gifting.
      </p>

      {/* Placements */}
      <div className="flex flex-col gap-2">
        <Eyebrow>Placements</Eyebrow>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Creator</Th>
                <Th>Format</Th>
                <Th align="right">Units</Th>
                <Th align="right">Reach</Th>
                <Th align="right">Rate card</Th>
              </tr>
            </thead>
            <tbody>
              {deal.lines.map((l, i) => (
                <tr key={l.channelId} className="border-b border-hairline/60">
                  <td className="py-2 pr-3">
                    <span className="cm-sans text-sm font-semibold">{l.creatorName}</span>
                    <span className="cm-fine ml-2 text-ink/45">{l.platform}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={l.format}
                      onChange={(e) => update(i, { format: e.target.value })}
                      className="cm-fine border border-hairline bg-bg px-2 py-1 outline-none focus:border-ink"
                    >
                      {l.availableFormats.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={l.units}
                      onChange={(e) =>
                        update(i, { units: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="cm-fine w-14 border border-hairline bg-bg px-2 py-1 text-right outline-none focus:border-ink"
                    />
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums text-ink/60">
                    {compactNumber(l.reach)}
                  </td>
                  <td className="cm-fine py-2 text-right tabular-nums">
                    {usd(l.gross)}
                    {l.belowFloor && (
                      <span className="ml-2 text-accent">below floor</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* How the money resolves */}
      <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-4">
        <Cell label="Gross placements" value={usd(deal.grossPlacements)} />
        <Cell
          label="Less agency cut"
          value={deal.agencyDeduction ? `− ${usd(deal.agencyDeduction)}` : "—"}
        />
        <Cell
          label="Less pass-throughs"
          value={deal.passThroughs ? `− ${usd(deal.passThroughs)}` : "—"}
        />
        <Cell label="Placement fee" value={usd(deal.placementFee)} accent
          note="the base for commission" />
      </div>
      <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-3">
        <Cell label="Advertiser pays" value={usd(deal.advertiserTotal)}
          note="placements plus pass-throughs" />
        <Cell label="CM commission" value={usd(deal.commission)} />
        <Cell label="To creators" value={usd(deal.creatorTotal)} />
      </div>

      {/* Splits */}
      <div className="flex flex-col gap-2">
        <Eyebrow>Per creator</Eyebrow>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Creator</Th>
                <Th>Treatment</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Placement fee</Th>
                <Th align="right">CM</Th>
                <Th align="right">Creator</Th>
              </tr>
            </thead>
            <tbody>
              {deal.splits.map((s) => (
                <tr key={s.creatorId} className="border-b border-hairline/60">
                  <td className="cm-sans py-2 pr-3 text-sm font-semibold">
                    {s.creatorName}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-ink/60">
                    {s.treatment === "New" ? "New brand" : s.treatment}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums">
                    {Math.round(s.rate * 100)}%
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums text-ink/60">
                    {usd(s.placementFee)}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums">
                    {usd(s.commission)}
                  </td>
                  <td className="cm-fine py-2 text-right tabular-nums">
                    {usd(s.creatorShare)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {keepIt.length > 0 && (
        <p className="cm-fine border border-accent/40 bg-accent/5 px-4 py-3 text-accent">
          {keepIt.map((s) => s.creatorName).join(", ")} —{" "}
          {advertiser.trim() || "this advertiser"} is a keep-it brand. We take no
          commission and must not solicit it; route the enquiry straight to the
          creator.
        </p>
      )}
      {deal.belowFloorCount > 0 && (
        <p className="cm-fine text-warning">
          {deal.belowFloorCount} placement
          {deal.belowFloorCount === 1 ? " is" : "s are"} priced below the
          creator&rsquo;s Schedule C floor. We should not bring a deal at this price.
        </p>
      )}

      <p className="cm-fine text-ink/40">
        Rates are fixed by the agreement — {Math.round(COMMISSION_RATE.New * 100)}%
        for new advertisers, {Math.round(COMMISSION_RATE["Hand it to us"] * 100)}%
        hand-it-to-us, 0% keep-it — and are looked up from Schedule B, not chosen
        here. Commission is calculated on the placement fee only.
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`cm-fine pb-2 font-normal text-ink/45 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Cell({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-bg px-4 py-3">
      <span className="cm-fine text-ink/45">{label}</span>
      <span
        className={`cm-sans text-lg font-bold leading-none tabular-nums ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </span>
      {note && <span className="cm-fine text-ink/35">{note}</span>}
    </div>
  );
}
