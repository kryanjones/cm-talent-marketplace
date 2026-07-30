"use client";

import { useMemo, useState } from "react";
import type { BundleComponent, Creator } from "@/lib/types";
import {
  priceDeal,
  primaryFormat,
  type DealLineInput,
  type PricingModel,
} from "@/lib/deal";
import { compactNumber, usd } from "@/lib/format";
import { Eyebrow, Pill } from "@/components/ui";

const TAKE_RATES = [0.2, 0.25, 0.3, 0.35, 0.4];
const PREMIUMS = [0, 0.1, 0.2, 0.3];

/**
 * Prices a saved buyer bundle and shows how the money divides.
 *
 * SALES-ONLY — reads rate cards. Cost-up is the default because it is what we
 * can explain to a creator in one sentence: you are paid your rate for what you
 * sold. The floor+premium model is available for when a bundle sells above the
 * sum of its parts; it never pays anyone below their rate card, so the only
 * thing dividing on performance is the premium itself.
 */
export function DealCalculator({
  components,
  creators,
}: {
  components: BundleComponent[];
  creators: Creator[];
}) {
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);

  // Start each line at the channel's marquee format, one unit. Sales adjusts
  // format and units from there before quoting.
  const [lines, setLines] = useState<DealLineInput[]>(() =>
    components
      .map((comp) => {
        const channel = byId.get(comp.creatorId)?.channels.find(
          (ch) => ch.id === comp.channelId
        );
        const format = channel ? primaryFormat(channel) : null;
        return format
          ? { creatorId: comp.creatorId, channelId: comp.channelId, format, units: 1 }
          : null;
      })
      .filter(Boolean) as DealLineInput[]
  );
  const [takeRate, setTakeRate] = useState(0.3);
  const [premium, setPremium] = useState(0);
  const [model, setModel] = useState<PricingModel>("cost-up");

  const deal = useMemo(
    () => priceDeal(lines, creators, { takeRate, premium }),
    [lines, creators, takeRate, premium]
  );

  const usingPremium = model === "floor-premium" && premium > 0;
  const gross = usingPremium ? deal.grossWithPremium : deal.grossCostUp;
  const cmCut = usingPremium ? deal.cmCutWithPremium : deal.cmCutCostUp;

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
      {/* Placements */}
      <div className="flex flex-col gap-2">
        <Eyebrow>Placements</Eyebrow>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Creator</Th>
                <Th>Format</Th>
                <Th align="right">Units</Th>
                <Th align="right">Reach</Th>
                <Th align="right">Qual</Th>
                <Th align="right">Rate card</Th>
              </tr>
            </thead>
            <tbody>
              {deal.lines.map((l, i) => (
                <tr key={l.channelId} className="border-b border-hairline/60">
                  <td className="py-2 pr-3">
                    <span className="cm-sans text-sm font-semibold">
                      {l.creatorName}
                    </span>
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
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums text-ink/60">
                    {l.weight.toFixed(2)}
                  </td>
                  <td className="cm-fine py-2 text-right tabular-nums">
                    {usd(l.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cm-fine text-ink/40">
          Qual is engagement divided by that platform&rsquo;s average. 1.00 is
          typical for the surface.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cm-fine w-24 text-ink/45">CM take</span>
          {TAKE_RATES.map((r) => (
            <Pill key={r} active={takeRate === r} onClick={() => setTakeRate(r)}>
              {Math.round(r * 100)}%
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cm-fine w-24 text-ink/45">Model</span>
          <Pill active={model === "cost-up"} onClick={() => setModel("cost-up")}>
            Cost-up
          </Pill>
          <Pill
            active={model === "floor-premium"}
            onClick={() => setModel("floor-premium")}
          >
            Floor + premium
          </Pill>
        </div>
        {model === "floor-premium" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="cm-fine w-24 text-ink/45">Premium</span>
            {PREMIUMS.map((p) => (
              <Pill key={p} active={premium === p} onClick={() => setPremium(p)}>
                {Math.round(p * 100)}%
              </Pill>
            ))}
          </div>
        )}
      </div>

      {/* Deal */}
      <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-4">
        <Cell label="Creator cost" value={usd(deal.creatorTotal)} />
        <Cell label="CM cut" value={usd(cmCut)} note={`${Math.round(takeRate * 100)}% of gross`} />
        <Cell label="Brand pays" value={usd(gross)} accent />
        <Cell
          label={usingPremium ? "Premium to split" : "Nothing to split"}
          value={usingPremium ? usd(deal.surplus) : "—"}
          note={
            usingPremium
              ? "divides on delivered performance"
              : "cost-up pays rate card exactly"
          }
        />
      </div>

      {/* Splits */}
      <div className="flex flex-col gap-2">
        <Eyebrow>Creator payouts</Eyebrow>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Creator</Th>
                <Th align="right">Reach</Th>
                <Th align="right">Qual</Th>
                <Th align="right">Payout</Th>
                <Th align="right">Share</Th>
                {usingPremium && <Th align="right">vs rate card</Th>}
              </tr>
            </thead>
            <tbody>
              {deal.splits.map((s) => (
                <tr key={s.creatorId} className="border-b border-hairline/60">
                  <td className="cm-sans py-2 pr-3 text-sm font-semibold">
                    {s.creatorName}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums text-ink/60">
                    {compactNumber(s.reach)}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums text-ink/60">
                    {s.weight.toFixed(2)}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums">
                    {usd(usingPremium ? s.pool : s.costUp)}
                  </td>
                  <td className="cm-fine py-2 pr-3 text-right tabular-nums text-ink/60">
                    {Math.round(
                      (usingPremium ? s.poolPct : s.costUpPct) * 100
                    )}
                    %
                  </td>
                  {usingPremium && (
                    <td className="cm-fine py-2 text-right tabular-nums text-success">
                      +{usd(s.delta)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cm-fine text-ink/40">
          {usingPremium
            ? "Every creator is floored at their rate card; only the premium divides on delivered performance, so nobody earns less for joining a bundle."
            : "Each creator is paid their rate card for what was sold. CM's margin sits on top."}
        </p>
      </div>
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
