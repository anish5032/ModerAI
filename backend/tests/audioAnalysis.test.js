import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYZER_ID, runAnalysis } from '../services/analysisService.js';

const videoId = 'video-audio';
const resultId = 'result-audio';

function createFakeDatabase() {
  const state = {
    video: {
      _id: videoId,
      ownerId: 'owner-1',
      storagePath: 'stored/video.mp4',
      durationSeconds: 4,
    },
    resultUpdate: null,
    videoUpdate: null,
    events: [],
  };

  const database = {
    collection(name) {
      if (name === 'videos') {
        return {
          async findOne(filter) {
            return filter._id === videoId ? state.video : null;
          },
          async updateOne(_filter, update) {
            state.videoUpdate = update.$set;
            Object.assign(state.video, update.$set);
            return { matchedCount: 1 };
          },
        };
      }

      if (name === 'moderation_results') {
        return {
          async updateOne(_filter, update) {
            state.resultUpdate = update.$set;
            return { matchedCount: 1 };
          },
        };
      }

      if (name === 'moderation_events') {
        return {
          async insertMany(documents) {
            state.events.push(...documents);
            return { insertedCount: documents.length };
          },
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  return { database, state };
}

const transcription = {
  text: 'Welcome to the safety demonstration',
  segments: [
    {
      start: 0,
      end: 4000,
      text: 'Welcome to the safety demonstration',
    },
  ],
};

const safeVision = [
  {
    predictedClass: 'SFW',
    scores: { SFW: 0.95, NSFW: 0.03, NSFL: 0.02 },
    model: 'test-image-safety',
    scoreType: 'model class score',
    timestampSeconds: 0,
  },
];

function textSignal() {
  return {
    modality: 'text',
    model: 'test-text-model',
    label: 'Speech / Transcript Toxicity',
    score: 0,
    rawTopScore: 0.1,
    level: 'safe',
    topCategory: null,
    topCategoryName: null,
    topCategoryScore: 0,
    tags: [],
    threat: 'No category reached its configured detection threshold',
    categoryScores: { toxic: 0.1 },
    isPlaceholder: false,
  };
}

function audioResult(event, overrides = {}) {
  return {
    status: 'completed',
    events: event ? [event] : [],
    riskLevel: event?.severity ?? 'safe',
    riskScore: event?.riskScore ?? 0,
    topClasses: [],
    model: 'audiomagic/yamnet-onnx',
    scoreType: 'YAMNet class score (not calibrated)',
    ...overrides,
  };
}

const gunshotEvent = {
  category: 'explosion',
  label: 'Weapon or explosion-like sound',
  description: 'Possible gunfire or explosion.',
  severity: 'critical',
  startSeconds: 1,
  endSeconds: 2,
  score: 0.8,
  riskScore: 0.76,
  model: 'audiomagic/yamnet-onnx',
  classes: [
    { class: 'Gunshot or gunfire', index: 421, score: 0.8 },
  ],
};

const alarmEvent = {
  category: 'alarm',
  label: 'Alarm or siren',
  description: 'Environmental alarm or siren.',
  severity: 'low',
  startSeconds: 1,
  endSeconds: 1.5,
  score: 0.6,
  riskScore: 0.21,
  model: 'audiomagic/yamnet-onnx',
  classes: [{ class: 'Siren', index: 390, score: 0.6 }],
};

function dependencies(database, audio, overrides = {}) {
  return {
    database,
    transcribeVideo: async () => transcription,
    analyzeVideoFrames: async () => safeVision,
    analyzeVideoAudio: async () => audio,
    analyzeText: async () => textSignal(),
    resolveStored: () => 'stored/video.mp4',
    ...overrides,
  };
}

test('actionable audio event creates a review event and raises combined risk', async t => {
  t.mock.method(console, 'log', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, audioResult(gunshotEvent)),
  );

  assert.equal(state.resultUpdate.analysisStatus, 'completed');
  assert.equal(state.resultUpdate.partial, false);
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, [
    'text',
    'visual',
    'audio',
  ]);
  assert.deepEqual(state.resultUpdate.unavailableModalities, []);
  assert.equal(state.resultUpdate.analyzer, ANALYZER_ID);
  assert.match(state.resultUpdate.analyzer, /yamnet/);
  assert.equal(state.resultUpdate.audioAnalysis.actionableEventCount, 1);
  assert.equal(state.resultUpdate.audioAnalysis.informationalEventCount, 0);
  assert.equal(state.resultUpdate.audioAnalysis.actionableRiskLevel, 'critical');
  assert.equal(state.resultUpdate.combinedRiskLevel, 'critical');
  assert.equal(state.resultUpdate.moderationDecision, 'review');
  assert.match(state.resultUpdate.decisionReason, /audio/i);
  assert.equal(state.resultUpdate.flaggedCount, 1);
  assert.equal(state.resultUpdate.modalityRiskScores.audio, 0.76);
  assert.equal(state.resultUpdate.riskScore, 0.76);
  assert.equal(state.videoUpdate.status, 'needs_review');

  assert.equal(state.events.length, 1);
  const [event] = state.events;
  assert.equal(event.modality, 'audio');
  assert.equal(event.threat, gunshotEvent.label);
  assert.equal(event.severity, 'critical');
  assert.equal(event.category, 'explosion');
  assert.equal(event.startSeconds, 1);
  assert.equal(event.endSeconds, 2);
  assert.equal(event.timecode, '00:00:01');
  assert.equal(event.score, 0.8);
  assert.equal(event.riskScore, 0.76);
  assert.equal(event.review.status, 'pending');
  assert.match(event.reason, /not a calibrated probability/);
});

test('low-severity audio is informational and does not trigger review', async t => {
  t.mock.method(console, 'log', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, audioResult(alarmEvent)),
  );

  assert.equal(state.resultUpdate.analysisStatus, 'completed');
  assert.equal(state.resultUpdate.partial, false);
  assert.equal(state.resultUpdate.audioAnalysis.actionableEventCount, 0);
  assert.equal(state.resultUpdate.audioAnalysis.informationalEventCount, 1);
  assert.equal(state.resultUpdate.audioAnalysis.actionableRiskLevel, 'safe');
  assert.equal(state.resultUpdate.combinedRiskLevel, 'safe');
  assert.equal(state.resultUpdate.moderationDecision, 'allow');
  assert.equal(state.resultUpdate.flaggedCount, 0);
  assert.equal(state.videoUpdate.status, 'ready');
  assert.equal(state.events.length, 0);
});

test('audio failure is partial but preserves text and visual results', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, null, {
      analyzeVideoAudio: async () => {
        throw new Error('Audio event model unavailable');
      },
    }),
  );

  assert.equal(state.resultUpdate.analysisStatus, 'partial');
  assert.equal(state.resultUpdate.partial, true);
  assert.equal(state.resultUpdate.audioAnalysis.status, 'failed');
  assert.equal(
    state.resultUpdate.audioAnalysis.error,
    'Audio event model unavailable',
  );
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, [
    'text',
    'visual',
  ]);
  assert.deepEqual(state.resultUpdate.unavailableModalities, ['audio']);
  assert.equal(state.resultUpdate.moderationDecision, 'review');
  assert.match(state.resultUpdate.decisionReason, /Audio analysis is incomplete/);
  assert.equal(state.videoUpdate.status, 'needs_review');
});

test('no_audio alone does not make a completed analysis partial', async t => {
  t.mock.method(console, 'log', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      status: 'no_audio',
      events: [],
      riskLevel: 'safe',
      riskScore: 0,
      model: null,
      error: null,
    }),
  );

  assert.equal(state.resultUpdate.analysisStatus, 'completed');
  assert.equal(state.resultUpdate.partial, false);
  assert.equal(state.resultUpdate.audioAnalysis.status, 'no_audio');
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, [
    'text',
    'visual',
  ]);
  assert.deepEqual(state.resultUpdate.unavailableModalities, ['audio']);
  assert.equal(state.resultUpdate.moderationDecision, 'allow');
  assert.equal(state.videoUpdate.status, 'ready');
});

test('no_audio with failed transcription is partial but preserves visual analysis', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      status: 'no_audio',
      events: [],
      riskLevel: 'safe',
      riskScore: 0,
      model: null,
      error: null,
    }, {
      transcribeVideo: async () => {
        throw new Error('No audio stream');
      },
    }),
  );

  assert.equal(state.resultUpdate.analysisStatus, 'partial');
  assert.equal(state.resultUpdate.partial, true);
  assert.equal(state.resultUpdate.textAnalysis.status, 'failed');
  assert.equal(state.resultUpdate.visualAnalysis.status, 'completed');
  assert.equal(state.resultUpdate.audioAnalysis.status, 'no_audio');
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, ['visual']);
  assert.deepEqual(state.resultUpdate.unavailableModalities, [
    'text',
    'audio',
  ]);
  assert.equal(state.resultUpdate.moderationDecision, 'review');
  assert.equal(state.videoUpdate.status, 'needs_review');
});
