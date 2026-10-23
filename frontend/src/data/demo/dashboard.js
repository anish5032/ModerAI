export const demoDashboardMetrics = [
    { label: 'Videos processed', value: '1,284', detail: 'Demo period · last 30 days', tone: 'accent' },
    { label: 'Needs review', value: '86', detail: '6.7% of demo volume', tone: 'moderate' },
    { label: 'High-risk content', value: '24', detail: 'Demo classification only', tone: 'critical' },
    { label: 'Average risk score', value: '0.31', detail: 'Across demo chunks', tone: 'safe' }
];
export const demoDashboardActivity = [
    { id: 'activity-1', label: 'Demo review queue updated', detail: '4 flagged events awaiting review', time: '2 min ago', tone: 'moderate' },
    { id: 'activity-2', label: 'Demo video processed', detail: 'creator-session-042.webm', time: '8 min ago', tone: 'safe' },
    { id: 'activity-3', label: 'Demo policy action', detail: 'Audio mute recommended for chunk #43', time: '14 min ago', tone: 'high' },
    { id: 'activity-4', label: 'Demo processing job completed', detail: 'community-roundup.mp4', time: '22 min ago', tone: 'accent' }
];
export const demoProcessingStatus = [
    { label: 'Ready', value: 72, tone: 'bg-low' },
    { label: 'Processing', value: 18, tone: 'bg-accent' },
    { label: 'Needs review', value: 8, tone: 'bg-moderate' },
    { label: 'Failed', value: 2, tone: 'bg-critical' }
];
