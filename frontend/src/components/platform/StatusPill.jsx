const riskClasses = {
    safe: 'bg-low/10 text-low ring-low/25',
    low: 'bg-low/10 text-low ring-low/25',
    moderate: 'bg-moderate/10 text-moderate ring-moderate/25',
    high: 'bg-high/10 text-high ring-high/25',
    critical: 'bg-critical/10 text-critical ring-critical/25'
};
const statusClasses = {
    Queued: 'bg-panel text-ink-muted ring-line',
    'Not analyzed': 'bg-panel text-ink-muted ring-line',
    Ready: 'bg-low/10 text-low ring-low/25',
    Cleared: 'bg-low/10 text-low ring-low/25',
    Processing: 'bg-accent/10 text-accent ring-accent/25',
    'Needs review': 'bg-moderate/10 text-moderate ring-moderate/25',
    Flagged: 'bg-high/10 text-high ring-high/25',
    'In review': 'bg-accent/10 text-accent ring-accent/25',
    Blocked: 'bg-critical/10 text-critical ring-critical/25',
    Failed: 'bg-critical/10 text-critical ring-critical/25',
    Evaluating: 'bg-moderate/10 text-moderate ring-moderate/25',
    Archived: 'bg-panel text-ink-muted ring-line'
};
export function RiskPill({ level }) {
    return <span className={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${riskClasses[level]}`}>{level}</span>;
}
export function StatusPill({ status }) {
    return <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusClasses[status]}`}>{status}</span>;
}
