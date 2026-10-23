// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiService', () => ({
    videoApi: { list: vi.fn() },
    reviewApi: {
        summary: vi.fn(),
        queue: vi.fn()
    }
}));

import { Dashboard } from './Dashboard';
import { reviewApi, videoApi } from '../services/apiService';

const videos = [
    { id: 'v1', name: 'Clip one.mp4', status: 'ready', riskLevel: 'low', riskScore: 0.2 },
    { id: 'v2', name: 'Clip two.mp4', status: 'needs_review', riskLevel: 'high', riskScore: 0.8 },
    { id: 'v3', name: 'Clip three.mp4', status: 'processing', riskLevel: null, riskScore: null }
];
const events = [
    {
        id: 'e1',
        createdAt: '2026-10-23T10:00:00.000Z',
        threat: 'Harassment',
        videoName: 'Clip one.mp4',
        modality: 'text',
        timecode: '00:00:10',
        score: 0.7
    },
    {
        id: 'e2',
        createdAt: '2026-10-23T11:00:00.000Z',
        threat: 'Violence',
        videoName: 'Clip two.mp4',
        modality: 'visual',
        timecode: '00:00:20',
        score: 0.9
    }
];

async function renderDashboard() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<MemoryRouter>
        <Dashboard />
      </MemoryRouter>);
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return { container, root };
}

function metricCards(container) {
    return [...container.querySelectorAll('article')];
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        videoApi.list.mockResolvedValue(videos);
        reviewApi.summary.mockResolvedValue({ pending: 2, resolved: 4, total: 6 });
        reviewApi.queue.mockResolvedValue(events);
    });

    it('renders live metrics and activity from backend data without demo figures', async () => {
        const { container, root } = await renderDashboard();
        const cards = metricCards(container);

        expect(cards).toHaveLength(4);
        expect(cards[0].textContent).toContain('Videos');
        expect(cards[0].textContent).toContain('3');
        expect(cards[1].textContent).toContain('Pending reviews');
        expect(cards[1].textContent).toContain('2');
        expect(cards[2].textContent).toContain('High-risk videos');
        expect(cards[2].textContent).toContain('1');
        expect(cards[3].textContent).toContain('Average risk score');
        expect(cards[3].textContent).toContain('0.50');
        expect(container.textContent).not.toContain('Demo');
        expect(container.textContent).not.toContain('1,284');
        expect(container.textContent).toContain('Recent flagged events');
        expect(container.textContent).toContain('Harassment');
        expect(container.textContent).toContain('Violence');
        expect(container.textContent).toContain('3 loaded videos');
        expect(container.textContent).toContain('Shares are calculated from the loaded videos above.');
        expect(videoApi.list).toHaveBeenCalledTimes(1);
        expect(reviewApi.summary).toHaveBeenCalledTimes(1);
        expect(reviewApi.queue).toHaveBeenCalledWith('all');

        act(() => root.unmount());
    });

    it('shows empty states instead of invented dashboard values', async () => {
        videoApi.list.mockResolvedValue([]);
        reviewApi.summary.mockResolvedValue({ pending: 0, resolved: 0, total: 0 });
        reviewApi.queue.mockResolvedValue([]);

        const { container, root } = await renderDashboard();

        expect(container.textContent).toContain('No videos uploaded yet.');
        expect(container.textContent).toContain('No analyzed videos yet.');
        expect(container.textContent).toContain('No flagged events yet.');
        expect(container.textContent).toContain('Upload a video to see processing status.');
        expect(container.textContent).not.toContain('No production decisions');

        act(() => root.unmount());
    });

    it('shows a clear unavailable state when backend overview data cannot load', async () => {
        videoApi.list.mockRejectedValue(new Error('offline'));
        reviewApi.summary.mockRejectedValue(new Error('offline'));
        reviewApi.queue.mockRejectedValue(new Error('offline'));

        const { container, root } = await renderDashboard();

        expect(container.querySelector('[data-testid="overview-unavailable"]')?.textContent).toContain('No backend data could be loaded. Check the connection and try again.');
        expect(metricCards(container)).toHaveLength(0);
        expect(container.textContent).not.toContain('1,284');
        expect(container.querySelector('[role="alert"]')).not.toBeNull();

        act(() => root.unmount());
    });
});
