import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { useMockApi } from '../lib/config';
import { readVideoDuration } from '../lib/media';
import { demoVideos } from '../data/demo/videos';
import { videoApi } from '../services/apiService';
import { apiVideoToRecord } from '../services/videoMapper';
const POLL_MS = 3000;
function messageOf(error) {
    return error instanceof Error ? error.message : 'Something went wrong.';
}
/** Demo mode: static demo records. Live mode: the user's real videos from the backend. */
export function useVideoLibrary() {
    const [videos, setVideos] = useState(useMockApi ? demoVideos : []);
    const [loading, setLoading] = useState(!useMockApi);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const refresh = useCallback(async (silent = false) => {
        if (useMockApi)
            return;
        if (!silent)
            setLoading(true);
        try {
            const list = await videoApi.list();
            if (!mounted.current)
                return;
            setVideos(list.map(apiVideoToRecord));
            setError(null);
        }
        catch (caught) {
            if (mounted.current)
                setError(messageOf(caught));
        }
        finally {
            if (mounted.current && !silent)
                setLoading(false);
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    // While anything is analyzing, poll until it settles.
    const hasActiveWork = videos.some((video) => video.processingStatus === 'Processing');
    useEffect(() => {
        if (useMockApi || !hasActiveWork)
            return;
        const timer = window.setInterval(() => { void refresh(true); }, POLL_MS);
        return () => window.clearInterval(timer);
    }, [hasActiveWork, refresh]);
    const upload = useCallback(async (file) => {
        setUploading(true);
        setError(null);
        try {
            if (!['video/mp4', 'video/webm'].includes(file.type))
                throw new Error('Please choose an MP4 or WebM video.');
            const duration = await readVideoDuration(file);
            await videoApi.upload(file, duration);
            await refresh(true);
        }
        catch (caught) {
            if (mounted.current)
                setError(messageOf(caught));
        }
        finally {
            if (mounted.current)
                setUploading(false);
        }
    }, [refresh]);
    const analyze = useCallback(async (videoId, force = false) => {
        setBusyId(videoId);
        setError(null);
        try {
            await videoApi.analyze(videoId, force);
            await refresh(true);
        }
        catch (caught) {
            // The API refuses to silently discard human review decisions; ask first.
            if (caught instanceof ApiError && caught.status === 409 && caught.message.includes('force=true') &&
                window.confirm('This video has human review decisions. Re-analyzing will discard them. Continue?')) {
                try {
                    await videoApi.analyze(videoId, true);
                    await refresh(true);
                    return;
                }
                catch (retryError) {
                    if (mounted.current)
                        setError(messageOf(retryError));
                    return;
                }
            }
            if (mounted.current)
                setError(messageOf(caught));
        }
        finally {
            if (mounted.current)
                setBusyId(null);
        }
    }, [refresh]);
    const remove = useCallback(async (videoId) => {
        setBusyId(videoId);
        setError(null);
        try {
            await videoApi.remove(videoId);
            await refresh(true);
        }
        catch (caught) {
            if (mounted.current)
                setError(messageOf(caught));
        }
        finally {
            if (mounted.current)
                setBusyId(null);
        }
    }, [refresh]);
    return { live: !useMockApi, videos, loading, error, busyId, uploading, refresh, upload, analyze, remove };
}
