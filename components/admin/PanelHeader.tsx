export const adminPanelLayout = 'mx-auto max-w-5xl space-y-6 pb-10';
export const adminPanelInput = 'mt-2 block min-w-0 max-w-full w-full rounded-xl border border-mosque-ink/15 bg-mosque-cream/40 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-mosque-emerald focus:bg-white';
export const adminPanelPrimaryButton = 'rounded-xl bg-mosque-emerald px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-mosque-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mosque-emerald disabled:cursor-not-allowed disabled:opacity-40';
export const adminPanelSecondaryButton = 'rounded-xl border border-mosque-ink/15 bg-white px-5 py-3 text-sm font-semibold text-mosque-ink transition-colors hover:bg-mosque-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mosque-emerald';

export default function PanelHeader({ category, title, description, action }: { category: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="rounded-2xl bg-mosque-deep px-6 py-7 text-white shadow-sm sm:px-8">
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-mosque-mint">{category}</p>
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0 flex-1 basis-full sm:basis-64"><h1 className="break-words text-2xl font-extrabold sm:text-3xl tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{description}</p>}
      </div>
      {action && <div className="w-full min-w-0 max-w-full rounded-xl sm:w-auto bg-mosque-cream p-2 text-mosque-ink [&>div]:flex-wrap">{action}</div>}
    </div>
  </header>;
}
