import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { data } from "@/lib/data";
import { AvailabilityGrid } from "@/components/calendar/AvailabilityGrid";
import { Eyebrow } from "@/components/ui";

export const dynamic = "force-dynamic";

async function getCreator(id: string) {
  const creator = await data.getCreatorById(id);
  if (!creator || creator.status !== "Active") return null;
  return creator;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const creator = await getCreator(params.id);
  return {
    title: creator
      ? `${creator.name} — availability`
      : "Availability — Collective Media",
  };
}

/**
 * A creator's own availability, in a form that can be sent to their team.
 *
 * Deliberately separate from the media kit: this is an operational view for the
 * people who manage the creator's schedule, not a sales document. It carries no
 * rates — what is being paid is a conversation with the team, not something to
 * publish on a link that gets forwarded.
 */
export default async function AvailabilityPage({
  params,
}: {
  params: { id: string };
}) {
  const [creator, bookings] = await Promise.all([
    getCreator(params.id),
    data.getBookings(),
  ]);
  if (!creator) notFound();

  // Narrow the channels to exactly what the grid needs. Handing the component
  // whole Channel records serialises rate cards into this page's source — on
  // the one page in the app explicitly designed to be forwarded onward.
  const channels = creator.channels.map((ch) => ({
    id: ch.id,
    platform: ch.platform,
    inventorySlotsPerMonth: ch.inventorySlotsPerMonth,
    leadTimeDays: ch.leadTimeDays,
  }));
  const channelIds = new Set(channels.map((c) => c.id));
  const mine = bookings.filter((b) => b.channelId && channelIds.has(b.channelId));

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <span className="cm-rule-red mb-5" />
      <Eyebrow>Availability</Eyebrow>
      <h1 className="cm-title mt-2">{creator.name}</h1>
      <p className="cm-body mt-3 max-w-2xl text-ink/60">
        Sponsorship inventory over the next six months, and any placements
        already booked. Share this with {creator.name}&rsquo;s team so everyone is
        working from the same schedule.
      </p>

      <div className="mt-10">
        <AvailabilityGrid
          creatorName={creator.name}
          channels={channels}
          bookings={mine}
        />
      </div>

      <p className="cm-fine mt-10 border-t border-hairline pt-5 text-ink/45">
        Questions about a date, or want to hold a slot? Reply to whoever sent you
        this link and we will sort it out.
      </p>
    </div>
  );
}
