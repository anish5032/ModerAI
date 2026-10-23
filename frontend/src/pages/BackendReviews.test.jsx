// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiService', () => ({
    reviewApi: {
        queue: vi.fn(),
        summary: vi.fn(),
        decide: vi.fn()
    }
}));

import { BackendReviews } from './BackendReviews';
import { reviewApi } from '../services/apiService';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flushPromises() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function renderReviews() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <BrowserRouter>
                <BackendReviews />
            </BrowserRouter>
        );
    });
    return container;
}

describe('BackendReviews summary counts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('shows counts for the full queue instead of only the visible status', async () => {
        vi.mocked(reviewApi.queue).mockResolvedValue([
            {
                id: 'event-1',
                score: 0.9,
                videoName: 'Video A',
                chunkId: 1,
                timecode: '00:01',
                modality: 'text',
                threat: 'Threat A',
                createdAt: '2026-09-20T12:42:00Z',
                review: { status: 'pending', reviewerId: null }
            }
        ]);
        vi.mocked(reviewApi.summary).mockResolvedValue({
            pending: 5,
            resolved: 3,
            total: 8
        });

        const container = renderReviews();
        await flushPromises();

        expect(container.querySelector('[data-testid="pending-count"]').textContent).toBe('5');
        expect(container.querySelector('[data-testid="resolved-count"]').textContent).toBe('3');
        expect(container.querySelector('[data-testid="total-count"]').textContent).toBe('8');
        expect(container.textContent).toContain('Whisper transcription');
        expect(container.textContent).not.toContain('placeholder analyzer');
    });
});
