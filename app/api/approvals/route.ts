import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";
import { isUnlocked } from "@/lib/auth";
import type { Approval } from "@/lib/types";

/** Recorded §3.3 approval requests. Sales-gated. */
export async function GET() {
  if (!isUnlocked("sales") && !isUnlocked("admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return NextResponse.json({ approvals: await data.getApprovals() });
}

/**
 * Records that approval requests were put to creators.
 *
 * Recording is what makes "silence is rejection" enforceable — without a sent
 * date and a due date on file there is no moment at which a proposal becomes
 * deemed rejected, and §3.3 is just a sentence in a document.
 */
export async function POST(req: NextRequest) {
  if (!isUnlocked("sales") && !isUnlocked("admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { requests?: Omit<Approval, "id">[] };
    const requests = body.requests ?? [];
    if (requests.length === 0) {
      return NextResponse.json(
        { error: "No approval requests supplied." },
        { status: 400 }
      );
    }
    const result = await data.recordApprovals(requests);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    console.error("record approvals failed", err);
    return NextResponse.json(
      { error: "Could not record the approval requests." },
      { status: 500 }
    );
  }
}
