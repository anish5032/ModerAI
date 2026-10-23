import { ArrowUpDown, Filter, Play, RefreshCw, ScanSearch, Search, Trash2, UploadCloud, Video as VideoIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DemoNotice, PageHeader } from '../components/platform/PageHeader';
import { RiskPill, StatusPill } from '../components/platform/StatusPill';
import { useVideoLibrary } from '../hooks/useVideoLibrary';
const buttonClass = 'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60';
const rowButtonClass = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-accent ring-1 ring-inset ring-accent/25 hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60';
const selectClass = 'rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
export function Videos() {
    const library = useVideoLibrary();
    const fileInputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [riskFilter, setRiskFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sort, setSort] = useState('newest');
    const [demoLoading, setDemoLoading] = useState(false);
    const loading = library.live ? library.loading : demoLoading;
    const filteredVideos = useMemo(() => {
        const result = library.videos.filter((video) => {
            const matchesQuery = video.name.toLowerCase().includes(query.toLowerCase());
            const matchesRisk = riskFilter === 'all' || video.riskLevel === riskFilter;
            const matchesStatus = statusFilter === 'all' || video.processingStatus === statusFilter;
            return matchesQuery && matchesRisk && matchesStatus;
        });
        return [...result].sort((first, second) => sort === 'risk' ? second.riskScore - first.riskScore :
            sort === 'name' ? first.name.localeCompare(second.name) :
                second.createdAt.localeCompare(first.createdAt));
    }, [library.videos, query, riskFilter, statusFilter, sort]);
    function refresh() {
        if (library.live) {
            void library.refresh();
            return;
        }
        setDemoLoading(true);
        window.setTimeout(() => setDemoLoading(false), 450);
    }
    function handleFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file)
            void library.upload(file);
    }
    function confirmDelete(videoId, name) {
        if (window.confirm(`Delete "${name}" and its moderation results? This cannot be undone.`)) {
            void library.remove(videoId);
        }
    }
    const actions = (<>
      {library.live && (<>
          <input ref={fileInputRef} type="file" accept="video/mp4,video/webm" className="sr-only" onChange={handleFile} aria-label="Upload an MP4 or WebM video"/>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={library.uploading} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white shadow-card hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60">
            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true"/>
            {library.uploading ? 'Uploading…' : 'Upload video'}
          </button>
        </>)}
      <button type="button" onClick={refresh} className={buttonClass}>
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true"/>
        {library.live ? 'Refresh' : loading ? 'Refreshing demo' : 'Refresh demo data'}
      </button>
    </>);
    return (<div className="mx-auto max-w-[1600px]">
      <PageHeader eyebrow="Content inventory" title="Video library" description={library.live ? 'Upload videos, run analysis, and inspect results before opening a moderation workspace.' : 'Search and inspect demo assets before opening a moderation workspace.'} actions={actions}/>

      {library.live
            ? <DemoNotice>Connected to the backend · analysis uses Whisper transcription, the trained text toxicity model, and sampled-frame image-safety classification. Non-speech audio-event detection is not implemented. Model scores are not calibrated probabilities.</DemoNotice>
            : <DemoNotice>Demo video records · no files are stored or uploaded by this page</DemoNotice>}

      {library.error && (<p role="alert" className="mb-4 rounded-lg bg-critical/10 px-3.5 py-2.5 text-xs text-critical ring-1 ring-inset ring-critical/25">{library.error}</p>)}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-line bg-panel p-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true"/>
            <span className="sr-only">Search videos</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search video names" className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"/>
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="risk-filter">Filter by risk</label>
            <select id="risk-filter" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={selectClass}>
              <option value="all">All risk levels</option>
              <option value="safe">Safe</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <label className="sr-only" htmlFor="status-filter">Filter by processing status</label>
            <select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClass}>
              <option value="all">All processing states</option>
              <option value="Queued">Queued</option>
              <option value="Ready">Ready</option>
              <option value="Processing">Processing</option>
              <option value="Needs review">Needs review</option>
              <option value="Failed">Failed</option>
            </select>
            <label className="sr-only" htmlFor="video-sort">Sort videos</label>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden="true"/>
              <select id="video-sort" value={sort} onChange={(event) => setSort(event.target.value)} className={`${selectClass} pl-8`}>
                <option value="newest">Newest first</option>
                <option value="risk">Highest risk</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (<div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-accent" aria-hidden="true"/>
              <p className="text-sm font-medium text-ink">{library.live ? 'Loading your videos' : 'Loading demo records'}</p>
              <p className="text-xs text-ink-faint">{library.live ? 'Contacting the backend…' : 'No backend request is being made.'}</p>
            </div>) : filteredVideos.length === 0 ? (<div className="flex min-h-52 flex-col items-center justify-center gap-2 px-4 text-center">
              <VideoIcon className="h-6 w-6 text-ink-faint" aria-hidden="true"/>
              <p className="text-sm font-medium text-ink">{library.live && library.videos.length === 0 ? 'No videos yet' : 'No videos match'}</p>
              <p className="text-xs text-ink-faint">{library.live && library.videos.length === 0 ? 'Upload an MP4 or WebM video to get started.' : 'Try a different search or filter.'}</p>
            </div>) : (<table className="w-full min-w-[900px] text-left">
              <thead className="bg-surface">
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 font-semibold">Video</th>
                  <th className="px-3 py-3 font-semibold">Duration</th>
                  <th className="px-3 py-3 font-semibold">Processing</th>
                  <th className="px-3 py-3 font-semibold">Risk</th>
                  <th className="px-3 py-3 font-semibold">Moderation</th>
                  <th className="px-3 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3 text-right font-semibold">{library.live ? 'Actions' : 'Open'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredVideos.map((video) => {
                const analyzed = video.analyzed !== false;
                const rowBusy = library.busyId === video.id || video.processingStatus === 'Processing';
                return (<tr key={video.id} className="border-b border-line-soft last:border-0 hover:bg-panel">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink">{video.name}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{video.id}</p>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ink-muted">{video.duration}</td>
                      <td className="px-3 py-3"><StatusPill status={video.processingStatus}/></td>
                      <td className="px-3 py-3">
                        {analyzed ? (<div className="flex items-center gap-2">
                            <RiskPill level={video.riskLevel}/>
                            <span className="font-mono text-[11px] text-ink-faint">{video.riskScore.toFixed(2)}</span>
                          </div>) : <span className="text-xs text-ink-faint">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-muted">{video.moderationStatus}</td>
                      <td className="px-3 py-3 text-xs text-ink-faint">{video.createdLabel}</td>
                      <td className="px-3 py-3 text-right">
                        {library.live ? (<div className="inline-flex items-center gap-2">
                            <button type="button" disabled={rowBusy} onClick={() => void library.analyze(video.id)} className={rowButtonClass}>
                              <ScanSearch className="h-3 w-3" aria-hidden="true"/>
                              {video.processingStatus === 'Processing' ? 'Analyzing…' : analyzed ? 'Re-analyze' : 'Analyze'}
                            </button>
                            {(analyzed || video.processingStatus === 'Processing') && (<Link to={`/moderation?video=${encodeURIComponent(video.id)}`} className={rowButtonClass}>
                                <Play className="h-3 w-3" aria-hidden="true"/>Results
                              </Link>)}
                            <button type="button" disabled={rowBusy} onClick={() => confirmDelete(video.id, video.name)} aria-label={`Delete ${video.name}`} className="rounded-md p-1.5 text-ink-faint hover:bg-critical/10 hover:text-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true"/>
                            </button>
                          </div>) : (<Link to={`/moderation?video=${video.id}`} className={rowButtonClass}>
                            <Play className="h-3 w-3" aria-hidden="true"/>Moderate
                          </Link>)}
                      </td>
                    </tr>);
            })}
              </tbody>
            </table>)}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-panel px-4 py-3 text-[11px] text-ink-faint">
          <span>{filteredVideos.length} of {library.videos.length} {library.live ? 'videos' : 'demo videos'}</span>
          <span className="inline-flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" aria-hidden="true"/>Filters apply locally</span>
        </div>
      </div>
    </div>);
}
