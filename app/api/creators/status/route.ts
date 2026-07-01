import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";
import { isUnlocked } from "@/lib/auth";

/** Approve or reject a pending creator. Admin/sales gated. */
export async function POST(req: NextRequest) {
  if (!isUnlocked("sales") && !isUnlocked("admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const { id, action } = (await req.json()) as {
      id?: string;
      action?: "approve" | "reject";
    };
    if (!id || !action) {
      return NextResponse.json(
        { error: "id and action are required." },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const today = new Date().toISOString().slice(0, 10);
      const updated = await data.updateCreatorStatus(id, "Active", today);
      return NextResponse.json({ ok: true, creator: updated });
    }
    const updated = await data.updateCreatorStatus(id, "Rejected", null);
    return NextResponse.json({ ok: true, creator: updated });
  } catch (err) {
    console.error("status update failed", err);
    return NextResponse.json({ error: "Could not update status." }, { status: 500 });
  }
}
