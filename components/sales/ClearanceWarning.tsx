"use client";

import type { Creator } from "@/lib/types";
import { agreementNote, unclearedIn } from "@/lib/agency";

/**
 * Flags creators in a bundle who have no signed representation agreement.
 *
 * Shown above pricing and approvals rather than blocking them: pricing a
 * speculative bundle before paperwork lands is normal. Sending it to a brand
 * without noticing is not.
 */
export function ClearanceWarning({
  components,
  creators,
}: {
  components: { creatorId: string }[];
  creators: Creator[];
}) {
  const byId = new Map(creators.map((c) => [c.id, c]));
  const inBundle = Array.from(new Set(components.map((c) => c.creatorId)))
    .map((id) => byId.get(id))
    .filter(Boolean) as Creator[];

  const uncleared = unclearedIn(inBundle);
  if (uncleared.length === 0) return null;

  return (
    <div className="mb-5 border border-accent/40 bg-accent/5 px-4 py-3">
      <p className="cm-label text-accent">
        {uncleared.length} of {inBundle.length} creator
        {inBundle.length === 1 ? "" : "s"} not cleared to sell
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {uncleared.map((u) => (
          <li key={u.id} className="cm-fine text-ink/65">
            {u.name} — {agreementNote(u.status)}
          </li>
        ))}
      </ul>
      <p className="cm-fine mt-2 text-ink/45">
        We sell as each creator&rsquo;s agent, so a signed master agreement has to
        be on file before this bundle goes to an advertiser.
      </p>
    </div>
  );
}
