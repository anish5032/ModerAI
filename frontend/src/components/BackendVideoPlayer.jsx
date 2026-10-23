import { useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { videoApi } from "../services/apiService";

function errorMessage(error) {
  return error instanceof Error ? error.message : "Video playback failed.";
}

function mediaErrorMessage(code) {
  if (code === 4) return "This video format is not supported by your browser.";
  if (code === 2) return "The video could not be loaded from the server.";
  if (code === 3) return "The video file could not be decoded.";
  return "The video could not be played.";
}

const retryButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-panel/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function BackendVideoPlayer({ videoId, name }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: "idle" });

  useEffect(() => {
    if (!videoId) {
      setState({ status: "idle" });
      return undefined;
    }

    let cancelled = false;
    setState({ status: "loading" });

    videoApi
      .mediaTicket(videoId)
      .then((ticket) => {
        if (cancelled) return;
        if (!ticket?.token || !ticket?.mediaPath) {
          setState({
            status: "error",
            message: "Video playback could not be prepared.",
          });
          return;
        }
        setState({
          status: "ready",
          src: videoApi.mediaUrl(ticket.mediaPath),
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: "error", message: errorMessage(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, videoId]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  function handleError(event) {
    setState({
      status: "error",
      message: mediaErrorMessage(event.currentTarget.error?.code),
    });
  }

  return (
    <section
      aria-label="Video playback"
      className="mb-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="relative aspect-video w-full bg-black">
        {(state.status === "idle" || state.status === "loading") && (
          <div
            className="flex h-full flex-col items-center justify-center gap-2 text-white/70"
            role="status"
          >
            <Play className="h-6 w-6" aria-hidden="true" />
            <p className="text-xs">Preparing video…</p>
          </div>
        )}

        {state.status === "error" && (
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center gap-3 bg-surface px-6 text-center"
          >
            <div>
              <p className="text-sm font-semibold text-ink">
                Playback unavailable
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {state.message}
              </p>
            </div>
            <button type="button" onClick={retry} className={retryButtonClass}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <video
            key={state.src}
            src={state.src}
            controls
            preload="metadata"
            playsInline
            aria-label={`Playback for ${name || "selected video"}`}
            className="h-full w-full bg-black object-contain"
            onError={handleError}
          />
        )}
      </div>
    </section>
  );
}
