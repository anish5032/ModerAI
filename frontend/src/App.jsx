import { useRef } from 'react';
import { useScreenInit } from './useScreenInit';
import { TopBar } from './components/TopBar';
import { VideoStage } from './components/VideoStage';
import { Timeline } from './components/Timeline';
import { RiskPanel } from './components/RiskPanel';
import { ActionPanel } from './components/ActionPanel';
import { EventFeed } from './components/EventFeed';
import { ReviewDrawer } from './components/ReviewDrawer';
import { useModerationSession } from './hooks/useModerationSession';
import { usePlayback } from './hooks/usePlayback';
import { useReviewSession } from './hooks/useReviewSession';
import { useVideoSession } from './hooks/useVideoSession';
export function App() {
    const screenInit = useScreenInit();
    const fileInputRef = useRef(null);
    const video = useVideoSession(screenInit);
    const playback = usePlayback(video.mode, video.initialTime, video.initialPlaying);
    const moderation = useModerationSession({
        mode: video.mode,
        durationSeconds: video.durationSeconds,
        currentTime: playback.currentTime,
        sourceKey: video.videoUrl,
        initialManualOverride: screenInit.manualOverride,
        initialManualAction: screenInit.manualAction
    });
    const review = useReviewSession(moderation.markReviewed);
    function handleFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file)
            return;
        video.handleFile(file);
        playback.setCurrentTime(0);
        playback.setPlaying(false);
    }
    function handleModeChange(next) {
        video.handleModeChange(next);
    }
    return (<div className="min-h-full w-full bg-canvas font-sans text-ink">
      <input ref={fileInputRef} type="file" accept="video/mp4,video/webm" className="sr-only" onChange={handleFile} aria-label="Upload an MP4 or WebM video"/>


      <TopBar mode={video.mode} processing={playback.playing && moderation.chunks.length > 0} fileName={video.fileName} onModeChange={handleModeChange} onRequestUpload={() => fileInputRef.current?.click()}/>


      <main className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <VideoStage mode={video.mode} videoUrl={video.mode === 'upload' ? video.videoUrl : null} currentTime={playback.currentTime} durationSeconds={video.durationSeconds} playing={playback.playing} activeChunk={moderation.activeChunk} enforcedAction={moderation.enforcedAction} onTogglePlay={() => playback.setPlaying((previous) => !previous)} onSeek={playback.setCurrentTime} onTimeUpdate={playback.setCurrentTime} onDuration={video.handleDuration} onRequestUpload={() => fileInputRef.current?.click()}/>

            {moderation.chunks.length > 0 &&
            <Timeline chunks={moderation.chunks} currentTime={playback.currentTime} durationSeconds={video.durationSeconds} activeChunk={moderation.activeChunk} onSeek={playback.setCurrentTime}/>}
          </div>

          <aside className="min-w-0 space-y-4" aria-label="Risk and policy controls">
            <RiskPanel profile={moderation.profile} activeChunk={moderation.activeChunk}/>
            <ActionPanel profile={moderation.profile} enforcedAction={moderation.enforcedAction} manualOverride={moderation.manualOverride} onToggleOverride={moderation.toggleOverride} onSelectAction={moderation.selectAction}/>

          </aside>

          <div className="min-w-0 xl:col-span-2">
            <EventFeed events={moderation.events} streaming={playback.playing} onReview={review.openReview}/>
          </div>
        </div>
      </main>

      <ReviewDrawer event={review.reviewEvent} onClose={review.closeReview} onResolve={review.resolve}/>

    </div>);
}
