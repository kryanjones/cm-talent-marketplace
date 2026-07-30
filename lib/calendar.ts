/**
 * Availability over time, and calendar invites.
 *
 * lib/inventory answers "what is open this month". This extends that across a
 * rolling window so sales can answer "when could we run this", and turns a
 * booking into a calendar event a creator's team can actually accept.
 *
 * Invites are generated as .ics and as an Add-to-Google-Calendar URL rather
 * than written through a calendar API. A creator's team is usually not in our
 * workspace, so we cannot write to their calendar even with an integration —
 * and an .ics works in every calendar app without anyone granting access.
 */
import type { Booking, Channel } from "@/lib/types";
import { computeFill, type Availability, type ChannelFill } from "@/lib/inventory";

export interface MonthCell {
  /** YYYY-MM */
  key: string;
  /** e.g. "Jul 2026" */
  label: string;
  /** e.g. "Jul" */
  short: string;
  fill: ChannelFill;
}

type ChannelCapacity = { id: string; inventorySlotsPerMonth: number | null };

/** YYYY-MM keys for `count` months starting from `from` (default: this month). */
export function monthWindow(count: number, from = new Date()): string[] {
  const out: string[] = [];
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m + i, 1));
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    );
  }
  return out;
}

export function monthLabel(key: string, style: "long" | "short" = "long"): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return style === "short" ? month : `${month} ${y}`;
}

/**
 * Availability for every channel across a rolling window.
 * Returns channelId → ordered month cells.
 */
export function availabilityGrid(
  channels: ChannelCapacity[],
  bookings: Booking[],
  months: number = 6,
  from = new Date()
): Map<string, MonthCell[]> {
  const keys = monthWindow(months, from);
  const grid = new Map<string, MonthCell[]>();
  for (const key of keys) {
    const fills = computeFill(channels, bookings, key);
    for (const [channelId, fill] of fills) {
      const row = grid.get(channelId) ?? [];
      row.push({
        key,
        label: monthLabel(key),
        short: monthLabel(key, "short"),
        fill,
      });
      grid.set(channelId, row);
    }
  }
  return grid;
}

/** First month in the window with room to sell. */
export function nextOpenMonth(cells: MonthCell[]): MonthCell | null {
  return cells.find((c) => (c.fill.available ?? 0) > 0) ?? null;
}

// ------------------------------------------------------------------ invites

export interface CalendarEvent {
  title: string;
  description: string;
  /** YYYY-MM — the flight month. */
  month: string;
  /** Days before the flight month that material is due. */
  leadTimeDays?: number | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** All-day date stamp: YYYYMMDD. */
function dateStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function monthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * An .ics for the flight month, as an all-day event on the 1st.
 *
 * Deliberately all-day rather than a timed event: we know the month a
 * placement runs, not the hour, and inventing 9am would put a false precision
 * into someone's calendar. If a lead time is on file, a VALARM fires that many
 * days ahead so material is not late.
 */
export function toICS(event: CalendarEvent, uid: string): string {
  const start = monthStart(event.month);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Collective Media//Talent Marketplace//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@marketplace.collective.media`,
    `DTSTAMP:${dateStamp(new Date())}T000000Z`,
    `DTSTART;VALUE=DATE:${dateStamp(start)}`,
    `DTEND;VALUE=DATE:${dateStamp(end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description)}`,
  ];
  if (event.leadTimeDays && event.leadTimeDays > 0) {
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-P${Math.round(event.leadTimeDays)}D`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeICS(`Material due — ${event.title}`)}`,
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  // CRLF is required by RFC 5545; some clients reject LF-only files.
  return lines.join("\r\n");
}

/** Add-to-Google-Calendar link, for people who live in a browser tab. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const start = monthStart(event.month);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.description,
    dates: `${dateStamp(start)}/${dateStamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A data: URI so an .ics downloads without a server round-trip. */
export function icsDataUri(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

/** Convenience: build the event copy for a booked placement. */
export function bookingEvent(
  creatorName: string,
  channel: Pick<Channel, "platform" | "leadTimeDays">,
  month: string,
  brand: string | null
): CalendarEvent {
  const advertiser = brand || "Sponsor TBC";
  return {
    title: `${creatorName} — ${channel.platform} placement (${advertiser})`,
    description:
      `Sponsored placement running in ${monthLabel(month)}.\n` +
      `Creator: ${creatorName}\nChannel: ${channel.platform}\nAdvertiser: ${advertiser}\n\n` +
      `Booked via the Collective Media Talent Marketplace.`,
    month,
    leadTimeDays: channel.leadTimeDays,
  };
}

export type { Availability };
