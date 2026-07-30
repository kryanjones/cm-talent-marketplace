/**
 * Shareable bundle links.
 *
 * A bundle is encoded in the Discover URL as dot-separated channel record ids
 * (`/?b=recA.recB`). Channel ids are alphanumeric, so "." never needs URL
 * encoding, and the creator half of each component is re-derived from live
 * data on load — a stale share link degrades to "whatever still exists".
 */
import type { BundleComponent } from "@/lib/types";

export const SHARE_PARAM = "b";

export function encodeShareParam(components: BundleComponent[]): string {
  return components.map((c) => c.channelId).join(".");
}

export function decodeShareParam(value: string): string[] {
  return value.split(".").filter(Boolean);
}

/** Discover path that reopens this bundle. */
export function bundleSharePath(components: BundleComponent[]): string {
  return components.length
    ? `/?${SHARE_PARAM}=${encodeShareParam(components)}`
    : "/";
}
