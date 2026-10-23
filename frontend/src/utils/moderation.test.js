import { describe, expect, it } from 'vitest';
import { buildChunks, buildEvent, generateFlags, profileForChunk, recommendAction, scoreToLevel } from './moderation';
describe('moderation utilities', () => {
    it('builds complete two-second chunks and applies flags by id', () => {
        const chunks = buildChunks(5, 2, [{
                id: 2,
                level: 'high',
                modality: 'audio',
                threat: 'Abusive speech'
            }]);
        expect(chunks).toHaveLength(3);
        expect(chunks[1]).toMatchObject({
            id: 2,
            start: 2,
            end: 4,
            level: 'high',
            modality: 'audio'
        });
        expect(chunks[2]).toMatchObject({ id: 3, start: 4, end: 5, level: 'safe' });
    });
    it('maps scores to stable risk levels at each threshold', () => {
        expect(scoreToLevel(0.19)).toBe('safe');
        expect(scoreToLevel(0.2)).toBe('low');
        expect(scoreToLevel(0.4)).toBe('moderate');
        expect(scoreToLevel(0.65)).toBe('high');
        expect(scoreToLevel(0.85)).toBe('critical');
    });
    it('recommends enforcement based on level and primary modality', () => {
        expect(recommendAction('safe', 'visual')).toBe('allow');
        expect(recommendAction('moderate', 'audio')).toBe('flag');
        expect(recommendAction('high', 'visual')).toBe('blur');
        expect(recommendAction('high', 'audio')).toBe('mute');
        expect(recommendAction('critical', 'text')).toBe('block');
    });
    it('creates an event from a chunk profile without changing the profile', () => {
        const chunk = {
            id: 4,
            start: 6,
            end: 8,
            level: 'moderate',
            modality: 'text',
            threat: 'Toxicity in captions'
        };
        const profile = profileForChunk(chunk);
        const event = buildEvent(chunk, profile, 'flag', true);
        expect(event).toMatchObject({
            id: 'chunk-4-6',
            timecode: '00:00:06',
            chunkId: 4,
            modality: 'text',
            action: 'flag',
            reviewed: true
        });
        expect(event.signals).toEqual(profile.signals);
    });
    it('generates deterministic uploaded-video flags', () => {
        const first = generateFlags(60, 2);
        const second = generateFlags(60, 2);
        expect(first).toEqual(second);
        expect(first.every((flag) => flag.id >= 1 && flag.id <= 30)).toBe(true);
        expect(first.every((flag) => flag.threat.length > 0)).toBe(true);
    });
});
