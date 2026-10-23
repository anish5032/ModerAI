import { useMemo } from 'react';
import { manifest } from './canvas.manifest';
export function useScreenInit() {
    return useMemo(() => {
        if (typeof window === 'undefined')
            return {};
        const screenId = new URLSearchParams(window.location.search).get('mp_screen');
        if (!screenId)
            return {};
        const screens = manifest.screens;
        const state = screens[screenId]?.state;
        return (state && typeof state === 'object' ? state : {});
    }, []);
}
