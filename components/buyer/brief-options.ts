/**
 * Brief v2 vocabulary — Sarah's six questions (Jul 31 Slack notes), shared by
 * the landing-page brief and the in-gallery brief panel so the two can never
 * drift apart. Client-safe: constants only.
 */
import type { OptimizationGoal } from "@/lib/recommend";

/** Q1 — "what matters most". Labels are Sarah's words; values are planner goals. */
export const BRIEF_GOALS: Array<{
  value: OptimizationGoal;
  label: string;
  help: string;
}> = [
  {
    value: "Maximize Reach",
    label: "Maximize reach",
    help: "The largest deduplicated audience the budget allows.",
  },
  {
    value: "Maximize Engagement",
    label: "Maximize engagement & conversion",
    help: "Prefer channels with proven open, view and click rates over raw audience size.",
  },
  {
    value: "Fit Budget",
    label: "Make the budget work",
    help: "Efficient coverage that leaves room in the number.",
  },
  {
    value: "Content I Can Reuse",
    label: "Content my brand can reuse",
    help: "Prefer formats that produce an asset you can repost and repurpose — custom segments, branded video, dedicated editions.",
  },
];

/** Q2 — audience. Two groups; both multi-select. */
export const AUDIENCE_GENDER = ["Lean male", "Lean female", "Gender balance"];
export const AUDIENCE_AGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];

/**
 * Q4 — platforms, in buyer language. `channels` is what each choice means in
 * inventory terms; the UI never shows the raw channel names.
 */
export const PLATFORM_CHOICES: Array<{
  label: string;
  channels: string[];
  note?: string;
}> = [
  { label: "Newsletter", channels: ["Newsletter", "Substack"] },
  { label: "Video", channels: ["YouTube"] },
  { label: "Audio", channels: ["Podcast"] },
  {
    label: "Social",
    channels: ["Social", "Instagram", "TikTok", "X", "LinkedIn"],
  },
  { label: "Live", channels: ["Livestream"] },
  {
    label: "Events",
    channels: ["Events"],
    note: "No bookable event inventory yet — selecting it records interest.",
  },
];

export function platformLabelsToChannels(labels: string[]): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    for (const ch of PLATFORM_CHOICES.find((p) => p.label === label)?.channels ?? []) {
      out.add(ch);
    }
  }
  return Array.from(out);
}

/**
 * Q5 — advertiser industry. Sarah's 19-vertical vocabulary, mirrored from the
 * CRM's "Advertiser Category Fit" select (one display-only spelling fix). If
 * she revises the standard list, update it here AND there — the shared
 * vocabulary is what powers brand↔creator matching in her base.
 */
export const INDUSTRIES = [
  "Arts & Entertainment (film/tv/music)",
  "Business and Career/Professional Development",
  "Climate and Sustainability",
  "Education and learning",
  "Fashion and Beauty",
  "Food and Drink",
  "Health and Wellness",
  "Home and lifestyle",
  "Live events & experiences",
  "Luxury and premium goods",
  "Mental health",
  "Money and personal finance",
  "News and Journalism",
  "Parenting and family",
  "Pets & animals",
  "Politics, advocacy and social issues",
  "Sports & fitness",
  "Technology and tools",
  "Travel & hospitality",
];

/** Topics come from the live roster so the pills always match real inventory. */
export function deriveTopics(
  creators: Array<{ primaryBeat: string | null; categoryAffinities: string[] }>
): string[] {
  const out = new Set<string>();
  for (const c of creators) {
    if (c.primaryBeat) out.add(c.primaryBeat);
    for (const a of c.categoryAffinities) out.add(a);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

/** One brief, both surfaces. Everything optional except goal and budget. */
export interface BriefAnswers {
  goal: OptimizationGoal;
  audience: string[];
  topics: string[];
  /** PLATFORM_CHOICES labels (buyer language), not channel names. */
  platforms: string[];
  industry: string;
  budget: number;
}

export const EMPTY_ANSWERS: BriefAnswers = {
  goal: "Maximize Reach",
  audience: [],
  topics: [],
  platforms: [],
  industry: "",
  budget: 50_000,
};

/** Compact query-string codec so a landing brief survives the hop to /discover. */
export function encodeBrief(a: BriefAnswers): string {
  const q = new URLSearchParams();
  q.set("g", a.goal);
  q.set("bu", String(a.budget));
  if (a.industry) q.set("i", a.industry);
  if (a.topics.length) q.set("t", a.topics.join("|"));
  if (a.audience.length) q.set("a", a.audience.join("|"));
  if (a.platforms.length) q.set("p", a.platforms.join("|"));
  return q.toString();
}

export function decodeBrief(
  params: Record<string, string | string[] | undefined>
): BriefAnswers | null {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const goal = one(params.g);
  const budget = Number(one(params.bu));
  if (!goal || !budget || Number.isNaN(budget)) return null;
  const list = (v: string | string[] | undefined) =>
    one(v)?.split("|").filter(Boolean) ?? [];
  return {
    goal: goal as OptimizationGoal,
    budget,
    industry: one(params.i) ?? "",
    topics: list(params.t),
    audience: list(params.a),
    platforms: list(params.p),
  };
}
