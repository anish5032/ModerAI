export function PageHeader({ eyebrow, title, description, actions }) {
    return (<div className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>);
}
export function DemoNotice({ children = 'Demo data only · not connected to production systems' }) {
    return (<div className="mb-5 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3.5 py-2.5 text-xs text-accent">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"/>
      <span>{children}</span>
    </div>);
}
