"use client";

/**
 * The six Brief v2 questions as controlled form sections. One component, two
 * surfaces: the landing page renders them as two steps (part 1 / part 2), the
 * in-gallery panel renders them all at once — same questions, same state shape,
 * so a brief started anywhere means the same thing everywhere.
 */
import { BUDGET_BANDS } from "@/lib/plan";
import { Pill } from "@/components/ui";
import {
  AUDIENCE_AGES,
  AUDIENCE_GENDER,
  BRIEF_GOALS,
  INDUSTRIES,
  PLATFORM_CHOICES,
  type BriefAnswers,
} from "./brief-options";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function BriefQuestions({
  answers,
  onChange,
  topics,
  part = "all",
}: {
  answers: BriefAnswers;
  onChange: (next: BriefAnswers) => void;
  /** Live topic vocabulary (deriveTopics of the current roster). */
  topics: string[];
  /** "1" = questions 1–3, "2" = questions 4–6, "all" = single screen. */
  part?: "1" | "2" | "all";
}) {
  const a = answers;
  const set = (patch: Partial<BriefAnswers>) => onChange({ ...a, ...patch });
  const goalHelp = BRIEF_GOALS.find((g) => g.value === a.goal)?.help;

  return (
    <div className="flex flex-col gap-7">
      {part !== "2" && (
        <>
          <Field label="What matters most?" hint={goalHelp}>
            <div className="flex flex-wrap gap-1.5">
              {BRIEF_GOALS.map((g) => (
                <Pill
                  key={g.value}
                  active={a.goal === g.value}
                  onClick={() => set({ goal: g.value })}
                >
                  {g.label}
                </Pill>
              ))}
            </div>
          </Field>

          <Field
            label="What audience are you looking for?"
            hint="Select all that matter. Applied wherever a creator has audience data on file."
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCE_GENDER.map((g) => (
                  <Pill
                    key={g}
                    active={a.audience.includes(g)}
                    onClick={() => set({ audience: toggle(a.audience, g) })}
                  >
                    {g}
                  </Pill>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCE_AGES.map((band) => (
                  <Pill
                    key={band}
                    active={a.audience.includes(band)}
                    onClick={() => set({ audience: toggle(a.audience, band) })}
                  >
                    {band}
                  </Pill>
                ))}
              </div>
            </div>
          </Field>

          <Field
            label="Editorial alignment — what topics do you want to show up with?"
            hint="Select any. Drawn from what our creators actually cover."
          >
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <Pill
                  key={t}
                  active={a.topics.includes(t)}
                  onClick={() => set({ topics: toggle(a.topics, t) })}
                >
                  {t}
                </Pill>
              ))}
            </div>
          </Field>
        </>
      )}

      {part !== "1" && (
        <>
          <Field
            label="What platforms are you interested in?"
            hint={
              a.platforms.includes("Events")
                ? PLATFORM_CHOICES.find((p) => p.label === "Events")?.note
                : "Select all. Leave empty for everything."
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_CHOICES.map((p) => (
                <Pill
                  key={p.label}
                  active={a.platforms.includes(p.label)}
                  onClick={() => set({ platforms: toggle(a.platforms, p.label) })}
                >
                  {p.label}
                </Pill>
              ))}
            </div>
          </Field>

          <Field
            label="What industry is your company or product?"
            hint="Used to withhold creators who decline that category. Nothing is pitched to them."
          >
            <div className="flex flex-wrap gap-1.5">
              <Pill active={a.industry === ""} onClick={() => set({ industry: "" })}>
                General
              </Pill>
              {INDUSTRIES.map((c) => (
                <Pill
                  key={c}
                  active={a.industry === c}
                  onClick={() => set({ industry: a.industry === c ? "" : c })}
                >
                  {c}
                </Pill>
              ))}
            </div>
          </Field>

          <Field label="What's your budget?" hint="Shapes the plan. Never shown as a rate.">
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_BANDS.map((b) => (
                <Pill
                  key={b.label}
                  active={a.budget === b.value}
                  onClick={() => set({ budget: b.value })}
                >
                  {b.label}
                </Pill>
              ))}
            </div>
          </Field>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="cm-sans text-sm font-semibold">{label}</span>
      {hint && <span className="cm-fine text-ink/45">{hint}</span>}
      {children}
    </div>
  );
}
