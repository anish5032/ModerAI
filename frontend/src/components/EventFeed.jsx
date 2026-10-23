import { AnimatePresence, motion } from 'framer-motion';
import { AudioLinesIcon, EyeIcon, TypeIcon } from 'lucide-react';
import { actionMeta, modalityShort, riskTextClass, scoreToLevel } from '../utils/moderation';
const modalityIcon = {
    visual: EyeIcon,
    audio: AudioLinesIcon,
    text: TypeIcon
};
export function EventFeed({ events, streaming, onReview }) {
    const pending = events.filter((event) => !event.reviewed).length;
    return (<section className="rounded-xl border border-line bg-surface shadow-card" aria-label="Real-time moderation event feed">

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-ink">Moderation event feed</h2>
          <span className="text-[11px] text-ink-faint">{pending} awaiting review</span>
        </div>
        <span className="inline-flex items-center gap-2 text-[11px] text-ink-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${streaming ? 'bg-low' : 'bg-ink-faint'}`} aria-hidden="true"/>

          {streaming ? 'Live Â· auto-updating' : 'Paused'}
        </span>
      </header>

      <div className="max-h-[340px] overflow-auto">
        {events.length === 0 ?
            <p className="px-4 py-10 text-center text-sm text-ink-faint">
            No moderation events yet. Events are logged as flagged chunks are processed.
          </p> :
            <table className="w-full min-w-[840px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
                <th scope="col" className="py-2.5 pl-4 pr-3 font-semibold">Timestamp</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Chunk ID</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Trigger modality</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Primary threat</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Risk score</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Recommended action</th>
                <th scope="col" className="py-2.5 pl-3 pr-4 text-right font-semibold">Review</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {events.map((event) => {
                    const Icon = modalityIcon[event.modality];
                    const level = scoreToLevel(event.score);
                    const meta = actionMeta[event.action];
                    return (<motion.tr key={event.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }} className="border-b border-line-soft text-sm last:border-0 hover:bg-panel">

                      <td className="py-2.5 pl-4 pr-3 font-mono text-xs text-ink-muted">
                        {event.timecode}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-ink">
                        #{event.chunkId}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true"/>
                          {modalityShort[event.modality]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink">{event.threat}</td>
                      <td className={`px-3 py-2.5 font-mono text-xs font-semibold ${riskTextClass[level]}`}>

                        {event.score.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right">
                        <button type="button" onClick={() => onReview(event)} className={[
                            'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                            event.reviewed ?
                                'text-ink-faint ring-1 ring-inset ring-line hover:bg-panel' :
                                'text-accent ring-1 ring-inset ring-accent/30 hover:bg-accent/10'
                        ].
                            join(' ')}>

                          {event.reviewed ? 'Reviewed' : 'Review'}
                        </button>
                      </td>
                    </motion.tr>);
                })}
              </AnimatePresence>
            </tbody>
          </table>}
      </div>
    </section>);
}
