import { useEffect, useRef, useState } from 'react';
import { MaximizeIcon, PauseIcon, PlayIcon, UploadCloudIcon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { formatTimecode, riskBadgeClass, riskLevelLabel } from '../utils/moderation';
import { streamPosterUrl } from '../data/moderation';
export function VideoStage({ mode, videoUrl, currentTime, durationSeconds, playing, activeChunk, enforcedAction, onTogglePlay, onSeek, onTimeUpdate, onDuration, onRequestUpload }) {
    const videoRef = useRef(null);
    const [userMuted, setUserMuted] = useState(false);
    const policyMuted = enforcedAction === 'mute' || enforcedAction === 'block';
    const blurred = enforcedAction === 'blur';
    const blocked = enforcedAction === 'block';
    const muted = policyMuted || userMuted;
    useEffect(() => {
        const element = videoRef.current;
        if (!element)
            return;
        if (playing) {
            const attempt = element.play();
            if (attempt)
                attempt.catch(() => undefined);
        }
        else {
            element.pause();
        }
    }, [playing, videoUrl]);
    useEffect(() => {
        const element = videoRef.current;
        if (!element)
            return;
        if (Math.abs(element.currentTime - currentTime) > 0.75) {
            element.currentTime = currentTime;
        }
    }, [currentTime]);
    useEffect(() => {
        const element = videoRef.current;
        if (element)
            element.muted = muted;
    }, [muted]);
    function handleScrub(event) {
        onSeek(Number(event.target.value));
    }
    const showPlaceholder = mode === 'upload' && !videoUrl;
    return (<section className="relative bg-ink" aria-label="Video stage">
      <div className="relative aspect-video w-full overflow-hidden bg-ink">
        {showPlaceholder ?
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-ink px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
              <UploadCloudIcon className="h-6 w-6" aria-hidden="true"/>
            </span>
            <p className="text-sm font-semibold text-white">No video loaded</p>
            <p className="max-w-sm text-xs text-white/60">
              Upload an MP4 or WebM file to run it through the multimodal pipeline. Chunking starts
              automatically once metadata is read.
            </p>
            <button type="button" onClick={onRequestUpload} className="mt-1 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            
              Choose a file
            </button>
          </div> :
            videoUrl ?
                <video ref={videoRef} src={videoUrl} playsInline className={[
                        'h-full w-full object-contain transition-[filter,opacity] duration-200 ease-out',
                        blurred ? 'blur-2xl scale-105' : '',
                        blocked ? 'opacity-10' : ''
                    ].
                        join(' ')} onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)} onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}/> :
                <img src={streamPosterUrl} alt="Current stream frame: a person speaking to camera in a dim home studio" className={[
                        'h-full w-full object-cover transition-[filter,opacity] duration-200 ease-out',
                        blurred ? 'blur-2xl scale-105' : '',
                        blocked ? 'opacity-10' : ''
                    ].
                        join(' ')}/>}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-ink/75 px-2 py-1 font-mono text-xs text-white ring-1 ring-inset ring-white/15">
              {formatTimecode(currentTime)}
              <span className="text-white/50"> / {formatTimecode(durationSeconds)}</span>
            </span>
            {activeChunk &&
            <span className="rounded-md bg-ink/75 px-2 py-1 font-mono text-xs text-white ring-1 ring-inset ring-white/15">
                <span className="text-white/50">CHUNK </span>#{activeChunk.id}
              </span>}
            {activeChunk &&
            <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${riskBadgeClass[activeChunk.level]}`}>
              
                {riskLevelLabel[activeChunk.level]}
              </span>}
          </div>
          {(policyMuted || blurred) &&
            <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold text-ink shadow-card">
              {blocked ?
                    'PLAYBACK BLOCKED' :
                    policyMuted ?
                        'AUDIO MUTED BY POLICY' :
                        'VIDEO BLURRED BY POLICY'}
            </span>}
        </div>

        {blocked &&
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-sm font-semibold text-white">Playback blocked</span>
            <span className="max-w-xs text-xs text-white/60">
              Takedown enforced for this chunk. Restoring requires a senior reviewer.
            </span>
          </div>}

        {!showPlaceholder &&
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-ink/80 px-3 py-2.5 sm:gap-3 sm:px-4">
            <button type="button" onClick={onTogglePlay} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink transition-transform duration-150 ease-out hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={playing ? 'Pause' : 'Play'}>
            
              {playing ?
                    <PauseIcon className="h-4 w-4" aria-hidden="true"/> :
                    <PlayIcon className="ml-0.5 h-4 w-4" aria-hidden="true"/>}
            </button>

            <span className="shrink-0 font-mono text-[11px] text-white/80">
              {formatTimecode(currentTime)}
            </span>

            <input type="range" min={0} max={Math.max(1, Math.floor(durationSeconds))} step={1} value={Math.floor(currentTime)} onChange={handleScrub} className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-white" aria-label="Scrub video"/>
          

            <span className="shrink-0 font-mono text-[11px] text-white/50">
              {formatTimecode(durationSeconds)}
            </span>

            <button type="button" onClick={() => setUserMuted((prev) => !prev)} disabled={policyMuted} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:text-high" aria-label={muted ? 'Unmute' : 'Mute'}>
            
              {muted ?
                    <VolumeXIcon className="h-4 w-4" aria-hidden="true"/> :
                    <Volume2Icon className="h-4 w-4" aria-hidden="true"/>}
            </button>
            <button type="button" onClick={() => videoRef.current?.requestFullscreen?.()} className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex" aria-label="Fullscreen">
            
              <MaximizeIcon className="h-4 w-4" aria-hidden="true"/>
            </button>
          </div>}
      </div>
    </section>);
}
