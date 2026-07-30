"use client";

import { useMemo, useState } from "react";
import type { BundleComponent, Creator } from "@/lib/types";
import { compactNumber } from "@/lib/format";
import { Chip, Eyebrow } from "@/components/ui";

/**
 * Pitch-approval requests.
 *
 * Before a bundle reaches a brand, each creator's team gets asked whether they
 * want the placements being proposed for them. One request per creator, listing
 * only that creator's own placements — nobody is shown the rest of the bundle.
 *
 * Creators without a team address are surfaced rather than quietly skipped:
 * silently omitting a creator from approvals is how someone gets pitched
 * without ever having agreed to it.
 */
export function PitchApproval({
  components,
  creators,
}: {
  components: BundleComponent[];
  creators: Creator[];
}) {
  const [brand, setBrand] = useState("");
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => {
    const byId = new Map(creators.map((c) => [c.id, c]));
    const map = new Map<
      string,
      { creator: Creator; placements: { platform: string; reach: number }[] }
    >();
    for (const comp of components) {
      const creator = byId.get(comp.creatorId);
      const channel = creator?.channels.find((ch) => ch.id === comp.channelId);
      if (!creator || !channel) continue;
      const entry = map.get(creator.id) ?? { creator, placements: [] };
      entry.placements.push({
        platform: channel.platform,
        reach: channel.avgReachPerUnit ?? 0,
      });
      map.set(creator.id, entry);
    }
    return Array.from(map.values());
  }, [components, creators]);

  const reachable = groups.filter((g) => g.creator.teamEmail);
  const missing = groups.filter((g) => !g.creator.teamEmail);

  function mailtoFor(g: (typeof groups)[number]) {
    const lines = g.placements
      .map((p) => `- ${p.platform} (~${compactNumber(p.reach)} reach per run)`)
      .join("\n");
    const advertiser = brand.trim() || "a brand we are in conversation with";
    const body =
      `Hi,\n\nWe have a proposed placement for ${g.creator.name} with ${advertiser}.\n\n` +
      `Proposed:\n${lines}\n\n` +
      `Before we take this any further with the advertiser, can you confirm whether ` +
      `${g.creator.name} is open to it? Reply with a yes, a no, or any conditions ` +
      `you would want attached.\n\nThank you,\nCollective Media`;
    return `mailto:${g.creator.teamEmail}?subject=${encodeURIComponent(
      `Approval needed — ${g.creator.name}${brand.trim() ? ` × ${brand.trim()}` : ""}`
    )}&body=${encodeURIComponent(body)}`;
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(
        reachable.map((g) => g.creator.teamEmail).join(", ")
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the addresses are listed on screen anyway.
    }
  }

  if (groups.length === 0) {
    return <p className="cm-fine text-ink/50">No creators resolved in this bundle.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Advertiser</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Patagonia"
            className="cm-sans w-56 border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        {reachable.length > 0 && (
          <button
            type="button"
            onClick={copyAll}
            className="cm-label border border-hairline px-3 py-2 text-ink/60 transition-colors hover:border-ink hover:text-ink"
          >
            {copied ? "Copied ✓" : `Copy ${reachable.length} addresses`}
          </button>
        )}
      </div>

      <div className="flex flex-col divide-y divide-hairline border border-hairline">
        {groups.map((g) => (
          <div
            key={g.creator.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="cm-sans text-sm font-semibold">{g.creator.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {g.placements.map((p, i) => (
                  <Chip key={`${p.platform}-${i}`} tone="muted">
                    {p.platform}
                  </Chip>
                ))}
              </div>
            </div>
            {g.creator.teamEmail ? (
              <a
                href={mailtoFor(g)}
                className="cm-label whitespace-nowrap border border-ink px-3 py-2 transition-colors hover:bg-ink hover:text-ink-inverse"
              >
                Request approval
              </a>
            ) : (
              <span className="cm-fine whitespace-nowrap text-warning">
                No team email on file
              </span>
            )}
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="cm-fine text-warning">
          {missing.length} of {groups.length} creator
          {groups.length === 1 ? "" : "s"} cannot be contacted yet. Add a Team
          Email in Airtable for {missing.map((g) => g.creator.name).join(", ")}{" "}
          before pitching this bundle.
        </p>
      )}
    </div>
  );
}
