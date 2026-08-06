import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";
import { planBundle, type Brief } from "@/lib/plan";
import { GOALS, type OptimizationGoal } from "@/lib/recommend";

/**
 * Turns a buyer's brief into an opening bundle.
 *
 * Runs server-side because it needs rate cards to fit a budget, and rate cards
 * never reach the buyer's browser. The response carries component IDs, reach
 * figures and a rationale — no prices.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Brief>;

    if (!body.budget || body.budget <= 0) {
      return NextResponse.json({ error: "A budget is required." }, { status: 400 });
    }
    const goal: OptimizationGoal = GOALS.includes(body.goal as OptimizationGoal)
      ? (body.goal as OptimizationGoal)
      : "Maximize Reach";

    const brief: Brief = {
      industry: body.industry ?? null,
      affinity: body.affinity ?? null,
      goal,
      budget: body.budget,
      markets: body.markets?.filter(Boolean) ?? [],
      platforms: body.platforms?.filter(Boolean) ?? [],
      topics: body.topics?.filter(Boolean) ?? [],
      audience: body.audience?.filter(Boolean) ?? [],
    };

    const [creators, overlap] = await Promise.all([
      data.getCreators(),
      data.getOverlapAssumptions(),
    ]);

    const plan = planBundle(creators, overlap, brief);
    return NextResponse.json(plan);
  } catch (err) {
    console.error("plan failed", err);
    return NextResponse.json({ error: "Could not build a plan." }, { status: 500 });
  }
}
