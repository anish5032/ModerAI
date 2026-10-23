import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, ScanSearch, Video as VideoIcon } from "lucide-react";
import { BackendVideoPlayer } from "../components/BackendVideoPlayer";
import { EventFeed } from "../components/EventFeed";
import { ReviewDrawer } from "../components/ReviewDrawer";
import { DemoNotice, PageHeader } from "../components/platform/PageHeader";
import { RiskPill, StatusPill } from "../components/platform/StatusPill";
import { ApiError } from "../lib/api";
import { reviewApi, videoApi } from "../services/apiService";
import {
  formatRiskScore,
  getAudioRisk,
  getCombinedRisk,
  getEffectiveModerationDecision,
  getModalityStatus,
  getPartialAnalysisMessage,
  getTextChunkRisk,
} from "../utils/analysisDisplay";
const buttonClass =
  "inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white shadow-card hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60";
function errorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
export function BackendModeration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get("video") ?? "";
  const [videos, setVideos] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const activeRequestRef = useRef(0);
  const selectedId = useMemo(() => {
    if (requestedId && videos.some((video) => video.id === requestedId))
      return requestedId;
    return videos[0]?.id ?? "";
  }, [requestedId, videos]);
  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedId) ?? null,
    [videos, selectedId],
  );
  const syncUrlToSelection = useCallback(
    (nextId, replace = false) => {
      if (!nextId) return;
      const currentId = searchParams.get("video") ?? "";
      if (currentId !== nextId) setSearchParams({ video: nextId }, { replace });
    },
    [searchParams, setSearchParams],
  );
  const load = useCallback(
    async (videoId = requestedId) => {
      const requestToken = ++activeRequestRef.current;
      setLoading(true);
      try {
        const items = await videoApi.list();
        if (requestToken !== activeRequestRef.current) return;
        setVideos(items);
        const nextId =
          items.find((item) => item.id === videoId)?.id ?? items[0]?.id ?? "";
        if (!nextId) {
          setResult(null);
          return;
        }
        if (requestedId !== nextId) syncUrlToSelection(nextId, true);
        try {
          const nextResult = await videoApi.result(nextId);
          if (requestToken !== activeRequestRef.current) return;
          setResult(nextResult);
        } catch (caught) {
          if (requestToken !== activeRequestRef.current) return;
          if (!(caught instanceof ApiError && caught.status === 404))
            throw caught;
          setResult(null);
        }
        setError(null);
      } catch (caught) {
        if (requestToken !== activeRequestRef.current) return;
        setError(errorMessage(caught));
      } finally {
        if (requestToken === activeRequestRef.current) setLoading(false);
      }
    },
    [requestedId, syncUrlToSelection],
  );
  useEffect(() => {
    void load(requestedId);
  }, [load, requestedId]);
  useEffect(() => {
    if (
      !selectedVideo ||
      (selectedVideo.status !== "processing" && result?.status !== "processing")
    )
      return undefined;
    const timer = window.setInterval(() => {
      void load(selectedVideo.id);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, result?.status, selectedVideo]);
  async function analyze(force = false) {
    if (!selectedVideo) return;
    setBusy(true);
    setError(null);
    try {
      await videoApi.analyze(selectedVideo.id, force);
      await load(selectedVideo.id);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.status === 409 &&
        caught.message.includes("force=true") &&
        window.confirm(
          "This video has human review decisions. Re-analyzing will discard them. Continue?",
        )
      ) {
        try {
          await videoApi.analyze(selectedVideo.id, true);
          await load(selectedVideo.id);
          return;
        } catch (retryError) {
          setError(errorMessage(retryError));
          return;
        }
      }
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function resolveEvent(eventId, action) {
    setBusy(true);
    setError(null);
    try {
      await reviewApi.decide(eventId, action);
      setSelectedEvent(null);
      await load(selectedVideo?.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  const events = result?.events ?? [];
  const hasResults = result?.status === "completed";
  const textRisk = getTextChunkRisk(result);
  const combinedRisk = getCombinedRisk(result);
  const effectiveDecision = getEffectiveModerationDecision(result);
  const partialMessage = getPartialAnalysisMessage(result);
  const textStatus = getModalityStatus(result, "text");
  const visualStatus = getModalityStatus(result, "visual");
  const audioStatus = getModalityStatus(result, "audio");
  const audioRisk = getAudioRisk(result);
  const audioScore = formatRiskScore(audioRisk.score);
  const textScore = formatRiskScore(textRisk.score);
  const visualAnalysis = result?.visualAnalysis ?? {};
  const audioAnalysis = result?.audioAnalysis ?? {};
  const visualModels = Array.isArray(visualAnalysis.models)
    ? visualAnalysis.models
    : [];
  const visualScoreTypes = Array.isArray(visualAnalysis.scoreTypes)
    ? visualAnalysis.scoreTypes
    : [];
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 sm:py-5">
      <PageHeader
        eyebrow="Backend analysis"
        title="Moderation workspace"
        description="Inspect the saved analysis results and review flagged events for your videos."
        actions={
          <button
            type="button"
            onClick={() => void load(selectedId)}
            disabled={loading}
            className={buttonClass}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        }
      />

      <DemoNotice>
        Backend analysis uses Whisper transcription, the trained text toxicity
        model, sampled-frame image-safety classification, and YAMNet non-speech
        audio-event detection. Audio events are review signals, not calibrated
        proof of harmful content.
      </DemoNotice>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-critical/10 px-3.5 py-2.5 text-xs text-critical ring-1 ring-inset ring-critical/25"
        >
          {error}
        </p>
      )}

      <section className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-medium text-ink-muted">
            Select a video
            <select
              value={selectedId}
              onChange={(event) => {
                const nextId = event.target.value;
                if (!nextId) setSearchParams({}, { replace: false });
                else setSearchParams({ video: nextId });
              }}
              className="mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink"
            >
              {videos.length === 0 && (
                <option value="">No videos uploaded</option>
              )}
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.name}
                </option>
              ))}
            </select>
          </label>
          {selectedVideo && (
            <div className="flex items-center gap-3">
              <StatusPill
                status={
                  selectedVideo.status === "ready"
                    ? "Ready"
                    : selectedVideo.status === "needs_review"
                      ? "Needs review"
                      : selectedVideo.status === "processing"
                        ? "Processing"
                        : selectedVideo.status === "failed"
                          ? "Failed"
                          : "Queued"
                }
              />
              {selectedVideo.status !== "processing" && (
                <button
                  type="button"
                  onClick={() => void analyze()}
                  disabled={busy || loading}
                  className={buttonClass}
                >
                  <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />
                  {hasResults ? "Re-analyze" : "Analyze video"}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {selectedVideo && (
        <BackendVideoPlayer
          key={selectedVideo.id}
          videoId={selectedVideo.id}
          name={selectedVideo.name}
        />
      )}

      {!loading && !selectedVideo ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface text-center">
          <VideoIcon className="h-6 w-6 text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">No videos yet</p>
          <p className="text-xs text-ink-faint">
            Upload a video in the library, then return here to analyze it.
          </p>
        </div>
      ) : loading && !selectedVideo ? (
        <p className="py-16 text-center text-sm text-ink-muted" role="status">
          Loading your videos…
        </p>
      ) : result?.status === "processing" ||
        selectedVideo?.status === "processing" ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface text-center">
          <RefreshCw
            className="h-5 w-5 animate-spin text-accent"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-ink">Analysis is running</p>
          <p className="text-xs text-ink-faint">
            This page refreshes automatically when the result is ready.
          </p>
        </div>
      ) : result?.status === "failed" ? (
        <p
          role="alert"
          className="rounded-lg bg-critical/10 px-3.5 py-3 text-sm text-critical"
        >
          {selectedVideo?.error ||
            "Analysis failed. Try analyzing this video again."}
        </p>
      ) : !hasResults ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface text-center">
          <ScanSearch className="h-6 w-6 text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">No analysis result yet</p>
          <p className="text-xs text-ink-faint">
            Start an analysis to view its risk score and moderation events.
          </p>
        </div>
      ) : (
        <>
          {partialMessage && (
            <div
              role="status"
              data-testid="partial-analysis"
              className="mb-4 rounded-lg bg-moderate/10 px-3.5 py-3 text-moderate ring-1 ring-inset ring-moderate/25"
            >
              <p className="text-sm font-semibold">Partial analysis</p>
              <p className="mt-1 text-xs leading-5">{partialMessage}</p>
            </div>
          )}

          <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              data-testid="text-chunk-risk"
              className="rounded-xl border border-line bg-surface p-4 shadow-card"
            >
              <p className="text-xs text-ink-muted">Peak text-chunk risk</p>
              {textRisk.available ? (
                <div className="mt-2 flex items-center gap-2">
                  {textRisk.level ? (
                    <RiskPill level={textRisk.level} />
                  ) : (
                    <span className="text-xs font-semibold text-ink-muted">
                      Level unavailable
                    </span>
                  )}
                  <span className="font-mono text-lg font-semibold text-ink">
                    {textScore ?? "N/A"}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-ink-muted">
                  Not analyzed
                </p>
              )}
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-xs text-ink-muted">Analyzed chunks</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-ink">
                {result.chunkCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-xs text-ink-muted">Flagged events</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-moderate">
                {result.flaggedCount ?? events.length}
              </p>
            </div>
          </section>
          <section className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">
              Combined moderation decision
            </h2>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                data-testid="combined-risk"
                className="rounded-lg border border-line bg-panel p-3"
              >
                <p className="text-xs text-ink-muted">Combined risk level</p>
                <div className="mt-2">
                  {combinedRisk.level ? (
                    <RiskPill level={combinedRisk.level} />
                  ) : (
                    <span className="text-sm font-semibold text-ink-muted">
                      Not available
                    </span>
                  )}
                </div>
                {combinedRisk.source === "visual" && (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Based on flagged visual frames.
                  </p>
                )}
                {combinedRisk.source === "audio" && (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Based on actionable non-speech audio events.
                  </p>
                )}
                {combinedRisk.source === "multiple" && (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Based on more than one modality.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-xs text-ink-muted">Recommended decision</p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {effectiveDecision === "review"
                    ? "Human review required"
                    : effectiveDecision === "allow"
                      ? "Allow"
                      : "Decision unavailable"}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-ink-muted">
              {result.decisionReason ?? "No decision explanation is available."}
            </p>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-xs text-ink-muted">
                Automatic restrictions
              </span>
              <span className="text-xs font-semibold text-ink">
                {result.automaticRestrictionEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <p className="mt-2 text-xs text-ink-faint">
              Combined numeric score: Not calibrated
            </p>
          </section>

          <EventFeed
            events={events}
            streaming={false}
            onReview={setSelectedEvent}
          />

          <section className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">
              Multimodal analysis status
            </h2>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-xs text-ink-muted">Text analysis</p>
                <p
                  data-testid="text-modality-status"
                  className="mt-1 text-sm font-semibold text-ink"
                >
                  {textStatus.label}
                </p>
                {textStatus.state === "completed" && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Segments transcribed:{" "}
                    {result.textAnalysis?.segmentCount ?? 0}
                  </p>
                )}
                {textStatus.state === "failed" &&
                  result.textAnalysis?.error && (
                    <p className="mt-1 break-words text-xs text-critical">
                      {result.textAnalysis.error}
                    </p>
                  )}
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-xs text-ink-muted">Visual analysis</p>
                <p
                  data-testid="visual-modality-status"
                  className="mt-1 text-sm font-semibold text-ink"
                >
                  {visualStatus.label}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Frames sampled:{" "}
                  {visualStatus.state === "completed"
                    ? (visualAnalysis.sampledFrameCount ?? 0)
                    : "N/A"}
                </p>
                <p className="text-xs text-ink-muted">
                  Frames flagged:{" "}
                  {visualStatus.state === "completed"
                    ? (visualAnalysis.flaggedFrameCount ?? 0)
                    : "N/A"}
                </p>
                {visualModels.length > 0 && (
                  <p className="mt-1 break-words text-xs text-ink-muted">
                    Model: {visualModels.join(", ")}
                  </p>
                )}
                {visualStatus.state === "failed" && visualAnalysis.error && (
                  <p className="mt-1 break-words text-xs text-critical">
                    {visualAnalysis.error}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <p className="text-xs text-ink-muted">
                  Non-speech audio analysis
                </p>
                <p
                  data-testid="audio-modality-status"
                  className="mt-1 text-sm font-semibold text-ink"
                >
                  {audioStatus.label}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Actionable events:{" "}
                  {audioStatus.state === "completed"
                    ? audioRisk.eventCount
                    : "N/A"}
                </p>
                <p className="text-xs text-ink-muted">
                  Informational only:{" "}
                  {audioStatus.state === "completed"
                    ? audioRisk.informationalCount
                    : "N/A"}
                </p>
                {audioStatus.state === "completed" && audioScore && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Peak audio risk score: {audioScore}
                  </p>
                )}
                {audioAnalysis.model && (
                  <p className="mt-1 break-words text-xs text-ink-muted">
                    Model: {audioAnalysis.model}
                  </p>
                )}
                {audioStatus.state === "failed" && audioAnalysis.error && (
                  <p className="mt-1 break-words text-xs text-critical">
                    {audioAnalysis.error}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-faint">
                  Speech is transcribed and evaluated separately by the text
                  model.
                </p>
              </div>
            </div>

            {visualScoreTypes.length > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                Vision score type: {visualScoreTypes.join(", ")}
                . These model class scores are not calibrated probabilities.
              </p>
            )}
          </section>
        </>
      )}

      <ReviewDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onResolve={resolveEvent}
        readOnly={selectedEvent?.reviewed ?? false}
        busy={busy}
      />
    </div>
  );
}
