"use client";

/**
 * The front door (Sarah's redesign, Jul 31): the brief IS the landing page.
 * A visitor either briefs us — six questions across two screens — or steps
 * through to the creator gallery. Submitting carries the brief to /discover
 * as query params, where the plan runs and the bundle assembles.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eyebrow } from "@/components/ui";
import { BriefQuestions } from "@/components/buyer/BriefQuestions";
import { EMPTY_ANSWERS, encodeBrief, type BriefAnswers } from "@/components/buyer/brief-options";

export function BriefLanding({
  topics,
  creatorCount,
}: {
  topics: string[];
  creatorCount: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [answers, setAnswers] = useState<BriefAnswers>(EMPTY_ANSWERS);

  const explore = () => router.push("/discover");
  const submit = () => router.push(`/discover?${encodeBrief(answers)}`);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-10 px-6 pb-20 pt-12">
      {/* ---------- Welcome ---------- */}
      <header className="flex max-w-3xl flex-col gap-4">
        <span className="cm-rule-red" />
        <h1 className="cm-title">
          Find the journalists your audience already trusts.
        </h1>
        <p className="cm-body text-body-lg max-w-2xl text-ink/70">
          Welcome to the Collective Media creator marketplace — find and connect
          with journalists who are already trusted and followed by the audiences
          you&rsquo;re trying to reach.
        </p>
      </header>

      {/* ---------- The two doors ---------- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="border border-hairline bg-bg-alt">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4">
            <div>
              <Eyebrow>Your brief</Eyebrow>
              <p className="cm-body mt-1 text-sm text-ink/60">
                I know what I&rsquo;m looking for — brief us and we&rsquo;ll
                create a package for you.
              </p>
            </div>
            <span className="cm-fine text-ink/40">Step {step} of 2</span>
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: step === 2 ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="px-6 py-6"
          >
            <BriefQuestions
              answers={answers}
              onChange={setAnswers}
              topics={topics}
              part={step === 1 ? "1" : "2"}
            />
          </motion.div>

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-6 py-4">
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="cm-label bg-accent px-6 py-3 text-ink-inverse transition-opacity hover:opacity-90"
              >
                Next — platforms &amp; budget
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={submit}
                  className="cm-label bg-accent px-6 py-3 text-ink-inverse transition-opacity hover:opacity-90"
                >
                  Show me a bundle
                </button>
                <button
                  type="button"
                  onClick={explore}
                  className="cm-label border border-ink px-6 py-3 transition-colors hover:bg-ink hover:text-ink-inverse"
                >
                  Explore all creators
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="cm-label text-ink/50 underline-offset-4 hover:text-ink hover:underline"
                >
                  ← Back
                </button>
              </>
            )}
          </div>
        </section>

        {/* ---------- The other door ---------- */}
        <aside className="flex h-fit flex-col gap-4 border border-hairline px-6 py-6">
          <Eyebrow>Or browse first</Eyebrow>
          <p className="cm-body text-sm text-ink/65">
            I want to explore the creators first — {creatorCount} journalist
            {creatorCount === 1 ? "" : "s"} with media kits, audience figures and
            availability.
          </p>
          <button
            type="button"
            onClick={explore}
            className="cm-label w-fit border border-ink px-5 py-3 transition-colors hover:bg-ink hover:text-ink-inverse"
          >
            Explore all creators →
          </button>
        </aside>
      </div>
    </div>
  );
}
