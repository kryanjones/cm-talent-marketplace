"use client";

import { useState } from "react";
import type { Role } from "@/lib/auth";

export function AccessGate({ role }: { role: Role }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, password }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setError("Incorrect password.");
        setBusy(false);
      }
    } catch {
      setError("Could not verify. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <span className="cm-rule-red mb-5" />
      <h1 className="cm-title capitalize">{role} access</h1>
      <p className="cm-body mt-3 text-ink/60">
        This view shows rate cards, inventory, and buyer activity. Enter the {role}{" "}
        password to continue.
      </p>
      <form onSubmit={unlock} className="mt-8 flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="cm-sans w-full border border-hairline bg-bg px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
        {error && <p className="cm-fine text-error">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="cm-label bg-ink px-5 py-3 text-ink-inverse disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
