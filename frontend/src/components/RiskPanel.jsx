import { LayersIcon } from 'lucide-react';
import { CompositeGauge } from './CompositeGauge';
import { ModalityCard } from './ModalityCard';
import { formatClock } from '../utils/moderation';
export function RiskPanel({ profile, activeChunk }) {
    return (<section className="rounded-xl border border-line bg-surface shadow-card" aria-label="Multimodal risk breakdown">
      
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Composite risk</h2>
        {activeChunk &&
            <span className="font-mono text-[11px] text-ink-faint">
            #{activeChunk.id} · {formatClock(activeChunk.start)}–{formatClock(activeChunk.end)}
          </span>}
      </header>

      <div className="px-4 pb-4 pt-3">
        <CompositeGauge score={profile.composite}/>
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">
          Weighted fusion of three modality models for the active chunk.
        </p>
      </div>

      <div className="border-t border-line bg-panel px-4 py-3.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          <LayersIcon className="h-3.5 w-3.5" aria-hidden="true"/>
          Modality breakdown
        </h3>
        <div className="mt-3 space-y-2.5">
          {profile.signals.map((signal) => <ModalityCard key={signal.modality} signal={signal}/>)}
        </div>
      </div>
    </section>);
}
