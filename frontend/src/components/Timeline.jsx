import { useState } from 'react';
import { formatClock, riskBarClass, riskLevelLabel, riskTextClass } from '../utils/moderation';
const barHeight = {
    safe: 'h-4',
    low: 'h-6',
    moderate: 'h-9',
    high: 'h-12',
    critical: 'h-14'
};
export function Timeline({ chunks, currentTime, durationSeconds, activeChunk, onSeek }) {
    const [hovered, setHovered] = useState(null);
    const readout = hovered ?? activeChunk;
    const progress = durationSeconds > 0 ? Math.min(100, currentTime / durationSeconds * 100) : 0;
    const labelEvery = Math.max(1, Math.ceil(chunks.length / 12));
    return (<section className="border-t border-line bg-panel px-4 py-3.5 sm:px-5" aria-label="Chunk timeline">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Chunk timeline
          </h2>
          <span className="text-[11px] text-ink-faint">
            2s segments · {chunks.length} chunks · {formatClock(durationSeconds)} total
          </span>
        </div>
        {readout &&
            <p className="font-mono text-xs">
            <span className="font-semibold text-ink">Chunk #{readout.id}</span>
            <span className="text-ink-faint">
              {' '}
              [{formatClock(readout.start)}–{formatClock(readout.end)}]
            </span>
            <span className={`ml-2 font-semibold ${riskTextClass[readout.level]}`}>
              {readout.threat ?? riskLevelLabel[readout.level]}
            </span>
          </p>}
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="min-w-full">
          <div className="relative flex h-16 items-end gap-[2px]" onMouseLeave={() => setHovered(null)}>
            
            {chunks.map((chunk) => {
            const isActive = activeChunk?.id === chunk.id;
            const isPast = chunk.end <= currentTime;
            return (<button key={chunk.id} type="button" onClick={() => onSeek(chunk.start)} onMouseEnter={() => setHovered(chunk)} onFocus={() => setHovered(chunk)} className="group relative flex h-full min-w-[6px] flex-1 items-end focus:outline-none" aria-label={`Chunk ${chunk.id}, ${formatClock(chunk.start)} to ${formatClock(chunk.end)}, ${riskLevelLabel[chunk.level]}`}>
                  
                  <span className={[
                    'w-full rounded-sm transition-[height,opacity] duration-150 ease-out',
                    barHeight[chunk.level],
                    riskBarClass[chunk.level],
                    isPast ? 'opacity-100' : 'opacity-35',
                    isActive ? 'ring-2 ring-ink/70 ring-offset-1 ring-offset-panel' : '',
                    'group-hover:opacity-100 group-focus-visible:opacity-100'
                ].
                    join(' ')}/>
                  
                </button>);
        })}

            <div className="pointer-events-none absolute inset-y-0 w-px bg-ink" style={{ left: `${progress}%` }}>
              
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-ink"/>
            </div>
          </div>

          <div className="mt-1.5 flex gap-[2px] border-t border-line pt-1.5">
            {chunks.map((chunk, index) => <span key={chunk.id} className="min-w-[6px] flex-1 truncate text-center font-mono text-[10px] text-ink-faint">
              
                {index % labelEvery === 0 ? `#${chunk.id}` : ''}
              </span>)}
          </div>
        </div>
      </div>
    </section>);
}
