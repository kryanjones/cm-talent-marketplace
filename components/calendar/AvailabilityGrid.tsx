"use client";

import { useMemo } from "react";
import type { Booking, Channel } from "@/lib/types";
import {
  availabilityGrid,
  bookingEvent,
  googleCalendarUrl,
  icsDataUri,
  monthLabel,
  toICS,
  type MonthCell,
} from "@/lib/calendar";
import { AVAILABILITY_TONE } from "@/lib/inventory";
import { Eyebrow } from "@/components/ui";

type ChannelLike = Pick<
  Channel,
  "id" | "platform" | "inventorySlotsPerMonth" | "leadTimeDays"
>;

/**
 * Month-by-month availability for one creator's channels.
 *
 * Sales sees slot counts; a creator's team sees the same grid with their own
 * bookings on it. `showCounts` is what separates the two — the buyer-facing
 * rules do not apply here, since both audiences are entitled to the detail.
 */
export function AvailabilityGrid({
  creatorName,
  channels,
  bookings,
  months = 6,
  showInvites = true,
}: {
  creatorName: string;
  channels: ChannelLike[];
  bookings: Booking[];
  months?: number;
  showInvites?: boolean;
}) {
  const grid = useMemo(
    () => availabilityGrid(channels, bookings, months),
    [channels, bookings, months]
  );

  // Bookings that belong to these channels, for the invite list below.
  const ours = useMemo(() => {
    const ids = new Set(channels.map((c) => c.id));
    return bookings
      .filter((b) => b.channelId && ids.has(b.channelId) && b.month)
      .sort((a, b) => (a.month ?? "").localeCompare(b.month ?? ""));
  }, [bookings, channels]);

  const monthKeys = useMemo(() => {
    const first = grid.values().next().value as MonthCell[] | undefined;
    return first ?? [];
  }, [grid]);

  if (channels.length === 0) {
    return <p className="cm-fine text-ink/50">No channels on file.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="cm-fine pb-2 pr-4 text-left font-normal text-ink/45">
                Channel
              </th>
              {monthKeys.map((c) => (
                <th
                  key={c.key}
                  className="cm-fine pb-2 text-center font-normal text-ink/45"
                >
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => {
              const cells = grid.get(ch.id) ?? [];
              return (
                <tr key={ch.id} className="border-t border-hairline">
                  <td className="cm-sans py-2.5 pr-4 text-sm font-semibold">
                    {ch.platform}
                    {ch.leadTimeDays != null && (
                      <span className="cm-fine ml-2 font-normal text-ink/40">
                        {ch.leadTimeDays}d lead
                      </span>
                    )}
                  </td>
                  {cells.map((c) => (
                    <td key={c.key} className="py-2.5 text-center">
                      {c.fill.capacity === null ? (
                        <span className="cm-fine text-ink/25">—</span>
                      ) : (
                        <span
                          title={`${monthLabel(c.key)} · ${c.fill.available} of ${
                            c.fill.capacity
                          } open`}
                          className={`cm-fine tabular-nums ${
                            AVAILABILITY_TONE[c.fill.availability]
                          }`}
                        >
                          {c.fill.available}/{c.fill.capacity}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="cm-fine text-ink/40">
        Open slots per month. Green has room, amber is nearly gone, red is fully
        booked.
      </p>

      {showInvites && ours.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-5">
          <Eyebrow>Booked placements</Eyebrow>
          <div className="flex flex-col divide-y divide-hairline border border-hairline">
            {ours.map((b) => {
              const channel = channels.find((c) => c.id === b.channelId);
              if (!channel) return null;
              const event = bookingEvent(
                creatorName,
                channel,
                (b.month ?? "").slice(0, 7),
                b.brand
              );
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="cm-sans text-sm font-semibold">
                      {channel.platform} · {monthLabel((b.month ?? "").slice(0, 7))}
                    </p>
                    <p className="cm-fine text-ink/50">
                      {b.brand || "Sponsor TBC"} · {b.slots} slot
                      {b.slots === 1 ? "" : "s"} · {b.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={icsDataUri(toICS(event, b.id))}
                      download={`${creatorName.replace(/\s+/g, "-").toLowerCase()}-${
                        channel.platform
                      }-${(b.month ?? "").slice(0, 7)}.ics`}
                      className="cm-label whitespace-nowrap border border-ink px-3 py-1.5 transition-colors hover:bg-ink hover:text-ink-inverse"
                    >
                      Calendar invite
                    </a>
                    <a
                      href={googleCalendarUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cm-label whitespace-nowrap border border-hairline px-3 py-1.5 text-ink/60 transition-colors hover:border-ink hover:text-ink"
                    >
                      Google
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="cm-fine text-ink/40">
            Invites are all-day events on the first of the flight month — we know
            the month a placement runs, not the hour. Where a lead time is on
            file, a reminder fires that many days ahead.
          </p>
        </div>
      )}
    </div>
  );
}
