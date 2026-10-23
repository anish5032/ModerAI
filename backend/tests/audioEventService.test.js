import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeVideoAudio } from '../services/audioEventService.js';

const prediction = {
  events: [
    {
      category: 'explosion',
      label: 'Weapon or explosion-like sound',
      severity: 'critical',
      startSeconds: 1,
      endSeconds: 2,
      score: 0.8,
      riskScore: 0.76,
    },
    {
      category: 'alarm',
      label: 'Alarm or siren',
      severity: 'low',
      startSeconds: 3,
      endSeconds: 4,
      score: 0.6,
      riskScore: 0.21,
    },
  ],
  riskLevel: 'critical',
  riskScore: 0.76,
  model: 'audiomagic/yamnet-onnx',
};

test('a video without audio returns no_audio without calling the model', async () => {
  let predicted = false;

  const result = await analyzeVideoAudio('video.mp4', {
    hasAudio: async () => false,
    extractAudio: async () => Buffer.from('unused'),
    predictEvents: async () => {
      predicted = true;
      return prediction;
    },
  });

  assert.equal(result.status, 'no_audio');
  assert.equal(result.events.length, 0);
  assert.equal(result.flaggedEventCount, 0);
  assert.equal(predicted, false);
});

test('completed audio events are returned with actionable count', async () => {
  const result = await analyzeVideoAudio('video.mp4', {
    hasAudio: async () => true,
    extractAudio: async () => Buffer.from('wav'),
    predictEvents: async () => prediction,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.flaggedEventCount, 2);
  assert.equal(result.riskLevel, 'critical');
  assert.equal(result.model, 'audiomagic/yamnet-onnx');
});

test('invalid model risk levels are rejected', async () => {
  await assert.rejects(
    analyzeVideoAudio('video.mp4', {
      hasAudio: async () => true,
      extractAudio: async () => Buffer.from('wav'),
      predictEvents: async () => ({ ...prediction, riskLevel: 'unknown' }),
    }),
    /invalid risk level/,
  );
});

test('invalid model events are rejected', async () => {
  await assert.rejects(
    analyzeVideoAudio('video.mp4', {
      hasAudio: async () => true,
      extractAudio: async () => Buffer.from('wav'),
      predictEvents: async () => ({
        ...prediction,
        events: [{ ...prediction.events[0], startSeconds: 'not-a-number' }],
      }),
    }),
    /invalid event/,
  );
});
