import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Inbox, RefreshCw, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReviewDrawer } from '../components/ReviewDrawer';
import { DemoNotice, PageHeader } from '../components/platform/PageHeader';
import { RiskPill } from '../components/platform/StatusPill';
import { reviewApi } from '../services/apiService';
import { scoreToLevel } from '../utils/moderation';
function errorMessage(error) {
    return error instanceof Error ? error.message : 'Something went wrong.';
}
export function BackendReviews() {
    const [status, setStatus] = useState('pending');
    const [events, setEvents] = useState([]);
    const [summary, setSummary] = useState(null);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [eventsResult, summaryResult] = await Promise.allSettled([
                reviewApi.queue(status),
                reviewApi.summary()
            ]);
            if (eventsResult.status === 'rejected')
                throw eventsResult.reason;
            setEvents(eventsResult.value);
            if (summaryResult.status === 'fulfilled') {
                setSummary(summaryResult.value);
                setError(null);
            }
            else {
                setSummary(null);
                setError(errorMessage(summaryResult.reason));
            }
        }
        catch (caught) {
            setError(errorMessage(caught));
        }
        finally {
            setLoading(false);
        }
    }, [status]);
    useEffect(() => { void refresh(); }, [refresh]);
    async function decide(eventId, action) {
        setBusy(true);
        setError(null);
        try {
            await reviewApi.decide(eventId, action);
            setSelected(null);
            await refresh();
        }
        catch (caught) {
            setError(errorMessage(caught));
        }
        finally {
            setBusy(false);
        }
    }
    const countLabel = value => Number.isFinite(value) ? value : '—';
    const pendingCount = countLabel(summary?.pending);
    const resolvedCount = countLabel(summary?.resolved);
    const totalCount = countLabel(summary?.total);
    return (<div className="mx-auto max-w-[1600px]">
      <PageHeader eyebrow="Human-in-the-loop operations" title="Review queue" description="Review flagged events, uphold or reverse automated actions, and save decisions to the backend." actions={<button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-panel disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true"/>
            Refresh
          </button>}/>
      <DemoNotice>Analysis decisions are saved to your account. Scores use Whisper transcription, the trained text toxicity model, and sampled-frame image-safety classification.</DemoNotice>

      {error && <p role="alert" className="mb-4 rounded-lg bg-critical/10 px-3.5 py-2.5 text-xs text-critical ring-1 ring-inset ring-critical/25">{error}</p>}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">Pending</p>
          <p data-testid="pending-count" className="mt-2 font-mono text-2xl font-semibold text-moderate">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">Resolved</p>
          <p data-testid="resolved-count" className="mt-2 font-mono text-2xl font-semibold text-low">{resolvedCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">Total flagged</p>
          <p data-testid="total-count" className="mt-2 font-mono text-2xl font-semibold text-ink">{totalCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-accent" aria-hidden="true"/>
            <p className="text-sm font-semibold text-ink">Flagged content</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="review-status">Filter review status</label>
            <select id="review-status" value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink">
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
            <Link to="/videos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80">
              Video library <ExternalLink className="h-3.5 w-3.5" aria-hidden="true"/>
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-panel">
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3 font-semibold">Severity</th>
                <th className="px-3 py-3 font-semibold">Risk score</th>
                <th className="px-3 py-3 font-semibold">Video / chunk</th>
                <th className="px-3 py-3 font-semibold">Modality</th>
                <th className="px-3 py-3 font-semibold">Threat</th>
                <th className="px-3 py-3 font-semibold">Timestamp</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Reviewer</th>
                <th className="px-3 py-3 text-right font-semibold">Open</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (<tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-faint">Loading review events…</td></tr>) : events.length === 0 ? (<tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-faint">No events in this queue.</td></tr>) : events.map(event => (<tr key={event.id} className="border-b border-line-soft last:border-0 hover:bg-panel">
                  <td className="px-4 py-3"><RiskPill level={scoreToLevel(event.score)}/></td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold text-ink">{event.score.toFixed(2)}</td>
                  <td className="px-3 py-3 text-xs text-ink">
                    <p>{event.videoName || event.videoId}</p>
                    <p className="mt-0.5 font-mono text-ink-faint">#{event.chunkId} · {event.timecode}</p>
                  </td>
                  <td className="px-3 py-3 capitalize text-xs text-ink-muted">{event.modality}</td>
                  <td className="px-3 py-3 text-xs text-ink">{event.threat}</td>
                  <td className="px-3 py-3 text-xs text-ink-muted">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-3 text-xs capitalize text-ink-muted">{event.review.status.replace('_', ' ')}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                      <UserRound className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true"/>
                      {event.review.reviewerId || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button type="button" onClick={() => setSelected(event)} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-accent ring-1 ring-inset ring-accent/25 hover:bg-accent/10">
                      {event.review.status === 'resolved' ? 'View' : 'Review'}
                    </button>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-faint">
        <CheckCircle2 className="h-3.5 w-3.5 text-low" aria-hidden="true"/>
        Human decisions persist and will be protected from accidental re-analysis.
      </div>

      <ReviewDrawer event={selected} onClose={() => setSelected(null)} onResolve={decide} readOnly={selected?.review.status === 'resolved'} busy={busy}/>
    </div>);
}
