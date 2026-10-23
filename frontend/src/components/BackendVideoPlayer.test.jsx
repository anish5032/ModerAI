// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiService', () => ({
    videoApi: {
        mediaTicket: vi.fn(),
        mediaUrl: vi.fn()
    }
}));

import { BackendVideoPlayer } from './BackendVideoPlayer';
import { videoApi } from '../services/apiService';

function renderPlayer(videoId = 'video-1', name = 'Clip.mp4') {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<BackendVideoPlayer videoId={videoId} name={name} />);
    });
    return { container, root };
}

async function flushPromises() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('BackendVideoPlayer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        vi.mocked(videoApi.mediaUrl).mockImplementation((mediaPath) => `http://localhost:5000${mediaPath}`);
    });

    it('loads a media ticket and renders a native video player', async () => {
        vi.mocked(videoApi.mediaTicket).mockResolvedValue({
            token: 'media-token',
            mediaPath: '/api/videos/video-1/media?token=media-token'
        });

        const { container } = renderPlayer();
        expect(container.textContent).toContain('Preparing video');

        await flushPromises();

        const video = container.querySelector('video');
        expect(videoApi.mediaTicket).toHaveBeenCalledWith('video-1');
        expect(videoApi.mediaUrl).toHaveBeenCalledWith('/api/videos/video-1/media?token=media-token');
        expect(video).toBeTruthy();
        expect(video.getAttribute('src')).toBe('http://localhost:5000/api/videos/video-1/media?token=media-token');
        expect(video.getAttribute('preload')).toBe('metadata');
        expect(video.getAttribute('aria-label')).toBe('Playback for Clip.mp4');
        expect(video.controls).toBe(true);
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows an API error and retries with a new ticket', async () => {
        vi.mocked(videoApi.mediaTicket)
            .mockRejectedValueOnce(new Error('Video file not found.'))
            .mockResolvedValueOnce({
                token: 'fresh-token',
                mediaPath: '/api/videos/video-1/media?token=fresh-token'
            });

        const { container } = renderPlayer();
        await flushPromises();

        expect(container.querySelector('[role="alert"]').textContent).toContain('Video file not found.');

        const retry = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Try again'));
        await act(async () => {
            retry.click();
            await flushPromises();
        });

        expect(videoApi.mediaTicket).toHaveBeenCalledTimes(2);
        expect(container.querySelector('video').getAttribute('src')).toBe('http://localhost:5000/api/videos/video-1/media?token=fresh-token');
    });

    it('reports unsupported video formats without hiding the rest of the workspace', async () => {
        vi.mocked(videoApi.mediaTicket).mockResolvedValue({
            token: 'media-token',
            mediaPath: '/api/videos/video-1/media?token=media-token'
        });

        const { container } = renderPlayer();
        await flushPromises();

        const video = container.querySelector('video');
        Object.defineProperty(video, 'error', {
            configurable: true,
            value: { code: 4 }
        });

        await act(async () => {
            video.dispatchEvent(new Event('error'));
        });

        expect(container.querySelector('[role="alert"]').textContent).toContain('This video format is not supported by your browser.');
        expect(container.querySelector('button').textContent).toContain('Try again');
    });
});
