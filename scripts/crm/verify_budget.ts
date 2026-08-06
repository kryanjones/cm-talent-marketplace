/**
 * Budget-honesty check against LIVE CRM data: run the planner at several
 * budgets and price its own selections back through the rate cards. The buyer
 * response hides prices by design, so this is the only place the arithmetic is
 * visible end to end. Run: npx tsx scripts/crm/verify_budget.ts
 */
import { readFileSync } from "node:fs";
import { mapCrmCreator, mapProducts, mapRates, type CrmRecord } from "../../lib/data/crm-map";
import { planBundle } from "../../lib/plan";
import type { Creator, RateCard } from "../../lib/types";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

async function fetchAll(table: string): Promise<CrmRecord[]> {
  const out: CrmRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${env.AIRTABLE_CRM_BASE_ID}/${encodeURIComponent(table)}`
    );
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status}`);
    const data = (await res.json()) as { records: CrmRecord[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

function cheapest(rc: RateCard | string | null): number | null {
  if (!rc || typeof rc === "string") return null;
  let best: number | null = null;
  for (const e of Object.values(rc)) {
    if (e.usd > 0 && (best === null || e.usd < best)) best = e.usd;
  }
  return best;
}

async function main() {
const [creatorRecs, rateRecs, productRecs] = await Promise.all([
  fetchAll("Creators"),
  fetchAll("Rates"),
  fetchAll("Integration Types"),
]);
const products = mapProducts(productRecs);
const rates = mapRates(rateRecs, products);
const byCreator = new Map<string, typeof rates>();
for (const r of rates) {
  const list = byCreator.get(r.creatorRecId) ?? [];
  list.push(r);
  byCreator.set(r.creatorRecId, list);
}
const creators = creatorRecs
  .map((rec) => mapCrmCreator(rec, byCreator.get(rec.id) ?? []))
  .filter((c): c is Creator => c != null);

console.log(`live roster: ${creators.length} sellable creators\n`);

let failures = 0;
for (const budget of [5000, 25000, 150000]) {
  const plan = planBundle(creators, [], {
    industry: null,
    affinity: null,
    goal: "Maximize Reach",
    budget,
    markets: [],
    platforms: [],
  });
  let spend = 0;
  const lines: string[] = [];
  for (const comp of plan.components) {
    const creator = creators.find((c) => c.id === comp.creatorId)!;
    const channel = creator.channels.find((ch) => ch.id === comp.channelId)!;
    const price = cheapest(channel.rateCard);
    if (price === null) {
      failures++;
      lines.push(`  !! UNPRICED ${creator.name} / ${channel.platform}`);
      continue;
    }
    spend += price;
    lines.push(`  $${String(price).padStart(6)}  ${creator.name} — ${channel.platform}`);
  }
  const ok = spend <= budget;
  if (!ok) failures++;
  console.log(
    `budget $${budget.toLocaleString()}: ${plan.components.length} placements, priced total $${spend.toLocaleString()} ${ok ? "≤ budget ok" : "OVER BUDGET"}`
  );
  console.log(lines.join("\n") || "  (empty bundle)");
  console.log();
}
console.log(failures ? `${failures} FAILURE(S)` : "budget honesty: all checks passed");
process.exit(failures ? 1 : 0);
}
main();
