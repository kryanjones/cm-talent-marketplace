import { NextRequest, NextResponse } from "next/server";
import { checkPassword, cookieName, type Role } from "@/lib/auth";

/** Sets the role cookie when the password matches. Lightweight MVP gate. */
export async function POST(req: NextRequest) {
  const { role, password } = (await req.json()) as {
    role?: Role;
    password?: string;
  };
  if (role !== "sales" && role !== "admin") {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }
  if (!password || !checkPassword(role, password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName(role), password, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
