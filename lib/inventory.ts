/**
 * Inventory fill.
 *
 * Capacity already lives on each channel as `Inventory Slots Per Month`. This
 * module pairs it with the Bookings table to answer the question sales gets
 * asked constantly: what is actually still available, and when.
 *
 * Both Held and Confirmed bookings consume inventory — a slot promised to one
 * advertiser is not sellable to another, and treating holds as free is how a
 * channel gets sold twice.
 *
 * Buyers never see slot counts. They see a qualitative state (Open / Limited /
 * Fully booked), which is the useful signal without publishing commercials.
 */
import type { Booking } from "@/lib/types";

/** Everything fill needs from a channel — so buyer-facing (rate-card-stripped)
 *  channels work here too. */
type ChannelCapacity = { id: string; inventorySlotsPerMonth: number | null };

export type Availability = "Open" | "Limited" | "Fully booked" | "Unknown";

export interface ChannelFill {
  channelId: string;
  capacity: number | null;
  booked: number;
  available: number | null;
  /** 0..1 — null when capacity is unknown. */
  fillRate: number | null;
  availability: Availability;
}

/** YYYY-MM for a date-ish string. Undated bookings count against the current month. */
export function monthKey(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function classify(capacity: number | null, booked: number): Availability {
  if (capacity === null || capacity <= 0) return "Unknown";
  const remaining = capacity - booked;
  if (remaining <= 0) return "Fully booked";
  // "Limited" is a real signal, not urgency theatre: it means a single
  // placement could take the rest of the month's inventory.
  if (remaining <= 1 || remaining / capacity <= 0.34) return "Limited";
  return "Open";
}

/**
 * Fill for every channel in a given month.
 * @param month YYYY-MM. Defaults to the current month.
 */
export function computeFill(
  channels: ChannelCapacity[],
  bookings: Booking[],
  month: string = currentMonthKey()
): Map<string, ChannelFill> {
  const bookedByChannel = new Map<string, number>();
  for (const b of bookings) {
    if (!b.channelId) continue;
    if (monthKey(b.month, month) !== month) continue;
    bookedByChannel.set(
      b.channelId,
      (bookedByChannel.get(b.channelId) ?? 0) + (b.slots || 0)
    );
  }

  const out = new Map<string, ChannelFill>();
  for (const ch of channels) {
    const capacity = ch.inventorySlotsPerMonth ?? null;
    const booked = bookedByChannel.get(ch.id) ?? 0;
    const available = capacity === null ? null : Math.max(0, capacity - booked);
    out.set(ch.id, {
      channelId: ch.id,
      capacity,
      booked,
      available,
      fillRate: capacity && capacity > 0 ? Math.min(1, booked / capacity) : null,
      availability: classify(capacity, booked),
    });
  }
  return out;
}

/** Roll several channels up into one headline state for a creator. */
export function rollUp(fills: ChannelFill[]): {
  capacity: number;
  booked: number;
  available: number;
  availability: Availability;
} {
  const known = fills.filter((f) => f.capacity !== null);
  const capacity = known.reduce((s, f) => s + (f.capacity ?? 0), 0);
  const booked = known.reduce((s, f) => s + f.booked, 0);
  return {
    capacity,
    booked,
    available: Math.max(0, capacity - booked),
    availability: known.length ? classify(capacity, booked) : "Unknown",
  };
}

/** Tailwind text colour per state, so the signal reads at a glance. */
export const AVAILABILITY_TONE: Record<Availability, string> = {
  Open: "text-success",
  Limited: "text-warning",
  "Fully booked": "text-accent",
  Unknown: "text-ink/40",
};
