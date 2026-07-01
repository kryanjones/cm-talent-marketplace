/**
 * Lightweight role gating for the MVP (per Section 1: a simple password gate per
 * route is fine; full multi-tenant auth comes later). A correct password sets an
 * httpOnly cookie. If no password is configured for a role, that route is open
 * (useful in local dev). This is intentionally not hardened auth.
 */
import "server-only";
import { cookies } from "next/headers";

export type Role = "sales" | "admin";

const COOKIE = { sales: "cm_sales", admin: "cm_admin" } as const;

function passwordFor(role: Role): string | undefined {
  return role === "sales"
    ? process.env.SALES_ACCESS_PASSWORD
    : process.env.ADMIN_ACCESS_PASSWORD;
}

/** A role with no configured password is treated as open. */
export function roleRequiresPassword(role: Role): boolean {
  return !!passwordFor(role);
}

export function isUnlocked(role: Role): boolean {
  if (!roleRequiresPassword(role)) return true;
  const token = cookies().get(COOKIE[role])?.value;
  return !!token && token === passwordFor(role);
}

export function checkPassword(role: Role, password: string): boolean {
  const expected = passwordFor(role);
  return !!expected && password === expected;
}

export function cookieName(role: Role): string {
  return COOKIE[role];
}
