
import test from 'node:test';
import assert from 'node:assert/strict';
import { combineModerationRisk } from '../services/analysisService.js';

const completedVision = {
  status: 'completed',
  sampledFrameCount: 10,
  flaggedFrameCount: 0,
  models: ['image-safety-classifier-xs'],
  scoreTypes: ['model class score'],
};

test('safe text and completed vision with no flags allows content', () => {
  const result = combineModerationRisk({
    textSeverity: 'safe',
    visualAnalysis: completedVision,
  });

  assert.equal(result.combinedRiskLevel, 'safe');
  assert.equal(result.decision, 'allow');
});

test('a visual flag requires human review', () => {
  const result = combineModerationRisk({
    textSeverity: 'safe',
    visualAnalysis: { ...completedVision, flaggedFrameCount: 1 },
  });

  assert.equal(result.combinedRiskLevel, 'moderate');
  assert.equal(result.decision, 'review');
});

test('failed vision analysis requires human review', () => {
  const result = combineModerationRisk({
    textSeverity: 'safe',
    visualAnalysis: { status: 'failed', flaggedFrameCount: 0 },
  });

  assert.equal(result.decision, 'review');
});

test('critical text severity requires human review', () => {
  const result = combineModerationRisk({
    textSeverity: 'critical',
    visualAnalysis: completedVision,
  });

  assert.equal(result.combinedRiskLevel, 'critical');
  assert.equal(result.decision, 'review');
});
