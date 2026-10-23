const processingLabel = {
    queued: 'Queued',
    processing: 'Processing',
    ready: 'Ready',
    needs_review: 'Needs review',
    failed: 'Failed'
};
const moderationLabel = {
    queued: 'Not analyzed',
    processing: 'Analyzing',
    ready: 'Cleared',
    needs_review: 'Flagged',
    failed: 'Analysis failed'
};
export function formatDuration(totalSeconds) {
    if (totalSeconds === null)
        return '—';
    const safe = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return hours > 0 ? `${hours}:${mmss}` : mmss;
}
export function formatCreatedLabel(iso, now = new Date()) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return '—';
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, now))
        return `Today, ${time}`;
    if (sameDay(date, yesterday))
        return `Yesterday, ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
/** Adapts an API video to the record shape the existing Videos table already renders. */
export function apiVideoToRecord(video) {
    return {
        id: video.id,
        name: video.name,
        duration: formatDuration(video.durationSeconds),
        durationSeconds: video.durationSeconds ?? 0,
        processingStatus: processingLabel[video.status],
        moderationStatus: moderationLabel[video.status],
        // Not analyzed yet -> no risk is shown (analyzed=false) rather than inventing one.
        riskLevel: video.riskLevel ?? 'safe',
        riskScore: video.riskScore ?? 0,
        createdAt: video.createdAt,
        createdLabel: formatCreatedLabel(video.createdAt),
        analyzed: video.riskLevel !== null
    };
}
