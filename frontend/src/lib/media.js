/** Reads a video's duration in seconds from its metadata (the backend needs it to size the analysis). */
export function readVideoDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        const finish = (value) => {
            URL.revokeObjectURL(url);
            video.removeAttribute('src');
            resolve(value);
        };
        const timeout = window.setTimeout(() => finish(null), 8000);
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            window.clearTimeout(timeout);
            finish(Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : null);
        };
        video.onerror = () => { window.clearTimeout(timeout); finish(null); };
        video.src = url;
    });
}
