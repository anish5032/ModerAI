import { AudioLinesIcon, EyeIcon, TypeIcon } from 'lucide-react';
import { riskBadgeClass, riskBarClass, riskLevelLabel, riskTextClass } from '../utils/moderation';
const icons = {
    visual: EyeIcon,
    audio: AudioLinesIcon,
    text: TypeIcon
};
export function ModalityCard({ signal }) {
    const Icon = icons[signal.modality];
    return (<article className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel text-ink-muted ring-1 ring-inset ring-line">
          <Icon className="h-4 w-4" aria-hidden="true"/>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-ink">{signal.model}</h3>
              <p className="truncate text-[11px] text-ink-faint">{signal.label}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskBadgeClass[signal.level]}`}>

              {riskLevelLabel[signal.level]}
            </span>
          </div>

          <div className="mt-2.5 flex items-end gap-3">
            <span className={`font-mono text-2xl font-semibold leading-none ${riskTextClass[signal.level]}`}>

              {signal.score.toFixed(2)}
            </span>
            <div className="mb-1 h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
              <div className={`h-full rounded-full transition-[width] duration-200 ease-out ${riskBarClass[signal.level]}`} style={{ width: `${Math.round(signal.score * 100)}%` }}/>

            </div>
          </div>

          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {signal.tags.map((tag) => <li key={tag} className={`rounded-md px-2 py-1 text-[11px] font-medium ${signal.score >= 0.4 ?
                riskBadgeClass[signal.level] :
                'bg-panel text-ink-muted ring-1 ring-inset ring-line'}`}>

                {tag}
              </li>)}
          </ul>
        </div>
      </div>
    </article>);
}
