
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import {
  actionMeta,
  modalityShort,
  riskBadgeClass,
  riskBarClass,
  riskTextClass,
  scoreToLevel,
} from '../utils/moderation';

const categoryLabels = {
  toxic: 'Toxic',
  severe_toxic: 'Severe toxicity',
  obscene: 'Obscene',
  threat: 'Threat',
  insult: 'Insult',
  identity_hate: 'Identity hate',
};

function formatScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function CategoryScores({ scores }) {
  if (!scores || Object.keys(scores).length === 0) {
    return (
      <p className="mt-2 text-xs text-ink-faint">
        Category scores are unavailable for this event. Re-analyze the video
        to generate them.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-3">
      {Object.entries(scores)
        .sort((a, b) => formatScore(b[1]) - formatScore(a[1]))
        .map(([category, rawScore]) => {
          const score = Math.max(0, Math.min(1, formatScore(rawScore)));
          const level = scoreToLevel(score);

          return (
            <li key={category}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-ink">
                  {categoryLabels[category] || category.replaceAll('_', ' ')}
                </span>
                <span
                  className={`font-mono text-xs font-semibold ${riskTextClass[level]}`}
                >
                  {(score * 100).toFixed(2)}%
                </span>
              </div>

              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised"
                role="progressbar"
                aria-label={`${categoryLabels[category] || category} score`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(score * 100)}
              >
                <div
                  className={`h-full rounded-full ${riskBarClass[level]}`}
                  style={{ width: `${score * 100}%` }}
                />
              </div>
            </li>
          );
        })}
    </ul>
  );
}

export function ReviewDrawer({
  event,
  onClose,
  onResolve,
  readOnly = false,
  busy = false,
}) {
  const signal = event?.signals?.find(
    item => item.categoryScores && Object.keys(item.categoryScores).length,
  );

  const categoryScores =
    event?.categoryScores || signal?.categoryScores || {};

  return (
    <AnimatePresence>
      {event && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Review event"
        >
          <motion.button
            type="button"
            aria-label="Close review drawer"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 bg-ink/30"
          />

          <motion.aside
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-raised"
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Human review
                </p>
                <h2 className="mt-0.5 text-lg font-semibold text-ink">
                  Chunk #{event.chunkId}
                  <span className="ml-2 font-mono text-sm font-normal text-ink-faint">
                    {event.timecode}
                  </span>
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-ink-faint transition-colors duration-150 ease-out hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    riskBadgeClass[scoreToLevel(event.score)]
                  }`}
                >
                  Risk {formatScore(event.score).toFixed(2)}
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    actionMeta[event.action]?.chip || ''
                  }`}
                >
                  {actionMeta[event.action]?.label || event.action}
                </span>

                <span className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-medium text-ink-muted ring-1 ring-inset ring-line">
                  {modalityShort[event.modality] || event.modality} trigger
                </span>
              </div>

              <section className="rounded-xl border border-line bg-panel p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Why it fired
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {event.reason || event.threat || 'No reason supplied.'}
                </p>

                {event.topCategoryName && (
                  <p className="mt-2 text-xs font-semibold text-ink">
                    Strongest category: {event.topCategoryName}
                    {Number.isFinite(Number(event.topCategoryScore)) &&
                      ` (${(Number(event.topCategoryScore) * 100).toFixed(2)}%)`}
                  </p>
                )}

                {Number.isFinite(Number(event.confidence)) && (
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Display confidence: {Math.round(event.confidence * 100)}%
                  </p>
                )}
              </section>

              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Toxicity category scores
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  Scores returned by the text model; these are not guaranteed
                  calibrated probabilities.
                </p>
                <CategoryScores scores={categoryScores} />
              </section>

              {event.transcript && (
                <section className="rounded-xl border border-line p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Detected transcript
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">
                    {event.transcript}
                  </p>
                </section>
              )}

              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Model details
                </p>

                <ul className="mt-2 space-y-2">
                  {(event.signals || []).map((item, index) => (
                    <li
                      key={`${item.modality}-${index}`}
                      className="rounded-lg border border-line p-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-ink">
                          {item.model}
                        </span>
                        <span
                          className={`font-mono text-sm font-semibold ${
                            riskTextClass[item.level] || ''
                          }`}
                        >
                          {formatScore(item.score).toFixed(2)}
                        </span>
                      </div>

                      {item.tags?.length > 0 && (
                        <p className="mt-2 text-[11px] text-ink-faint">
                          {item.tags.join(' · ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {!readOnly && (
              <footer className="flex gap-2 border-t border-line px-5 py-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onResolve(event.id, event.action)}
                  className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  Uphold decision
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onResolve(event.id, 'allow')}
                  className="rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors duration-150 ease-out hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                >
                  Reverse action
                </button>
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
