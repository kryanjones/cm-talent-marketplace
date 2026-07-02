/**
 * Display ordering for the creator grid.
 *
 * The AI headshots are all distinct people, but faces generated with the same
 * gender + ethnicity + age recipe can read as similar. To keep lookalikes from
 * landing next to each other, we order the grid by even distribution:
 *
 *   1. Genders alternate (the strongest visual separator, and with a ~50/50
 *      split the alternation also holds vertically in the 3-column grid).
 *   2. Within a gender, ethnicity groups are spread as far apart as possible.
 *
 * Each item gets a fractional position (j + 0.5) / groupSize inside its group;
 * sorting by that position interleaves every group proportionally. Pure and
 * deterministic — same input, same order on server and client.
 *
 * Traits come from data/headshotTraits.json (derived from the headshot
 * generation recipes, keyed by Creator ID). Creators without an entry — e.g.
 * new applicants — form their own group and get distributed like any other.
 */
import traits from "@/data/headshotTraits.json";

interface Trait {
  g: string; // gender: m | w | u
  e: string; // ethnicity group
  a: string; // age decade
}

const TRAITS = traits as Record<string, Trait>;
const UNKNOWN: Trait = { g: "u", e: "u", a: "u" };

function traitFor(id: string): Trait {
  return TRAITS[id] ?? UNKNOWN;
}

/** Interleave `items` so every group (by `key`) is spread evenly. */
function distribute<T>(items: T[], key: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k) ?? [];
    list.push(item);
    groups.set(k, list);
  }
  const scheduled: { item: T; pos: number }[] = [];
  for (const group of groups.values()) {
    group.forEach((item, j) =>
      scheduled.push({ item, pos: (j + 0.5) / group.length })
    );
  }
  // Array.prototype.sort is stable, so equal positions keep insertion order.
  scheduled.sort((a, b) => a.pos - b.pos);
  return scheduled.map((s) => s.item);
}

export function arrangeForDisplay<T extends { id: string }>(items: T[]): T[] {
  // Spread ethnicities within each gender first, so that when the genders are
  // interleaved, consecutive same-gender cards cycle through ethnicities.
  const byGender = new Map<string, T[]>();
  for (const item of items) {
    const g = traitFor(item.id).g;
    const list = byGender.get(g) ?? [];
    list.push(item);
    byGender.set(g, list);
  }
  const spread: T[] = [];
  for (const [, group] of byGender) {
    spread.push(...distribute(group, (item) => traitFor(item.id).e));
  }
  return distribute(spread, (item) => traitFor(item.id).g);
}
