import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";
import type { CreatorApplication } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreatorApplication>;

    if (!body.name || !body.primaryBeat) {
      return NextResponse.json(
        { error: "Name and primary beat are required." },
        { status: 400 }
      );
    }

    const app: CreatorApplication = {
      name: body.name,
      bio: body.bio ?? "",
      primaryBeat: body.primaryBeat,
      homeMarketDMA: body.homeMarketDMA ?? "",
      priorOutlets: body.priorOutlets ?? "",
      categoryAffinities: body.categoryAffinities ?? "",
      politicalLean: body.politicalLean ?? "Nonpartisan",
      channels: (body.channels ?? []).filter((c) => c.platform && c.handleUrl),
      noGoCategories: body.noGoCategories ?? "",
      conditionalCategories: body.conditionalCategories ?? "",
    };

    const created = await data.createCreatorApplication(app);
    return NextResponse.json(
      { ok: true, creator: { id: created.id, name: created.name, status: created.status } },
      { status: 201 }
    );
  } catch (err) {
    console.error("application submit failed", err);
    return NextResponse.json(
      { error: "Could not submit application." },
      { status: 500 }
    );
  }
}
