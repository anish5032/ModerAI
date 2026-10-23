
import assert from 'node:assert/strict';
import test from 'node:test';
import { peakVideoRiskScore } from '../services/analysisService.js';

test('no detected toxicity produces zero peak risk', () => {
  assert.equal(peakVideoRiskScore([0, 0, 0]), 0);
});

test('one moderately toxic chunk reports its peak score', () => {
  assert.equal(peakVideoRiskScore([0.76]), 0.76);
});

test('one highly toxic chunk reports its peak score', () => {
  assert.equal(peakVideoRiskScore([0.99]), 0.99);
});

test('multiple moderately toxic chunks do not accumulate', () => {
  assert.equal(peakVideoRiskScore([0.76, 0.74, 0.79]), 0.79);
});

test('peak score is independent of analyzed chunk count', () => {
  const nineChunks = [
    0.12, 0.18, 0.22, 0.11, 0.3, 0.19, 0.15, 0.21, 0.9999,
  ];

  const twentySevenChunks = [
    ...Array.from({ length: 26 }, (_, index) => 0.1 + (index % 8) / 100),
    0.9999,
  ];

  assert.equal(peakVideoRiskScore(nineChunks), 0.9999);
  assert.equal(peakVideoRiskScore(twentySevenChunks), 0.9999);
});

test('a neutral question fragment with zero effective score contributes zero video risk', () => {
  const neutralQuestionScore = 0;

  assert.equal(peakVideoRiskScore([neutralQuestionScore]), 0);
  assert.equal(
    peakVideoRiskScore([neutralQuestionScore]).toFixed(2),
    '0.00',
  );
});

test('a genuine high-risk chunk still contributes its peak score', () => {
  assert.equal(peakVideoRiskScore([0.2, 0.9999, 0.3]), 0.9999);
});
