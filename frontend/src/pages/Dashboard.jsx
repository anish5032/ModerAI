import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, PlayCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DemoNotice, PageHeader } from '../components/platform/PageHeader';
import { MetricCard, Panel } from '../components/platform/MetricCard';
import { RiskPill } from '../components/platform/StatusPill';
import { useMockApi } from '../lib/config';
import { reviewApi, videoApi } from '../services/apiService';
import { scoreToLevel } from '../utils/moderation';

const statusGroups = [
    { key: 'ready', label: 'Ready', tone: 'bg-low' },
    { key: 'processing', label: 'Processing', tone: 'bg-accent' },
    { key: 'needs_review', label: 'Needs review', tone: 'bg-moderate' },
    { key: 'failed', label: 'Failed', tone: 'bg-critical' },
    { key: 'queued', label: 'Queued', tone: 'bg-ink-faint' }
];
const activityTone = {
    safe: 'bg-low',
    low: 'bg-low',
    moderate: 'bg-moderate',
    high: 'bg-high',
    critical: 'bg-critical'
};
const retryButtonClass = 'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60';

function formatRelativeTime(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '—';
    const elapsed = Math.max(0, Date.now() - timestamp);
    if (elapsed < 60_000) return 'Just now';
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function metricValue(value) {
    return Number.isFinite(value) ? value : '—';
}

export function Dashboard() {
    const [videos, setVideos] = useState(null);
    const [summary, setSummary] = useState(null);
    const [events, setEvents] = useState(null);
    const [loading, setLoading] = useState(!useMockApi);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (useMockApi) return undefined;

        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.allSettled([
            videoApi.list(),
            reviewApi.summary(),
            reviewApi.queue('all')
        ]).then(([videosResult, summaryResult, eventsResult]) => {
            if (cancelled) return;
            const failures = [];

            if (videosResult.status === 'fulfilled') setVideos(videosResult.value);
            else {
                setVideos(null);
                failures.push('videos');
            }

            if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
            else {
                setSummary(null);
                failures.push('review counts');
            }

            if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value);
            else {
                setEvents(null);
                failures.push('flagged events');
            }

            if (failures.length === 3) setError('Overview data is unavailable. Check the backend connection and try again.');
            else if (failures.length > 0) setError(`Some overview data could not be loaded: ${failures.join(', ')}.`);
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [reloadKey]);

    const analyzedVideos = useMemo(
        () => (videos ?? []).filter((video) => Number.isFinite(video.riskScore)),
        [videos]
    );
    const averageRisk = analyzedVideos.length > 0
        ? analyzedVideos.reduce((total, video) => total + video.riskScore, 0) / analyzedVideos.length
        : null;
    const highRiskCount = (videos ?? []).filter((video) => ['high', 'critical'].includes(video.riskLevel)).length;
    const metrics = [
        {
            label: 'Videos',
            value: videos === null ? '—' : videos.length,
            detail: videos === null ? 'Video data unavailable.' : videos.length === 0 ? 'No videos uploaded yet.' : 'Most recent videos returned by the backend.',
            tone: 'accent',
            badge: 'Live'
        },
        {
            label: 'Pending reviews',
            value: summary === null ? '—' : metricValue(summary.pending),
            detail: summary === null ? 'Review data unavailable.' : 'Flagged events awaiting a human decision.',
            tone: 'moderate',
            badge: 'Live'
        },
        {
            label: 'High-risk videos',
            value: videos === null ? '—' : highRiskCount,
            detail: videos === null ? 'Video data unavailable.' : 'High or critical in the loaded videos.',
            tone: 'critical',
            badge: 'Live'
        },
        {
            label: 'Average risk score',
            value: averageRisk === null ? '—' : averageRisk.toFixed(2),
            detail: analyzedVideos.length > 0 ? `Across ${analyzedVideos.length} analyzed ${analyzedVideos.length === 1 ? 'video' : 'videos'}.` : 'No analyzed videos yet.',
            tone: 'safe',
            badge: 'Live'
        }
    ];
    const recentEvents = useMemo(
        () => [...(events ?? [])]
            .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
            .slice(0, 4),
        [events]
    );
    const statusCounts = useMemo(() => {
        const counts = new Map(statusGroups.map((group) => [group.key, 0]));
        for (const video of videos ?? []) {
            if (counts.has(video.status)) counts.set(video.status, counts.get(video.status) + 1);
        }
        return counts;
    }, [videos]);
    const hasAnyData = videos !== null || summary !== null || events !== null;
    const overviewUnavailable = !loading && !hasAnyData;

    return (<div className="mx-auto max-w-[1600px]">
      <PageHeader eyebrow="Operations overview" title="Moderation at a glance" description={useMockApi ? 'Connect the backend to view operational data from your video library and review queue.' : 'Live operational data from your video library and review queue.'} actions={<div className="flex items-center gap-2">
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading || useMockApi} className={retryButtonClass}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true"/>
            Refresh
          </button>
          <Link to="/moderation" className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-card hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Open moderation <ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Link>
        </div>}/>

      {!useMockApi && <DemoNotice>Live overview · Review counts cover all flagged events. Video metrics cover the most recent videos returned by the API.</DemoNotice>}

      {error && !overviewUnavailable && <p role="alert" className="mb-4 rounded-lg bg-critical/10 px-3.5 py-2.5 text-xs text-critical ring-1 ring-inset ring-critical/25">{error}</p>}

      {loading && !hasAnyData ? (<div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface text-center" role="status">
          <RefreshCw className="h-5 w-5 animate-spin text-accent" aria-hidden="true"/>
          <p className="text-sm font-medium text-ink">Loading overview</p>
          <p className="text-xs text-ink-faint">Contacting the backend for videos and review data.</p>
        </div>) : overviewUnavailable ? (<div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-center">
          <WifiOff className="h-6 w-6 text-ink-faint" aria-hidden="true"/>
          <p className="text-sm font-medium text-ink">Overview data is unavailable</p>
          <p data-testid="overview-unavailable" className="max-w-md text-xs leading-5 text-ink-faint">
            {useMockApi ? 'Overview requires a backend connection. Demo statistics are not shown.' : 'No backend data could be loaded. Check the connection and try again.'}
          </p>
          {!useMockApi && <button type="button" onClick={() => setReloadKey((value) => value + 1)} className={retryButtonClass}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true"/>
              Retry
            </button>}
        </div>) : (<>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric}/>)}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <Panel title="Recent flagged events" eyebrow="Newest review events" action={<Link to="/reviews" className="text-xs font-semibold text-accent hover:text-accent/80">View queue</Link>}>
              {recentEvents.length === 0 ? (<p className="py-8 text-center text-xs text-ink-faint">{events === null ? 'Flagged-event data is unavailable.' : 'No flagged events yet.'}</p>) : (<div className="divide-y divide-line-soft">
                  {recentEvents.map((event) => {
                    const level = scoreToLevel(Number(event.score) || 0);
                    return (<div key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityTone[level]}`} aria-hidden="true"/>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{event.threat || 'Flagged event'}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-muted">{event.videoName || event.videoId || 'Video'} · {event.modality || 'unknown'} · {event.timecode || 'timestamp unavailable'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <RiskPill level={level}/>
                          <span className="text-[11px] text-ink-faint">{formatRelativeTime(event.createdAt)}</span>
                        </div>
                      </div>);
                })}
                </div>)}
            </Panel>

            <Panel title="Processing status" eyebrow={videos === null ? 'Video data unavailable' : `${videos.length} loaded ${videos.length === 1 ? 'video' : 'videos'}`}>
              {videos === null ? (<p className="py-8 text-center text-xs text-ink-faint">Video processing data is unavailable.</p>) : videos.length === 0 ? (<p className="py-8 text-center text-xs text-ink-faint">Upload a video to see processing status.</p>) : (<div className="space-y-3">
                  {statusGroups.map((group) => {
                    const count = statusCounts.get(group.key) ?? 0;
                    const percentage = Math.round((count / videos.length) * 100);
                    return (<div key={group.key}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-ink-muted">{group.label}</span>
                          <span className="font-mono font-semibold text-ink">{count} · {percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-raised"><div className={`h-full rounded-full ${group.tone}`} style={{ width: `${percentage}%` }}/></div>
                      </div>);
                })}
                </div>)}
              <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[11px] text-ink-faint"><Clock3 className="h-3.5 w-3.5" aria-hidden="true"/> Shares are calculated from the loaded videos above.</p>
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link to="/videos" className="group rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/30 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><PlayCircle className="h-4 w-4" aria-hidden="true"/></span><div><p className="text-sm font-semibold text-ink">Open video library</p><p className="mt-0.5 text-xs text-ink-muted">Inspect processing and moderation status.</p></div><ArrowUpRight className="ml-auto h-4 w-4 text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true"/></div></Link>
            <Link to="/reviews" className="group rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/30 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-moderate/10 text-moderate"><Clock3 className="h-4 w-4" aria-hidden="true"/></span><div><p className="text-sm font-semibold text-ink">Open review queue</p><p className="mt-0.5 text-xs text-ink-muted">Resolve flagged moderation events.</p></div><ArrowUpRight className="ml-auto h-4 w-4 text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true"/></div></Link>
          </div>
        </>)}
    </div>);
}
