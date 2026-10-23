import { useEffect, useRef, useState } from 'react';
import { simulationDurationSeconds, simulationStartSeconds } from '../data/moderation';
export function usePlayback(mode, initialTime, initialPlaying) {
    const [currentTime, setCurrentTime] = useState(initialTime);
    const [playing, setPlaying] = useState(initialPlaying);
    const previousMode = useRef(mode);
    useEffect(() => {
        if (previousMode.current === mode)
            return;
        previousMode.current = mode;
        setPlaying(false);
        setCurrentTime(mode === 'simulation' ? simulationStartSeconds : 0);
    }, [mode]);
    useEffect(() => {
        if (mode !== 'simulation' || !playing)
            return;
        const timer = window.setInterval(() => {
            setCurrentTime((previous) => previous + 1 >= simulationDurationSeconds ? 0 : previous + 1);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [mode, playing]);
    return { currentTime, setCurrentTime, playing, setPlaying };
}
