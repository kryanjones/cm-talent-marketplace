"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function GateForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/site-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next }),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.next || "/";
      } else {
        setError("Incorrect password.");
        setBusy(false);
      }
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
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
        className="cm-label bg-accent px-5 py-3 text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function GatePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-content flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <span className="cm-rule-red" />
        <div>
          <h1 className="cm-h2 font-bold">Collective Media</h1>
          <p className="cm-label mt-1 text-accent">Talent Marketplace</p>
        </div>
        <p className="cm-body text-sm text-ink/60">
          This preview is private. Enter the access password to continue.
        </p>
        <Suspense fallback={null}>
          <GateForm />
        </Suspense>
      </div>
    </div>
  );
}
