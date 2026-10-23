import { buildEvent, profileForChunk } from '../../utils/moderation';
function reviewFromChunk(id, chunk, status, reviewer) {
    const profile = profileForChunk(chunk);
    const event = buildEvent(chunk, profile, profile.recommended);
    return {
        id,
        severity: profile.level,
        score: profile.composite,
        modality: profile.primary,
        threat: profile.threat,
        timestamp: event.timecode,
        status,
        reviewer,
        action: event.action,
        event
    };
}
export const demoReviews = [
    reviewFromChunk('review-001', { id: 43, start: 84, end: 86, level: 'critical', modality: 'audio', threat: 'Harmful speech' }, 'Pending', 'Unassigned'),
    reviewFromChunk('review-002', { id: 42, start: 82, end: 84, level: 'high', modality: 'text', threat: 'Toxicity detected' }, 'In review', 'Anish Amanagi'),
    reviewFromChunk('review-003', { id: 34, start: 66, end: 68, level: 'moderate', modality: 'text', threat: 'Harassment phrasing' }, 'Pending', 'Unassigned'),
    reviewFromChunk('review-004', { id: 21, start: 40, end: 42, level: 'high', modality: 'audio', threat: 'Abusive speech' }, 'Resolved', 'Anish Amanagi')
];
