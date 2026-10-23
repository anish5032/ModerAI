const toneClasses = {
    accent: 'text-accent bg-accent/10',
    safe: 'text-low bg-low/10',
    moderate: 'text-moderate bg-moderate/10',
    high: 'text-high bg-high/10',
    critical: 'text-critical bg-critical/10'
};
export function MetricCard({ metric }) {
    return (<article className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-muted">{metric.label}</p>
        <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${toneClasses[metric.tone]}`}>{metric.badge ?? 'Demo'}</span>
      </div>
      <p className="mt-4 font-mono text-2xl font-semibold tracking-tight text-ink">{metric.value}</p>
      <p className="mt-1 text-[11px] text-ink-faint">{metric.detail}</p>
    </article>);
}
export function Panel({ title, eyebrow, children, action }) {
    return (<section className="rounded-xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{eyebrow}</p>}
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>);
}
