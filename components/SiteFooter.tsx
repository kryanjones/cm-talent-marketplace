/**
 * Persistent disclosure required on every view (Section 7 of the build prompt).
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-hairline bg-bg-alt">
      <div className="mx-auto flex max-w-content flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="cm-rule-red" aria-hidden />
        <p className="cm-fine text-ink/60">
          All personas and metrics shown are fictional, for demonstration purposes only.
        </p>
        <p className="cm-fine text-ink/40">© Collective Media</p>
      </div>
    </footer>
  );
}
