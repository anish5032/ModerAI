import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYZER_ID, runAnalysis } from '../services/analysisService.js';

const videoId = 'video-1';
const resultId = 'result-1';

function createFakeDatabase() {
  const state = {
    video: {
      _id: videoId,
      ownerId: 'owner-1',
      storagePath: 'stored/video.mp4',
      durationSeconds: 2,
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
  text: 'I will attack you now',
  segments: [
    {
      start: 0,
      end: 2000,
      text: 'I will attack you now',
    },
  ],
};

const safeTranscript = {
  text: 'Thanks for watching',
  segments: [
    {
      start: 0,
      end: 2000,
      text: 'Thanks for watching',
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

const safeAudio = {
  status: 'completed',
  events: [],
  riskLevel: 'safe',
  riskScore: 0,
  flaggedEventCount: 0,
  model: 'test-yamnet',
  scoreType: 'YAMNet class score (not calibrated)',
  topClasses: [],
};

function textSignal(level = 'safe') {
  if (level === 'safe') {
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

  return {
    modality: 'text',
    model: 'test-text-model',
    label: 'Speech / Transcript Toxicity',
    score: 0.95,
    rawTopScore: 0.95,
    level,
    topCategory: 'threat',
    topCategoryName: 'Threat',
    topCategoryScore: 0.95,
    tags: ['threat'],
    threat: 'Detected: Threat',
    categoryScores: { threat: 0.95 },
    isPlaceholder: false,
  };
}

function dependencies(database, overrides = {}) {
  return {
    database,
    transcribeVideo: async () => transcription,
    analyzeVideoFrames: async () => safeVision,
    analyzeVideoAudio: async () => safeAudio,
    analyzeText: async () => textSignal(),
    resolveStored: () => 'stored/video.mp4',
    ...overrides,
  };
}

test('both modalities complete preserves the successful analysis path', async t => {
  t.mock.method(console, 'log', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      transcribeVideo: async () => safeTranscript,
    }),
  );

  assert.equal(state.resultUpdate.status, 'completed');
  assert.equal(state.resultUpdate.analyzer, ANALYZER_ID);
  assert.equal(state.resultUpdate.analysisStatus, 'completed');
  assert.equal(state.resultUpdate.partial, false);
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, [
    'text',
    'visual',
    'audio',
  ]);
  assert.deepEqual(state.resultUpdate.unavailableModalities, []);
  assert.equal(state.resultUpdate.moderationDecision, 'allow');
  assert.equal(state.resultUpdate.transcript, safeTranscript.text);
  assert.equal(state.resultUpdate.textAnalysis.status, 'completed');
  assert.equal(state.resultUpdate.visualAnalysis.status, 'completed');
  assert.equal(state.videoUpdate.status, 'ready');
  assert.equal(state.events.length, 0);
});

test('transcription failure still completes visual analysis as partial', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      transcribeVideo: async () => {
        throw new Error('No audio stream');
      },
    }),
  );

  assert.equal(state.resultUpdate.status, 'completed');
  assert.equal(state.resultUpdate.analysisStatus, 'partial');
  assert.equal(state.resultUpdate.partial, true);
  assert.equal(state.resultUpdate.textAnalysis.status, 'failed');
  assert.equal(state.resultUpdate.textAnalysis.error, 'No audio stream');
  assert.equal(state.resultUpdate.visualAnalysis.status, 'completed');
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, [
    'visual',
    'audio',
  ]);
  assert.deepEqual(state.resultUpdate.unavailableModalities, ['text']);
  assert.equal(state.resultUpdate.moderationDecision, 'review');
  assert.match(state.resultUpdate.decisionReason, /Text analysis is incomplete/);
  assert.equal(state.videoUpdate.status, 'needs_review');
});

test('vision failure preserves completed text analysis and events', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      analyzeText: async () => textSignal('high'),
      analyzeVideoFrames: async () => {
        throw new Error('Vision service unavailable');
      },
    }),
  );

  assert.equal(state.resultUpdate.status, 'completed');
  assert.equal(state.resultUpdate.analysisStatus, 'partial');
  assert.equal(state.resultUpdate.partial, true);
  assert.equal(state.resultUpdate.textAnalysis.status, 'completed');
  assert.equal(state.resultUpdate.visualAnalysis.status, 'failed');
  assert.equal(state.resultUpdate.transcript, transcription.text);
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, [
    'text',
    'audio',
  ]);
  assert.deepEqual(state.resultUpdate.unavailableModalities, ['visual']);
  assert.equal(state.resultUpdate.moderationDecision, 'review');
  assert.match(
    state.resultUpdate.decisionReason,
    /Visual analysis is incomplete/,
  );
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].modality, 'text');
  assert.equal(state.videoUpdate.status, 'needs_review');
});

test('text and vision failures preserve a successful audio result', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      transcribeVideo: async () => {
        throw new Error('No audio stream');
      },
      analyzeVideoFrames: async () => {
        throw new Error('Vision service unavailable');
      },
    }),
  );

  assert.equal(state.resultUpdate.status, 'completed');
  assert.equal(state.resultUpdate.analysisStatus, 'partial');
  assert.equal(state.resultUpdate.partial, true);
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, ['audio']);
  assert.deepEqual(state.resultUpdate.unavailableModalities, [
    'text',
    'visual',
  ]);
  assert.match(state.resultUpdate.error, /No audio stream/);
  assert.match(
    state.resultUpdate.error,
    /Visual analysis could not be completed/,
  );
  assert.equal(state.resultUpdate.moderationDecision, 'review');
  assert.equal(state.videoUpdate.status, 'needs_review');
  assert.equal(state.events.length, 0);
});

test('all modality failures mark the analysis and video as failed', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { database, state } = createFakeDatabase();

  await runAnalysis(
    videoId,
    resultId,
    dependencies(database, {
      transcribeVideo: async () => {
        throw new Error('No audio stream');
      },
      analyzeVideoFrames: async () => {
        throw new Error('Vision service unavailable');
      },
      analyzeVideoAudio: async () => {
        throw new Error('Audio event model unavailable');
      },
    }),
  );

  assert.equal(state.resultUpdate.status, 'failed');
  assert.equal(state.resultUpdate.analysisStatus, 'failed');
  assert.equal(state.resultUpdate.partial, false);
  assert.deepEqual(state.resultUpdate.modalitiesAnalyzed, []);
  assert.deepEqual(state.resultUpdate.unavailableModalities, [
    'text',
    'visual',
    'audio',
  ]);
  assert.match(state.resultUpdate.error, /No audio stream/);
  assert.match(
    state.resultUpdate.error,
    /Visual analysis could not be completed/,
  );
  assert.match(state.resultUpdate.error, /Audio event model unavailable/);
  assert.equal(state.videoUpdate.status, 'failed');
  assert.equal(state.events.length, 0);
});
