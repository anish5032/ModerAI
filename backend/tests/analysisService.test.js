
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeText } from '../services/analysisService.js';

const predictions = [
  {
    text: 'You?',
    scores: {
      toxic: 0.999753,
      severe_toxic: 0.960957,
      obscene: 0.99398,
      threat: 0.952442,
      insult: 0.999876,
      identity_hate: 0.882882,
    },
    labels: [
      'toxic',
      'severe_toxic',
      'obscene',
      'threat',
      'insult',
      'identity_hate',
    ],
  },
  {
    text: 'Hello, how are you?',
    scores: {
      toxic: 0.461491,
      severe_toxic: 0.068697,
      obscene: 0.293683,
      threat: 0.033517,
      insult: 0.355036,
      identity_hate: 0.248791,
    },
    labels: [],
  },
  {
    text: 'Thank you for your help.',
    scores: {
      toxic: 0.010134,
      severe_toxic: 0.005885,
      obscene: 0.011588,
      threat: 0.010272,
      insult: 0.022602,
      identity_hate: 0.007927,
    },
    labels: [],
  },
  {
    text: 'You are an idiot.',
    scores: {
      toxic: 0.999992,
      severe_toxic: 0.324039,
      obscene: 0.997655,
      threat: 0.017187,
      insult: 0.999998,
      identity_hate: 0.587395,
    },
    labels: ['toxic', 'obscene', 'insult'],
  },
  {
    text: 'I will kill you.',
    scores: {
      toxic: 0.989043,
      severe_toxic: 0.749215,
      obscene: 0.823909,
      threat: 0.999988,
      insult: 0.63739,
      identity_hate: 0.215818,
    },
    labels: ['toxic', 'obscene', 'threat'],
  },
];

test(
  'backend preserves model score mapping and production threshold labels',
  async (t) => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (_url, options) => {
      const { text } = JSON.parse(options.body);
      const prediction = predictions.find(
        (item) => item.text === text,
      );

      assert.ok(prediction, `Unexpected input: ${text}`);

      return {
        ok: true,
        json: async () => ({
          scores: prediction.scores,
          model: 'TF-IDF + One-vs-Rest Logistic Regression',
        }),
      };
    };

    t.after(() => {
      globalThis.fetch = originalFetch;
    });

    for (const { text, scores, labels } of predictions) {
      const result = await analyzeText(text);

      // Original model scores must remain available.
      assert.deepEqual(result.categoryScores, scores, text);

      if (text === 'You?') {
        // The known neutral-fragment false positive should be suppressed.
        assert.deepEqual(result.tags, [], text);
        assert.equal(result.score, 0, text);
        assert.equal(result.level, 'safe', text);
        assert.equal(result.decision, 'allow', text);

        // Preserve the highest raw model score for transparency.
        assert.ok(
          Math.abs(result.rawTopScore - 0.999876) < 0.000001,
          'Raw model score should be preserved',
        );

        assert.equal(result.isNeutralShortText, true, text);
      } else {
        // All other examples retain their expected model detections.
        assert.deepEqual(result.tags, labels, text);
        assert.equal(
          result.decision,
          labels.length ? 'flag' : 'allow',
          text,
        );
      }
    }
  },
);
