import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { data, toBuyerCreator } from "@/lib/data";
import { MediaKit } from "@/components/creator/MediaKit";
import { computeFill, type Availability } from "@/lib/inventory";

export const dynamic = "force-dynamic";

async function getCreator(id: string) {
  const creator = await data.getCreatorById(id);
  // Only Active creators have a public media kit — pending applicants and
  // rejected records must not be reachable by guessing a URL.
  if (!creator || creator.status !== "Active") return null;
  return creator;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const creator = await getCreator(params.id);
  if (!creator) return { title: "Creator not found — Collective Media" };
  return {
    title: `${creator.name} — Collective Media`,
    description:
      creator.positioning ||
      creator.bio ||
      `${creator.name} covers ${creator.primaryBeat} for Collective Media.`,
  };
}

export default async function CreatorPage({
  params,
}: {
  params: { id: string };
}) {
  const [creator, overlap, bookings] = await Promise.all([
    getCreator(params.id),
    data.getOverlapAssumptions(),
    data.getBookings(),
  ]);
  if (!creator) notFound();

  // Qualitative only — the media kit is a public document.
  const fills = computeFill(creator.channels, bookings);
  const availability: Record<string, Availability> = {};
  for (const [channelId, fill] of fills) {
    if (fill.availability !== "Unknown") availability[channelId] = fill.availability;
  }

  return (
    <div className="mx-auto max-w-content px-6">
      <div className="cm-no-print pt-6">
        <Link
          href="/discover"
          className="cm-label text-ink/50 underline-offset-4 transition-colors hover:text-accent hover:underline"
        >
          ← All creators
        </Link>
      </div>
      <MediaKit
        creator={toBuyerCreator(creator)}
        overlap={overlap}
        availability={availability}
      />
    </div>
  );
}
