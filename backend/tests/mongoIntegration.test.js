import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { MongoClient } from 'mongodb';
import { runAnalysis } from '../services/analysisService.js';

const testUri = process.env.MODERAI_TEST_MONGODB_URI;
const skipMessage = testUri
  ? false
  : 'Set MODERAI_TEST_MONGODB_URI to run MongoDB integration tests.';

function ids() {
  return {
    videoId: crypto.randomUUID(),
    resultId: crypto.randomUUID(),
  };
}

async function openTestDatabase(t) {
  const client = new MongoClient(testUri, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const databaseName = `moderai_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const database = client.db(databaseName);
  t.after(async () => {
    await database.dropDatabase();
    await client.close();
  });
  return database;
}

async function seedProcessingAnalysis(database, videoId, resultId) {
  const timestamp = new Date();
  await database.collection('videos').insertOne({
    _id: videoId,
    ownerId: 'integration-owner',
    name: 'integration-video.mp4',
    storagePath: 'stored/integration-video.mp4',
    durationSeconds: 4,
    status: 'processing',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.collection('moderation_results').insertOne({
    _id: resultId,
    videoId,
    ownerId: 'integration-owner',
    source: 'backend',
    status: 'processing',
    createdAt: timestamp,
    completedAt: null,
  });
}

function dependencies(database, overrides = {}) {
  return {
    database,
    transcribeVideo: async () => ({
      text: 'Welcome to the integration test',
      segments: [
        {
          start: 0,
          end: 4000,
          text: 'Welcome to the integration test',
        },
      ],
      language: 'en',
    }),
    analyzeVideoFrames: async () => [
      {
        predictedClass: 'SFW',
        scores: { SFW: 0.95, NSFW: 0.03, NSFL: 0.02 },
        model: 'integration-vision',
        scoreType: 'test score',
        timestampSeconds: 0,
      },
    ],
    analyzeVideoAudio: async () => ({
      status: 'completed',
      events: [
        {
          category: 'explosion',
          label: 'Weapon or explosion-like sound',
          description: 'Possible gunfire or explosion.',
          severity: 'critical',
          startSeconds: 1,
          endSeconds: 2,
          score: 0.8,
          riskScore: 0.76,
          model: 'integration-audio',
          classes: [
            { class: 'Gunshot or gunfire', index: 421, score: 0.8 },
          ],
        },
      ],
      riskLevel: 'critical',
      riskScore: 0.76,
      model: 'integration-audio',
      scoreType: 'test score',
    }),
    analyzeText: async () => ({
      modality: 'text',
      model: 'integration-text',
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
    }),
    resolveStored: () => 'stored/integration-video.mp4',
    ...overrides,
  };
}

test(
  'analysis results and moderation events persist in MongoDB',
  { skip: skipMessage },
  async t => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    const database = await openTestDatabase(t);
    const { videoId, resultId } = ids();
    await seedProcessingAnalysis(database, videoId, resultId);

    await runAnalysis(videoId, resultId, dependencies(database));

    const result = await database
      .collection('moderation_results')
      .findOne({ _id: resultId });
    assert.equal(result.status, 'completed');
    assert.equal(result.analysisStatus, 'completed');
    assert.equal(result.partial, false);
    assert.equal(result.riskLevel, 'critical');
    assert.equal(result.moderationDecision, 'review');
    assert.deepEqual(result.modalitiesAnalyzed, ['text', 'visual', 'audio']);
    assert.equal(result.modalityRiskScores.audio, 0.76);
    assert.match(result.analyzer, /yamnet/);

    const event = await database
      .collection('moderation_events')
      .findOne({ resultId, modality: 'audio' });
    assert.ok(event);
    assert.equal(event.videoId, videoId);
    assert.equal(event.ownerId, 'integration-owner');
    assert.equal(event.category, 'explosion');
    assert.equal(event.severity, 'critical');
    assert.equal(event.startSeconds, 1);
    assert.equal(event.endSeconds, 2);
    assert.equal(event.review.status, 'pending');

    await database.collection('moderation_events').updateOne(
      { _id: event._id },
      {
        $set: {
          reviewed: true,
          review: {
            status: 'resolved',
            decision: 'reject',
            reason: 'Integration test review',
            decisionSource: 'human',
            reviewedAt: new Date(),
          },
        },
      },
    );

    const reviewed = await database
      .collection('moderation_events')
      .findOne({ _id: event._id });
    assert.equal(reviewed.reviewed, true);
    assert.equal(reviewed.review.status, 'resolved');
    assert.equal(reviewed.review.decision, 'reject');
    assert.equal(reviewed.review.decisionSource, 'human');

    const video = await database.collection('videos').findOne({ _id: videoId });
    assert.equal(video.status, 'needs_review');
    assert.equal(video.riskLevel, 'critical');
  },
);

test(
  'complete analysis failure is persisted without moderation events',
  { skip: skipMessage },
  async t => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    const database = await openTestDatabase(t);
    const { videoId, resultId } = ids();
    await seedProcessingAnalysis(database, videoId, resultId);
    const failure = async () => {
      throw new Error('Integration dependency unavailable');
    };

    await runAnalysis(
      videoId,
      resultId,
      dependencies(database, {
        transcribeVideo: failure,
        analyzeVideoFrames: failure,
        analyzeVideoAudio: failure,
      }),
    );

    const result = await database
      .collection('moderation_results')
      .findOne({ _id: resultId });
    assert.equal(result.status, 'failed');
    assert.equal(result.analysisStatus, 'failed');
    assert.equal(result.partial, false);
    assert.deepEqual(result.modalitiesAnalyzed, []);
    assert.deepEqual(result.unavailableModalities, [
      'text',
      'visual',
      'audio',
    ]);
    assert.match(result.error, /Integration dependency unavailable/);

    const eventCount = await database
      .collection('moderation_events')
      .countDocuments({ resultId });
    assert.equal(eventCount, 0);

    const video = await database.collection('videos').findOne({ _id: videoId });
    assert.equal(video.status, 'failed');
  },
);
