import { CheckIcon, SparklesIcon } from 'lucide-react';
import { moderationActions } from '../data/moderation';
import { actionMeta } from '../utils/moderation';
export function ActionPanel({ profile, enforcedAction, manualOverride, onToggleOverride, onSelectAction }) {
    const confidencePct = Math.round(profile.confidence * 100);
    return (<section className="rounded-xl border border-line bg-surface shadow-card" aria-label="Moderation policy and decision">

      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Policy decision</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/25">
          <SparklesIcon className="h-3 w-3" aria-hidden="true"/>
          Confidence: {confidencePct}%
        </span>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2.5">
        <div>
          <p className="text-xs font-semibold text-ink">Manual override</p>
          <p className="text-[11px] text-ink-faint">
            {manualOverride ?
            'You are steering enforcement for this chunk.' :
            'Enforcement follows the model recommendation.'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={manualOverride} aria-label="Manual override" onClick={() => onToggleOverride(!manualOverride)} className={[
            'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            manualOverride ? 'bg-accent' : 'bg-line'
        ].
            join(' ')}>

          <span className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform duration-150 ease-out',
            manualOverride ? 'translate-x-[22px]' : 'translate-x-0.5'
        ].
            join(' ')}/>

        </button>
      </div>

      <div className="grid grid-cols-1 gap-1.5 p-3 sm:grid-cols-2 xl:grid-cols-1" role="radiogroup" aria-label="Enforcement action">
        {moderationActions.map((action) => {
            const meta = actionMeta[action.key];
            const selected = enforcedAction === action.key;
            const recommended = profile.recommended === action.key;
            return (<button key={action.key} type="button" role="radio" aria-checked={selected} disabled={!manualOverride && !selected} onClick={() => onSelectAction(action.key)} className={[
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    selected ? 'border-line bg-panel' : 'border-transparent hover:bg-panel',
                    !manualOverride && !selected ? 'cursor-not-allowed opacity-45' : ''
                ].
                    join(' ')}>

              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true"/>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className={`text-sm font-medium ${selected ? meta.text : 'text-ink'}`}>
                    {action.label}
                  </span>
                  {recommended &&
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent ring-1 ring-inset ring-accent/25">
                      AI pick
                    </span>}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                  {action.description}
                </span>
              </span>
              {selected && <CheckIcon className={`h-4 w-4 shrink-0 ${meta.text}`} aria-hidden="true"/>}
            </button>);
        })}
      </div>

      <div className="space-y-3 border-t border-line px-4 py-3">
        <div className="rounded-lg border border-line bg-panel p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Reason for action
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{profile.reason}</p>
        </div>
        <button type="button" className={`w-full rounded-lg px-3 py-2.5 text-sm font-semibold shadow-card transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${actionMeta[enforcedAction].solid}`}>

          Enforce {actionMeta[enforcedAction].label}
        </button>
      </div>
    </section>);
}
