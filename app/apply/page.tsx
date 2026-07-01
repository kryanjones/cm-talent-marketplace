"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BEATS,
  PLATFORMS,
  CATEGORY_AFFINITIES,
  POLITICAL_LEANS,
  NOGO_CATEGORIES,
} from "@/lib/constants";
import { Eyebrow, Pill } from "@/components/ui";

const APPLICATION_FEE = 250;

interface ChannelRow {
  platform: string;
  handleUrl: string;
  audienceSize: string;
  avgReachPerUnit: string;
}

const emptyChannel: ChannelRow = {
  platform: "YouTube",
  handleUrl: "",
  audienceSize: "",
  avgReachPerUnit: "",
};

export default function ApplyPage() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [primaryBeat, setPrimaryBeat] = useState(BEATS[0]);
  const [homeMarketDMA, setHomeMarketDMA] = useState("");
  const [priorOutlets, setPriorOutlets] = useState("");
  const [politicalLean, setPoliticalLean] = useState("Nonpartisan");
  const [affinities, setAffinities] = useState<string[]>([]);
  const [noGo, setNoGo] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([{ ...emptyChannel }]);

  const [feePaid, setFeePaid] = useState(false);
  const [status, setStatus] = useState<"idle" | "paying" | "submitting" | "done" | "error">(
    "idle"
  );
  const [resultName, setResultName] = useState("");

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    value: string
  ) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function updateChannel(i: number, patch: Partial<ChannelRow>) {
    setChannels((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function payFee() {
    setStatus("paying");
    // Stubbed payment — no live processor. A real one slots in here later.
    setTimeout(() => {
      setFeePaid(true);
      setStatus("idle");
    }, 700);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!feePaid) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          bio,
          primaryBeat,
          homeMarketDMA,
          priorOutlets,
          categoryAffinities: affinities.join(", "),
          politicalLean,
          noGoCategories: noGo.join(", "),
          conditionalCategories: "",
          channels: channels
            .filter((c) => c.handleUrl)
            .map((c) => ({
              platform: c.platform,
              handleUrl: c.handleUrl,
              audienceSize: Number(c.audienceSize) || 0,
              avgReachPerUnit: Number(c.avgReachPerUnit) || 0,
            })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResultName(data.creator?.name ?? name);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <span className="cm-rule-red mb-6" />
        <h1 className="cm-title">Application received.</h1>
        <p className="cm-body mt-4 text-ink/65">
          Thanks, {resultName}. Your channels are now in <strong>Pending Review</strong>.
          Our team vets every applicant for audience viability and brand fit before
          adding them to the marketplace. You&apos;ll hear from us once a decision is
          made.
        </p>
        <a href="/" className="cm-label mt-8 inline-block text-accent hover:underline">
          ← Back to Discover
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <span className="cm-rule-red mb-5" />
      <h1 className="cm-title">Apply to the marketplace</h1>
      <p className="cm-body mt-3 text-ink/60">
        Tell us about your work and your channels. Approved creators become live
        inventory that brands can discover and bundle. A {usd(APPLICATION_FEE)}{" "}
        application fee covers the vetting review.
      </p>

      <form onSubmit={submit} className="mt-10 flex flex-col gap-8">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>

        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Who you are and what you cover."
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Primary beat">
            <select value={primaryBeat} onChange={(e) => setPrimaryBeat(e.target.value)} className={inputCls}>
              {BEATS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Home market / DMA">
            <input value={homeMarketDMA} onChange={(e) => setHomeMarketDMA(e.target.value)} className={inputCls} placeholder="e.g. Chicago" />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Prior outlets">
            <input value={priorOutlets} onChange={(e) => setPriorOutlets(e.target.value)} className={inputCls} placeholder="Comma-separated" />
          </Field>
          <Field label="Political lean (audience context)">
            <select value={politicalLean} onChange={(e) => setPoliticalLean(e.target.value)} className={inputCls}>
              {POLITICAL_LEANS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Category affinities">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_AFFINITIES.map((a) => (
              <Pill key={a} active={affinities.includes(a)} onClick={() => toggle(affinities, setAffinities, a)}>
                {a}
              </Pill>
            ))}
          </div>
        </Field>

        {/* Channels */}
        <div className="flex flex-col gap-3">
          <Eyebrow>Channels</Eyebrow>
          {channels.map((c, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 border border-hairline p-4 sm:grid-cols-2">
              <select value={c.platform} onChange={(e) => updateChannel(i, { platform: e.target.value })} className={inputCls}>
                {PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <input value={c.handleUrl} onChange={(e) => updateChannel(i, { handleUrl: e.target.value })} className={inputCls} placeholder="Handle or URL" />
              <input value={c.audienceSize} onChange={(e) => updateChannel(i, { audienceSize: e.target.value })} className={inputCls} placeholder="Audience size" inputMode="numeric" />
              <input value={c.avgReachPerUnit} onChange={(e) => updateChannel(i, { avgReachPerUnit: e.target.value })} className={inputCls} placeholder="Avg reach per post/send" inputMode="numeric" />
              {channels.length > 1 && (
                <button type="button" onClick={() => setChannels((p) => p.filter((_, idx) => idx !== i))} className="cm-fine text-left text-ink/45 hover:text-accent">
                  Remove channel
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setChannels((p) => [...p, { ...emptyChannel }])} className="cm-label self-start border border-ink px-3 py-2 hover:bg-ink hover:text-ink-inverse">
            + Add channel
          </button>
        </div>

        <Field label="No-go categories">
          <div className="flex flex-wrap gap-1.5">
            {NOGO_CATEGORIES.map((n) => (
              <Pill key={n} active={noGo.includes(n)} onClick={() => toggle(noGo, setNoGo, n)}>
                {n}
              </Pill>
            ))}
          </div>
        </Field>

        {/* Stubbed payment */}
        <div className="border border-hairline bg-bg-alt p-5">
          <Eyebrow>Application fee</Eyebrow>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <p className="cm-sans text-lg font-bold">{usd(APPLICATION_FEE)}</p>
              <p className="cm-fine text-ink/50">
                Demo only — no real payment is processed.
              </p>
            </div>
            <AnimatePresence mode="wait">
              {feePaid ? (
                <motion.span key="paid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cm-label text-success">
                  ✓ Paid
                </motion.span>
              ) : (
                <motion.button
                  key="pay"
                  type="button"
                  onClick={payFee}
                  disabled={status === "paying"}
                  className="cm-label bg-ink px-4 py-2.5 text-ink-inverse disabled:opacity-50"
                >
                  {status === "paying" ? "Processing…" : `Pay ${usd(APPLICATION_FEE)}`}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          type="submit"
          disabled={!feePaid || status === "submitting"}
          className="cm-label bg-accent px-6 py-3.5 text-ink-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "submitting" ? "Submitting…" : "Submit application"}
        </button>
        {!feePaid && (
          <p className="-mt-4 cm-fine text-ink/45">Pay the application fee to enable submission.</p>
        )}
        {status === "error" && (
          <p className="cm-fine text-error">Something went wrong. Please try again.</p>
        )}
      </form>
    </div>
  );
}

const inputCls =
  "cm-sans w-full border border-hairline bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="cm-label text-ink/60">{label}</span>
      {children}
    </label>
  );
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
