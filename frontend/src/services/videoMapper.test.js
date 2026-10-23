import { describe, expect, it } from 'vitest';
import { apiVideoToRecord, formatCreatedLabel, formatDuration } from './videoMapper';
const base = {
    id: 'v1', name: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 10, durationSeconds: 125,
    status: 'queued', riskLevel: null, riskScore: null, error: null,
    createdAt: '2026-09-20T12:42:00Z', updatedAt: '2026-09-20T12:42:00Z'
};
describe('video mapper', () => {
    it('formats durations', () => {
        expect(formatDuration(null)).toBe('—');
        expect(formatDuration(125)).toBe('02:05');
        expect(formatDuration(3725)).toBe('1:02:05');
    });
    it('does not invent a risk for videos that were never analyzed', () => {
        const record = apiVideoToRecord(base);
        expect(record.analyzed).toBe(false);
        expect(record.processingStatus).toBe('Queued'); // must NOT be "Processing" or the UI polls forever
        expect(record.moderationStatus).toBe('Not analyzed');
    });
    it('maps analyzed videos', () => {
        const record = apiVideoToRecord({ ...base, status: 'needs_review', riskLevel: 'high', riskScore: 0.79 });
        expect(record).toMatchObject({ analyzed: true, processingStatus: 'Needs review', moderationStatus: 'Flagged', riskLevel: 'high', riskScore: 0.79, duration: '02:05' });
    });
    it('only the processing status counts as active work', () => {
        expect(apiVideoToRecord({ ...base, status: 'processing' })).toMatchObject({ processingStatus: 'Processing', moderationStatus: 'Analyzing' });
        expect(apiVideoToRecord({ ...base, status: 'failed' })).toMatchObject({ processingStatus: 'Failed', moderationStatus: 'Analysis failed' });
    });
    it('labels today / yesterday / older', () => {
        const now = new Date('2026-09-20T15:00:00');
        expect(formatCreatedLabel(new Date('2026-09-20T09:05:00').toISOString(), now)).toMatch(/^Today, /);
        expect(formatCreatedLabel(new Date('2026-09-19T09:05:00').toISOString(), now)).toMatch(/^Yesterday, /);
        expect(formatCreatedLabel(new Date('2026-09-01T09:05:00').toISOString(), now)).not.toMatch(/Today|Yesterday/);
        expect(formatCreatedLabel('nonsense', now)).toBe('—');
    });
});
