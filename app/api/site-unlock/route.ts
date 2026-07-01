import { NextRequest, NextResponse } from "next/server";

/** Verifies the shared site password and sets the gate cookie. */
export async function POST(req: NextRequest) {
  const { password, next } = (await req.json()) as {
    password?: string;
    next?: string;
  };
  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    return NextResponse.json({ ok: true, next: next || "/" });
  }
  if (!password || password !== expected) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, next: next || "/" });
  res.cookies.set("cm_site", password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
