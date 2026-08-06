import { getActiveBuyerCreators, data, dataSource } from "@/lib/data";
import { BuyerExperience } from "@/components/buyer/BuyerExperience";
import { computeFill, type Availability } from "@/lib/inventory";
import { decodeBrief } from "@/components/buyer/brief-options";

// Always render against fresh data so Airtable edits show up.
export const dynamic = "force-dynamic";

/**
 * The creator gallery (formerly the site root — the landing page is now the
 * brief, per Sarah's front-door redesign). Arriving with brief params in the
 * URL (?g=…&bu=…) auto-runs the plan so "Show me a bundle" on the landing page
 * lands here with the bundle already assembling.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [creators, overlap, bookings] = await Promise.all([
    getActiveBuyerCreators(),
    data.getOverlapAssumptions(),
    data.getBookings(),
  ]);

  // Resolve availability on the server and hand the client only the qualitative
  // label. Slot counts and booking records are commercial detail; a buyer needs
  // to know whether they can buy, not how much room is left.
  const fills = computeFill(
    creators.flatMap((c) => c.channels),
    bookings
  );
  const availability: Record<string, Availability> = {};
  for (const [channelId, fill] of fills) {
    if (fill.availability !== "Unknown") availability[channelId] = fill.availability;
  }

  const initialBrief = decodeBrief(searchParams);

  return (
    <>
      {dataSource === "local" && (
        <div className="border-b border-hairline bg-bg-alt">
          <p className="mx-auto max-w-content px-6 py-2 cm-fine text-ink/50">
            Running on the local seed dataset — add Airtable credentials to connect
            the live base.
          </p>
        </div>
      )}
      <BuyerExperience
        creators={creators}
        overlap={overlap}
        availability={availability}
        initialBrief={initialBrief}
      />
    </>
  );
}
