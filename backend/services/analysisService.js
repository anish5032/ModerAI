import { config, MAX_CHUNKS } from "../config.js";
import { getDb } from "../db.js";
import { createId, now } from "../utils/common.js";
import { predictText } from "./mlService.js";
import { transcribeVideo } from "./transcriptionService.js";
import { analyzeVideoFrames } from "./visionService.js";
import { resolveStored } from "./videoService.js";

export const ANALYZER_ID = "whisper-base+text-toxicity-v1";

const labels = {
  text: "Speech / Transcript Toxicity",
};

const categoryLabels = {
  toxic: "Toxic",
  severe_toxic: "Severe Toxicity",
  obscene: "Obscene",
  threat: "Threat",
  insult: "Insult",
  identity_hate: "Identity Hate",
};

const CATEGORY_THRESHOLDS = config.moderationThresholds;

const severityRank = {
  safe: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function timecode(seconds) {
  const value = Math.max(0, Math.floor(seconds));

  return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(
    Math.floor((value % 3600) / 60),
  ).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function transcriptForChunk(segments, startSeconds, endSeconds) {
  return segments
    .filter((segment) => {
      const start = Number(segment.start) / 1000;
      const end = Number(segment.end) / 1000;
      return start < endSeconds && end > startSeconds;
    })
    .map((segment) => String(segment.text || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasHarmfulLexicon(text) {
  const normalized = text.toLowerCase();
  const keywords = [
    "kill",
    "die",
    "attack",
    "stab",
    "shoot",
    "bomb",
    "murder",
    "hate",
    "slur",
    "nazi",
    "idiot",
    "stupid",
    "scum",
    "hate speech",
    "freak",
    "loser",
    "worthless",
    "burn",
    "hurt",
    "threat",
  ];
  return keywords.some((keyword) => normalized.includes(keyword));
}

function shouldTreatAsNeutralShortText(text) {
  const words = getWordCount(text);
  if (words > 8) {
    return false;
  }

  const normalized = text.toLowerCase();
  if (normalized.length === 0) {
    return false;
  }

  const hasQuestionOrExclamation = /[?!.]/.test(normalized);
  const hasHarmfulSignal = hasHarmfulLexicon(normalized);

  if (hasHarmfulSignal) {
    return false;
  }

const neutralPatterns = [
  /^hi+$/,
  /^oh+$/,
  /^no+$/,
  /^yes+$/,
  /^thanks?$/,
  /^hello+$/,
  /^(you|who|what|where|when|why|how)\?$/i,
  /^(do you want|can you|could you|what do|how do|where are|i am|i'm|it's hot|careful)/,
];

  const isNeutralPattern = neutralPatterns.some((pattern) =>
    pattern.test(normalized.replace(/[^a-z0-9\s'?-]/g, "")),
  );

  return (
    isNeutralPattern ||
    (!hasQuestionOrExclamation && !/[0-9]/.test(normalized) && words <= 6)
  );
}

function severityForDetections(detectedEntries) {
  let highestSeverity = "safe";

  for (const [category, score] of detectedEntries) {
    let severity = "moderate";

    if (category === "threat" || category === "severe_toxic") {
      if (score >= 0.9) {
        severity = "critical";
      } else if (score >= 0.75) {
        severity = "high";
      }
    } else if (category === "identity_hate" || category === "toxic") {
      severity = score >= 0.82 ? "high" : "moderate";
    } else if (category === "obscene" || category === "insult") {
      severity = score >= 0.8 ? "high" : "moderate";
    }

    if (severityRank[severity] > severityRank[highestSeverity]) {
      highestSeverity = severity;
    }
  }

  return highestSeverity;
}

export function peakVideoRiskScore(chunkScores) {
  return chunkScores.reduce(
    (highestScore, score) => Math.max(highestScore, score),
    0,
  );
}


export function combineModerationRisk({
  textSeverity,
  visualAnalysis,
  textAnalysis,
}) {
  const rank = {
    safe: 0,
    low: 1,
    moderate: 2,
    high: 3,
    critical: 4,
  };

  let combinedSeverity =
    rank[textSeverity] !== undefined ? textSeverity : "safe";

  const textCompleted = !textAnalysis || textAnalysis.status === "completed";
  const visualCompleted = visualAnalysis?.status === "completed";

  const visualFlagged =
    visualCompleted &&
    Number(visualAnalysis.flaggedFrameCount) > 0;

  // A visual flag requires human review.
  if (visualFlagged && rank[combinedSeverity] < rank.moderate) {
    combinedSeverity = "moderate";
  }

  // Do not allow content when either analysis is incomplete.
  const decision =
    !textCompleted || !visualCompleted || combinedSeverity !== "safe"
      ? "review"
      : "allow";

  let decisionReason;

  if (!textCompleted && !visualCompleted) {
    decisionReason =
      "Text and visual analysis are incomplete or unavailable; human review required.";
  } else if (!textCompleted) {
    decisionReason =
      "Text analysis is incomplete or unavailable; human review required.";
  } else if (!visualCompleted) {
    decisionReason =
      "Visual analysis is incomplete or unavailable; human review required.";
  } else if (visualFlagged && textSeverity === "safe") {
    decisionReason =
      "Visual safety model flagged one or more sampled frames; human review required.";
  } else if (combinedSeverity === "safe") {
    decisionReason =
      "No text or visual signal triggered the current review policy.";
  } else {
    decisionReason =
      "Text toxicity assessment requires human review.";
  }

  return {
    combinedRiskLevel: combinedSeverity,
    combinedRiskScore: null,
    decision,
    decisionReason,
    automaticRestrictionEnabled: false,
  };
}


export async function analyzeText(text) {
  const prediction = await predictText(text);
  const rawScores = prediction.scores;

  if (
    !rawScores ||
    typeof rawScores !== "object" ||
    Array.isArray(rawScores) ||
    Object.keys(rawScores).length === 0
  ) {
    throw new Error("Text toxicity model returned no category scores.");
  }

  const entries = Object.entries(rawScores).map(([category, value]) => [
    category,
    Number(value),
  ]);

  if (
    entries.some(
      ([, value]) => !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    throw new Error("Text toxicity model returned invalid category scores.");
  }

  const categoryScores = Object.fromEntries(entries);

  const detectedEntries = entries.filter(([category, score]) => {
    const threshold = CATEGORY_THRESHOLDS[category];
    return threshold !== undefined && score >= threshold;
  });

  const rawTopEntry = [...entries].sort((a, b) => b[1] - a[1])[0];
  const detectedTopEntry =
    [...detectedEntries].sort((a, b) => b[1] - a[1])[0] || null;

  const [topCategory, topCategoryScore] = detectedTopEntry || rawTopEntry;

  const level = severityForDetections(detectedEntries);
  const score = detectedTopEntry ? detectedTopEntry[1] : 0;
  const detectedLabels = detectedEntries.map(([category]) => category);
  const topCategoryName = categoryLabels[topCategory] || topCategory;
  const isNeutralShortText = shouldTreatAsNeutralShortText(text);


if (isNeutralShortText && detectedLabels.length > 0) {
  const isNeutralQuestionFragment =
    /^(you|who|what|where|when|why|how)\?$/i.test(text.trim());

  if (isNeutralQuestionFragment) {
    return {
      modality: "text",
      model: prediction.model,
      label: labels.text,
      score: 0,
      rawTopScore: rawTopEntry[1],
      level: "safe",
      topCategory: null,
      topCategoryName: null,
      topCategoryScore: 0,
      tags: [],
      threat:
        "Neutral short question fragment; model prediction suppressed as unreliable",
      categoryScores,
      thresholds: CATEGORY_THRESHOLDS,
      isPlaceholder: false,
      decision: "allow",
      isNeutralShortText: true,
    };
  }

  const filteredLabels = detectedLabels.filter(
    (category) => !["toxic", "insult", "obscene"].includes(category),
  );

  const filteredEntries = entries.filter(([category]) =>
    filteredLabels.includes(category),
  );

  const safeDetectedEntries = filteredEntries.filter(
    ([category, value]) =>
      value >= (CATEGORY_THRESHOLDS[category] ?? 0.5),
  );

  if (safeDetectedEntries.length === 0) {
    return {
      modality: "text",
      model: prediction.model,
      label: labels.text,
      score: 0,
      rawTopScore: rawTopEntry[1],
      level: "safe",
      topCategory: null,
      topCategoryName: null,
      topCategoryScore: 0,
      tags: [],
      threat:
        "No category reached its configured detection threshold after neutral-short-text guard",
      categoryScores,
      thresholds: CATEGORY_THRESHOLDS,
      isPlaceholder: false,
      decision: "allow",
      isNeutralShortText: true,
    };
  }
}


  return {
    modality: "text",
    model: prediction.model,
    label: labels.text,
    score: Math.round(score * 10000) / 10000,
    rawTopScore: rawTopEntry[1],
    level,
    topCategory,
    topCategoryName,
    topCategoryScore: Math.round(topCategoryScore * 10000) / 10000,
    tags: detectedLabels,
    threat: detectedLabels.length
      ? `Detected: ${detectedLabels
          .map((category) => categoryLabels[category] || category)
          .join(", ")}`
      : "No category reached its configured detection threshold",
    categoryScores,
    thresholds: CATEGORY_THRESHOLDS,
    isPlaceholder: false,
    decision: detectedLabels.length ? "flag" : "allow",
  };
}

// Model detections are sent for human review, not automatically blocked.
function recommendedAction() {
  return "flag";
}

function confidenceFor(score) {
  // Display heuristic only; not measured model confidence.
  return Math.round(Math.min(0.99, 0.78 + score * 0.18) * 100) / 100;
}

function buildReason(chunkId, start, end, signal) {
  const window = `${timecode(start)} - ${timecode(end)}`;

  if (signal.level === "safe") {
    return `Text model found no category above its configured detection threshold in chunk #${chunkId} (${window}). Highest raw category: ${signal.topCategoryName} (${(signal.rawTopScore * 100).toFixed(2)}%).`;
  }

  const shortWarning = signal.isShortTranscript
    ? " Warning: this is a short transcript, so the prediction may be unreliable."
    : "";

  return `Transcript in chunk #${chunkId} (${window}) triggered a ${signal.level} text assessment. Strongest detected category: ${signal.topCategoryName} (${(signal.topCategoryScore * 100).toFixed(2)}%). Detected categories: ${signal.tags.join(", ")}. Human review is required.${shortWarning}`;
}

export async function runAnalysis(videoId, resultId, dependencies = {}) {
  const {
    database: injectedDatabase,
    transcribeVideo: transcribe = transcribeVideo,
    analyzeVideoFrames: analyzeFrames = analyzeVideoFrames,
    analyzeText: analyzeChunk = analyzeText,
    resolveStored: resolveVideoPath = resolveStored,
  } = dependencies;

  try {
    const database = injectedDatabase ?? getDb();

    const video = await database.collection("videos").findOne({
      _id: videoId,
    });

    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    const duration = Number(
      video.durationSeconds || config.defaultDurationSeconds,
    );

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Video duration is invalid.");
    }

    const count = Math.min(
      MAX_CHUNKS,
      Math.max(1, Math.ceil(duration / config.chunkSeconds)),
    );

    const textAnalysis = {
      status: "failed",
      segmentCount: 0,
      error: null,
    };
    let transcription = null;

    try {
      transcription = await transcribe(
        resolveVideoPath(video.storagePath),
      );
      textAnalysis.status = "completed";
      textAnalysis.segmentCount = Array.isArray(transcription.segments)
        ? transcription.segments.length
        : 0;

      console.log(
        `Whisper transcribed ${textAnalysis.segmentCount} segments.`,
      );
    } catch (error) {
      console.error("Transcription failed:", error);
      textAnalysis.error = error.message || "Transcription failed.";
    }

    const events = [];
    let visualAnalysis = {
      status: "failed",
      sampledFrameCount: 0,
      flaggedFrameCount: 0,
      error: "Visual analysis could not be completed.",
    };
    let visualAnalysisSucceeded = false;
    const chunkScores = [];
    let strongestSignal = null;
    let highestSeverity = "safe";

    if (transcription) {
      try {
        for (let index = 0; index < count; index += 1) {
      const chunkId = index + 1;
      const start = index * config.chunkSeconds;
      const end = Math.min((index + 1) * config.chunkSeconds, duration);

      const text = transcriptForChunk(transcription.segments, start, end);

      // No speech means no text score.
      // Visual and non-speech audio moderation are not implemented.
      if (!text) {
        continue;
      }

      const signal = await analyzeChunk(text);

      signal.model = `Whisper + ${signal.model}`;
      signal.transcript = text;
      signal.isPlaceholder = false;

      const wordCount = getWordCount(text);
      signal.isShortTranscript = wordCount <= 2;

      if (signal.isShortTranscript) {
        signal.shortTranscriptWarning =
          "Short transcript: model predictions may be unreliable.";

        const hasHighRiskCategory = signal.tags.some((category) =>
          ["threat", "severe_toxic"].includes(category),
        );

        // A short Toxic-only prediction is insufficient to create
        // a moderation event. Preserve other detected categories.
        if (!hasHighRiskCategory) {
          const remainingTags = signal.tags.filter(
            (category) => category !== "toxic",
          );

          signal.tags = remainingTags;
          signal.threat = remainingTags.length
            ? `Detected: ${remainingTags
                .map((category) => categoryLabels[category] || category)
                .join(", ")}`
            : "Short transcript requires caution; no high-risk category detected";

          if (remainingTags.length === 0) {
            signal.level = "safe";
            signal.score = 0;
          }
        }
      }

      console.log("[ModerAI DEBUG]", {
        chunkId,
        transcript: text,
        rawTopScore: signal.rawTopScore,
        detectedCategories: signal.tags,
        severity: signal.level,
        shortTranscript: signal.isShortTranscript,
      });

      // Retain the strongest raw prediction for the result summary.
      if (
        !strongestSignal ||
        signal.rawTopScore > strongestSignal.rawTopScore
      ) {
        strongestSignal = signal;
      }

      chunkScores.push(signal.score);

      if (severityRank[signal.level] > severityRank[highestSeverity]) {
        highestSeverity = signal.level;
      }

      // Do not create an event if no category remains detected.
      if (signal.level === "safe") {
        continue;
      }

      const action = recommendedAction(signal.level);

      events.push({
        _id: createId(),
        videoId,
        ownerId: video.ownerId,
        resultId,
        chunkId,
        startSeconds: start,
        endSeconds: end,
        timecode: timecode(start),
        modality: "text",
        threat: signal.threat,
        score: signal.score,
        rawTopScore: signal.rawTopScore,
        topCategory: signal.topCategory,
        topCategoryName: signal.topCategoryName,
        topCategoryScore: signal.topCategoryScore,
        categoryScores: signal.categoryScores,
        action,
        confidence: confidenceFor(signal.score),
        reason: buildReason(chunkId, start, end, signal),
        transcript: text,
        signals: [signal],
        reviewed: false,
        review: {
          status: "pending",
        },
        createdAt: now(),
      });
        }
      } catch (error) {
        console.error("Text analysis failed:", error);
        textAnalysis.status = "failed";
        textAnalysis.error = error.message || "Text analysis failed.";
      }
    }

    try {
      const visualResults = await analyzeFrames(
        resolveVideoPath(video.storagePath),
        duration,
      );

      if (!Array.isArray(visualResults) || visualResults.length === 0) {
        throw new Error("Vision service returned no sampled frames.");
      }

      const visualEvents = [];
      for (const [index, result] of visualResults.entries()) {
        if (!["NSFW", "NSFL", "SFW"].includes(result?.predictedClass)) {
          throw new Error("Vision service returned an unsupported class.");
        }

        if (
          !result.scores ||
          typeof result.scores !== "object" ||
          Array.isArray(result.scores) ||
          typeof result.model !== "string" ||
          typeof result.scoreType !== "string"
        ) {
          throw new Error(
            "Vision service returned incomplete prediction data.",
          );
        }

        if (result.predictedClass === "SFW") {
          continue;
        }

        const timestamp = Number(result.timestampSeconds);
        const modelScore = Number(result.scores[result.predictedClass]);

        if (
          !Number.isFinite(timestamp) ||
          timestamp < 0 ||
          !Number.isFinite(modelScore)
        ) {
          throw new Error(
            "Vision service returned invalid prediction scores or timestamp.",
          );
        }

        const time = timecode(timestamp);
        const reason =
          `The image-safety model classified a sampled video frame as ${result.predictedClass} at ${time}. ` +
          "It targets sexual/graphic image safety, not general violence. Its model class scores are not calibrated probabilities. " +
          "Human review is required.";

        visualEvents.push({
          _id: createId(),
          videoId,
          ownerId: video.ownerId,
          resultId,
          chunkId: index + 1,
          startSeconds: timestamp,
          endSeconds: timestamp,
          timestampSeconds: timestamp,
          timecode: time,
          modality: "visual",
          threat: `${result.predictedClass} image-safety classification`,
          predictedClass: result.predictedClass,
          scores: result.scores,
          model: result.model,
          scoreType: result.scoreType,
          score: modelScore,
          action: "flag",
          reason,
          signals: [
            {
              modality: "visual",
              model: result.model,
              predictedClass: result.predictedClass,
              scores: result.scores,
              scoreType: result.scoreType,
              note: result.note,
            },
          ],
          reviewed: false,
          review: {
            status: "pending",
          },
          createdAt: now(),
        });
      }

      events.push(...visualEvents);
      visualAnalysisSucceeded = true;
      visualAnalysis = {
        status: "completed",
        sampledFrameCount: visualResults.length,
        flaggedFrameCount: visualEvents.length,
        models: [...new Set(visualResults.map((result) => result.model))],
        scoreTypes: [
          ...new Set(visualResults.map((result) => result.scoreType)),
        ],
      };
    } catch (error) {
      console.error("Visual analysis failed:", error);
      visualAnalysisSucceeded = false;
      visualAnalysis = {
        status: "failed",
        sampledFrameCount: 0,
        flaggedFrameCount: 0,
        models: [],
        scoreTypes: [],
        error:
          textAnalysis.status === "completed"
            ? "Visual analysis could not be completed; text analysis completed."
            : "Visual analysis could not be completed.",
      };
    }

    const textAnalysisSucceeded = textAnalysis.status === "completed";
    const isPartial = !(textAnalysisSucceeded && visualAnalysisSucceeded);

    if (!textAnalysisSucceeded && !visualAnalysisSucceeded) {
      const completedAt = now();
      const errorMessage = [textAnalysis.error, visualAnalysis.error]
        .filter(Boolean)
        .join(" ");

      await database.collection("moderation_results").updateOne(
        { _id: resultId },
        {
          $set: {
            status: "failed",
            analysisStatus: "failed",
            partial: false,
            error: errorMessage || "Analysis failed. Please try again.",
            textAnalysis,
            visualAnalysis,
            modalitiesAnalyzed: [],
            unavailableModalities: ["text", "visual", "audio"],
            completedAt,
          },
        },
      );

      await database.collection("videos").updateOne(
        { _id: videoId },
        {
          $set: {
            status: "failed",
            error: "Analysis failed. Please try again.",
            updatedAt: completedAt,
          },
        },
      );

      return;
    }

    if (events.length) {
      await database.collection("moderation_events").insertMany(events);
    }

    const pending = events.filter(
      (event) => event.review.status === "pending",
    ).length;

    const riskScore = peakVideoRiskScore(chunkScores);
    const combinedRisk = combineModerationRisk({
      textSeverity: highestSeverity,
      visualAnalysis,
      textAnalysis,
    });
    const completedAt = now();
    const unavailableModalities = [];

    if (!textAnalysisSucceeded) {
      unavailableModalities.push("text");
    }
    if (!visualAnalysisSucceeded) {
      unavailableModalities.push("visual");
    }
    unavailableModalities.push("audio");

    await database.collection("moderation_results").updateOne(
      { _id: resultId },
      {
        $set: {
          status: "completed",
          analysisStatus: isPartial ? "partial" : "completed",
          partial: isPartial,
          riskLevel: highestSeverity,
          riskScore,
          combinedRiskLevel: combinedRisk.combinedRiskLevel,
          combinedRiskScore: combinedRisk.combinedRiskScore,
          moderationDecision: combinedRisk.decision,
          decisionReason: combinedRisk.decisionReason,
          automaticRestrictionEnabled: combinedRisk.automaticRestrictionEnabled,
          topCategory: strongestSignal?.topCategory ?? null,
          topCategoryName: strongestSignal?.topCategoryName ?? null,
          categoryScores: strongestSignal?.categoryScores ?? {},
          chunkCount: count,
          flaggedCount: events.length,
          transcript: transcription?.text ?? "",
          transcriptSegmentCount: textAnalysis.segmentCount,
          analyzer: ANALYZER_ID,
          textAnalysis,
          modalitiesAnalyzed: [
            ...(textAnalysisSucceeded ? ["text"] : []),
            ...(visualAnalysisSucceeded ? ["visual"] : []),
          ],
          unavailableModalities,
          visualAnalysis,
          completedAt,
        },
      },
    );

    const needsReview =
      isPartial || pending > 0 || combinedRisk.decision === "review";

    await database.collection("videos").updateOne(
      { _id: videoId },
      {
        $set: {
          status: needsReview ? "needs_review" : "ready",
          riskLevel: highestSeverity,
          riskScore,
          error: null,
          updatedAt: completedAt,
        },
      },
    );

    console.log(
      `ModerAI analysis completed: ${count} text chunks, ${events.length} flagged events.`,
    );

    console.log("[ModerAI VISION STATUS]", {
      succeeded: visualAnalysisSucceeded,
      ...visualAnalysis,
    });

    console.log(
      `Highest detected severity: ${highestSeverity}; peak chunk risk score: ${(riskScore * 100).toFixed(2)}%.`,
    );
  } catch (error) {
    console.error("Analysis failed:", error);

    const database = injectedDatabase ?? getDb();

    await database.collection("moderation_results").updateOne(
      { _id: resultId },
      {
        $set: {
          status: "failed",
          error: error.message,
          completedAt: now(),
        },
      },
    );

    await database.collection("videos").updateOne(
      { _id: videoId },
      {
        $set: {
          status: "failed",
          error: "Analysis failed. Please try again.",
          updatedAt: now(),
        },
      },
    );
  }
}
