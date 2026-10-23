// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiService', () => ({
    videoApi: {
        list: vi.fn(),
        result: vi.fn(),
        analyze: vi.fn(),
        mediaTicket: vi.fn(),
        mediaUrl: vi.fn()
    },
    reviewApi: {
        decide: vi.fn()
    }
}));

import { BackendModeration } from './BackendModeration';
import { videoApi } from '../services/apiService';

function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderModeration(initialPath = '/moderation') {
    window.history.pushState({}, '', initialPath);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <BrowserRouter>
                <Routes>
                    <Route path="/moderation" element={<><LocationDisplay /><BackendModeration /></>} />
                </Routes>
            </BrowserRouter>
        );
    });
    return { container, root };
}

async function flushPromises() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function renderResult(result, videoStatus = 'ready') {
    vi.mocked(videoApi.list).mockResolvedValue([
        { id: 'a', name: 'Video A', status: videoStatus }
    ]);
    vi.mocked(videoApi.result).mockResolvedValue(result);
    const { container } = renderModeration('/moderation?video=a');
    await flushPromises();
    return container;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('BackendModeration selection flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        vi.mocked(videoApi.mediaTicket).mockResolvedValue({
            token: 'media-token',
            mediaPath: '/api/videos/a/media?token=media-token'
        });
        vi.mocked(videoApi.mediaUrl).mockImplementation((mediaPath) => `http://localhost:5000${mediaPath}`);
    });

    it('loads the selected video from the query string', async () => {
        const videos = [
            { id: 'a', name: 'Video A', status: 'ready' },
            { id: 'b', name: 'Video B', status: 'ready' }
        ];
        vi.mocked(videoApi.list).mockResolvedValue(videos);
        vi.mocked(videoApi.result).mockImplementation(async (videoId) => ({
            status: 'completed',
            events: [{ id: `event-${videoId}`, timecode: '00:01', chunkId: 1, modality: 'text', threat: `Threat ${videoId}`, score: 0.8, action: 'block', reviewed: false }]
        }));

        const { container } = renderModeration('/moderation?video=b');
        await flushPromises();

        const select = container.querySelector('select');
        expect(select.value).toBe('b');
        expect(container.querySelector('[data-testid="location"]').textContent).toBe('/moderation?video=b');
        expect(videoApi.result).toHaveBeenCalledWith('b');
        expect(videoApi.mediaTicket).toHaveBeenCalledWith('b');
        expect(container.querySelector('video')).toBeTruthy();
        expect(container.textContent).not.toContain('Video playback is unavailable');
    });

    it('updates the URL and selected video when the dropdown changes', async () => {
        const videos = [
            { id: 'a', name: 'Video A', status: 'ready' },
            { id: 'b', name: 'Video B', status: 'ready' }
        ];
        vi.mocked(videoApi.list).mockResolvedValue(videos);
        vi.mocked(videoApi.result).mockResolvedValue({ status: 'completed', events: [] });

        const { container } = renderModeration('/moderation?video=a');
        await flushPromises();

        const select = container.querySelector('select');
        await act(async () => {
            select.value = 'b';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await flushPromises();
        });

        expect(select.value).toBe('b');
        expect(container.querySelector('[data-testid="location"]').textContent).toBe('/moderation?video=b');
    });

    it('keeps the selection in sync with browser back and forward navigation', async () => {
        const videos = [
            { id: 'a', name: 'Video A', status: 'ready' },
            { id: 'b', name: 'Video B', status: 'ready' }
        ];
        vi.mocked(videoApi.list).mockResolvedValue(videos);
        vi.mocked(videoApi.result).mockResolvedValue({ status: 'completed', events: [] });

        const { container } = renderModeration('/moderation?video=a');
        await flushPromises();

        const select = container.querySelector('select');
        await act(async () => {
            select.value = 'b';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await flushPromises();
        });
        expect(container.querySelector('[data-testid="location"]').textContent).toBe('/moderation?video=b');

        await act(async () => {
            window.history.pushState({}, '', '/moderation?video=a');
            window.dispatchEvent(new PopStateEvent('popstate'));
            await flushPromises();
        });
        expect(container.querySelector('[data-testid="location"]').textContent).toBe('/moderation?video=a');
        expect(container.querySelector('select').value).toBe('a');
    });

    it('does not create a navigation loop for an empty or invalid video query', async () => {
        vi.mocked(videoApi.list).mockResolvedValue([]);

        const { container } = renderModeration('/moderation?video=missing');
        await flushPromises();

        expect(container.querySelector('[data-testid="location"]').textContent).toBe('/moderation?video=missing');
        expect(container.querySelector('select').value).toBe('');
        expect(videoApi.list).toHaveBeenCalledTimes(1);
    });

    it('rejects stale async results from a previous selection', async () => {
        const videos = [
            { id: 'a', name: 'Video A', status: 'ready' },
            { id: 'b', name: 'Video B', status: 'ready' }
        ];
        vi.mocked(videoApi.list).mockResolvedValue(videos);

        let resolveA;
        let resolveB;
        vi.mocked(videoApi.result).mockImplementation((videoId) => {
            if (videoId === 'a') {
                return new Promise((resolve) => {
                    resolveA = resolve;
                });
            }
            return new Promise((resolve) => {
                resolveB = resolve;
            });
        });

        const { container } = renderModeration('/moderation?video=a');
        await flushPromises();

        const select = container.querySelector('select');
        await act(async () => {
            select.value = 'b';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await flushPromises();
        });

        await act(async () => {
            resolveB({
                status: 'completed',
                events: [{ id: 'event-b', timecode: '00:02', chunkId: 2, modality: 'text', threat: 'B result', score: 0.9, action: 'block', reviewed: false }]
            });
            await flushPromises();
        });
        expect(document.body.textContent).toContain('B result');

        await act(async () => {
            resolveA({
                status: 'completed',
                events: [{ id: 'event-a', timecode: '00:01', chunkId: 1, modality: 'text', threat: 'A stale', score: 0.6, action: 'review', reviewed: false }]
            });
            await flushPromises();
        });

        expect(document.body.textContent).not.toContain('A stale');
    });

    it('re-analyzes the currently selected video only', async () => {
        const videos = [
            { id: 'a', name: 'Video A', status: 'ready' },
            { id: 'b', name: 'Video B', status: 'ready' }
        ];
        vi.mocked(videoApi.list).mockResolvedValue(videos);
        vi.mocked(videoApi.result).mockResolvedValue({ status: 'completed', events: [] });
        vi.mocked(videoApi.analyze).mockResolvedValue(undefined);

        const { container } = renderModeration('/moderation?video=b');
        await flushPromises();

        const analyzeButton = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Re-analyze'));
        expect(analyzeButton).toBeTruthy();

        await act(async () => {
            analyzeButton.click();
            await flushPromises();
        });

        expect(videoApi.analyze).toHaveBeenCalledWith('b', false);
    });

    it('shows combined risk separately from peak text-chunk risk', async () => {
        const container = await renderResult({
            status: 'completed',
            analysisStatus: 'completed',
            partial: false,
            riskLevel: 'safe',
            riskScore: 0,
            combinedRiskLevel: 'high',
            moderationDecision: 'review',
            decisionReason: 'A sampled visual frame was flagged.',
            chunkCount: 3,
            flaggedCount: 1,
            modalitiesAnalyzed: ['text', 'visual'],
            unavailableModalities: ['audio'],
            textAnalysis: { status: 'completed', segmentCount: 3 },
            visualAnalysis: {
                status: 'completed',
                sampledFrameCount: 10,
                flaggedFrameCount: 1,
                models: ['image-safety'],
                scoreTypes: ['model class score']
            },
            events: []
        });

        const textRisk = container.querySelector('[data-testid="text-chunk-risk"]');
        const combinedRisk = container.querySelector('[data-testid="combined-risk"]');

        expect(textRisk.textContent).toContain('Peak text-chunk risk');
        expect(textRisk.textContent).toContain('safe');
        expect(textRisk.textContent).toContain('0.00');
        expect(combinedRisk.textContent).toContain('Combined risk level');
        expect(combinedRisk.textContent).toContain('high');
        expect(container.textContent).toContain('Human review required');
        expect(container.querySelector('[data-testid="partial-analysis"]')).toBeNull();
    });

    it('does not show safe text risk for a vision-only result', async () => {
        const container = await renderResult({
            status: 'completed',
            analysisStatus: 'partial',
            partial: true,
            riskLevel: 'safe',
            riskScore: 0,
            combinedRiskLevel: 'moderate',
            moderationDecision: 'review',
            decisionReason: 'Visual analysis is incomplete or unavailable; human review required.',
            chunkCount: 3,
            flaggedCount: 1,
            modalitiesAnalyzed: ['visual'],
            unavailableModalities: ['text', 'audio'],
            textAnalysis: {
                status: 'failed',
                segmentCount: 0,
                error: 'No audio stream'
            },
            visualAnalysis: {
                status: 'completed',
                sampledFrameCount: 10,
                flaggedFrameCount: 1,
                models: ['image-safety'],
                scoreTypes: ['model class score']
            },
            events: []
        });

        const textRisk = container.querySelector('[data-testid="text-chunk-risk"]');
        const combinedRisk = container.querySelector('[data-testid="combined-risk"]');
        const partial = container.querySelector('[data-testid="partial-analysis"]');

        expect(textRisk.textContent).toContain('Not analyzed');
        expect(textRisk.textContent).not.toContain('safe');
        expect(textRisk.textContent).not.toContain('0.00');
        expect(combinedRisk.textContent).toContain('moderate');
        expect(combinedRisk.textContent).not.toContain('safe');
        expect(partial.textContent).toContain('Text analysis is unavailable');
        expect(partial.textContent).toContain('visual analysis only');
        expect(partial.textContent).toContain('Human review is required');
        expect(container.querySelector('[data-testid="text-modality-status"]').textContent).toBe('Unavailable');
    });

    it('shows partial analysis and preserved text risk when vision fails', async () => {
        const container = await renderResult({
            status: 'completed',
            analysisStatus: 'partial',
            partial: true,
            riskLevel: 'high',
            riskScore: 0.82,
            combinedRiskLevel: 'high',
            moderationDecision: 'review',
            decisionReason: 'Text toxicity assessment requires human review.',
            chunkCount: 2,
            flaggedCount: 1,
            modalitiesAnalyzed: ['text'],
            unavailableModalities: ['visual', 'audio'],
            textAnalysis: { status: 'completed', segmentCount: 2 },
            visualAnalysis: {
                status: 'failed',
                sampledFrameCount: 0,
                flaggedFrameCount: 0,
                models: [],
                scoreTypes: [],
                error: 'Vision service unavailable'
            },
            events: []
        });

        const textRisk = container.querySelector('[data-testid="text-chunk-risk"]');
        const combinedRisk = container.querySelector('[data-testid="combined-risk"]');
        const partial = container.querySelector('[data-testid="partial-analysis"]');

        expect(textRisk.textContent).toContain('high');
        expect(textRisk.textContent).toContain('0.82');
        expect(combinedRisk.textContent).toContain('high');
        expect(partial.textContent).toContain('Visual analysis is unavailable');
        expect(partial.textContent).toContain('text analysis only');
        expect(container.querySelector('[data-testid="visual-modality-status"]').textContent).toBe('Unavailable');
    });

    it('shows actionable audio events and combined audio risk', async () => {
        const container = await renderResult({
            status: 'completed',
            analysisStatus: 'completed',
            partial: false,
            riskLevel: 'safe',
            riskScore: 0,
            combinedRiskLevel: 'high',
            moderationDecision: 'review',
            decisionReason: 'Actionable non-speech audio events require review.',
            chunkCount: 2,
            flaggedCount: 1,
            modalityRiskScores: { text: 0, visual: 0, audio: 0.64 },
            modalitiesAnalyzed: ['text', 'visual', 'audio'],
            unavailableModalities: [],
            textAnalysis: { status: 'completed', segmentCount: 2 },
            visualAnalysis: {
                status: 'completed',
                sampledFrameCount: 6,
                flaggedFrameCount: 0,
                models: ['image-safety'],
                scoreTypes: ['model class score']
            },
            audioAnalysis: {
                status: 'completed',
                model: 'audiomagic/yamnet-onnx',
                riskLevel: 'high',
                actionableRiskLevel: 'high',
                riskScore: 0.64,
                actionableEventCount: 2,
                informationalEventCount: 1,
                flaggedEventCount: 2
            },
            events: []
        });

        const audioStatus = container.querySelector('[data-testid="audio-modality-status"]');
        const combinedRisk = container.querySelector('[data-testid="combined-risk"]');

        expect(audioStatus.textContent).toBe('Completed');
        expect(container.textContent).toContain('Actionable events: 2');
        expect(container.textContent).toContain('Informational only: 1');
        expect(container.textContent).toContain('Peak audio risk score: 0.64');
        expect(container.textContent).toContain('Model: audiomagic/yamnet-onnx');
        expect(combinedRisk.textContent).toContain('high');
        expect(container.textContent).toContain('Based on actionable non-speech audio events.');
        expect(container.querySelector('[data-testid="partial-analysis"]')).toBeNull();
    });

    it('shows partial analysis when audio event detection fails', async () => {
        const container = await renderResult({
            status: 'completed',
            analysisStatus: 'partial',
            partial: true,
            riskLevel: 'safe',
            riskScore: 0,
            combinedRiskLevel: 'safe',
            moderationDecision: 'review',
            decisionReason: 'Audio analysis is incomplete; human review required.',
            chunkCount: 2,
            flaggedCount: 0,
            modalitiesAnalyzed: ['text', 'visual'],
            unavailableModalities: ['audio'],
            textAnalysis: { status: 'completed', segmentCount: 2 },
            visualAnalysis: {
                status: 'completed',
                sampledFrameCount: 6,
                flaggedFrameCount: 0,
                models: ['image-safety'],
                scoreTypes: ['model class score']
            },
            audioAnalysis: {
                status: 'failed',
                error: 'Audio event model unavailable'
            },
            events: []
        });

        const partial = container.querySelector('[data-testid="partial-analysis"]');
        const audioStatus = container.querySelector('[data-testid="audio-modality-status"]');

        expect(audioStatus.textContent).toBe('Unavailable');
        expect(partial.textContent).toContain('Audio analysis is unavailable');
        expect(partial.textContent).toContain('text and visual analysis only');
        expect(container.textContent).toContain('Audio event model unavailable');
        expect(container.textContent).toContain('Human review required');
    });

    it('shows no-audio as not applicable without marking analysis partial', async () => {
        const container = await renderResult({
            status: 'completed',
            analysisStatus: 'completed',
            partial: false,
            riskLevel: 'safe',
            riskScore: 0,
            combinedRiskLevel: 'safe',
            moderationDecision: 'allow',
            chunkCount: 2,
            flaggedCount: 0,
            modalitiesAnalyzed: ['text', 'visual'],
            unavailableModalities: ['audio'],
            textAnalysis: { status: 'completed', segmentCount: 2 },
            visualAnalysis: {
                status: 'completed',
                sampledFrameCount: 6,
                flaggedFrameCount: 0,
                models: ['image-safety'],
                scoreTypes: ['model class score']
            },
            audioAnalysis: {
                status: 'no_audio',
                events: [],
                riskLevel: 'safe',
                riskScore: 0
            },
            events: []
        });

        const audioStatus = container.querySelector('[data-testid="audio-modality-status"]');

        expect(audioStatus.textContent).toBe('No audio track');
        expect(container.querySelector('[data-testid="combined-risk"]').textContent).toContain('safe');
        expect(container.querySelector('[data-testid="partial-analysis"]')).toBeNull();
        expect(container.textContent).not.toContain('Audio analysis is unavailable');
    });

    it('renders results with missing modality fields without crashing', async () => {
        const container = await renderResult({
            status: 'completed',
            events: []
        });

        expect(container.querySelector('[data-testid="text-chunk-risk"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="combined-risk"]').textContent).toContain('Not available');
        expect(container.textContent).toContain('Decision unavailable');
    });
});
