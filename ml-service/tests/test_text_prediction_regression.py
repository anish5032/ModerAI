import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
sys.path.insert(0, str(ML_SERVICE_ROOT))

import api  # noqa: E402
from src.text.evaluation_protocol import (  # noqa: E402
    DEFAULT_PRODUCTION_THRESHOLDS,
    LABELS,
)


PREDICTION_CASES = [
    (
        'You?',
        {
            'toxic': 0.999753,
            'severe_toxic': 0.960957,
            'obscene': 0.993980,
            'threat': 0.952442,
            'insult': 0.999876,
            'identity_hate': 0.882882,
        },
        LABELS,
    ),
    (
        'Hello, how are you?',
        {
            'toxic': 0.461491,
            'severe_toxic': 0.068697,
            'obscene': 0.293683,
            'threat': 0.033517,
            'insult': 0.355036,
            'identity_hate': 0.248791,
        },
        [],
    ),
    (
        'Thank you for your help.',
        {
            'toxic': 0.010134,
            'severe_toxic': 0.005885,
            'obscene': 0.011588,
            'threat': 0.010272,
            'insult': 0.022602,
            'identity_hate': 0.007927,
        },
        [],
    ),
    (
        'You are an idiot.',
        {
            'toxic': 0.999992,
            'severe_toxic': 0.324039,
            'obscene': 0.997655,
            'threat': 0.017187,
            'insult': 0.999998,
            'identity_hate': 0.587395,
        },
        ['toxic', 'obscene', 'insult'],
    ),
    (
        'I will kill you.',
        {
            'toxic': 0.989043,
            'severe_toxic': 0.749215,
            'obscene': 0.823909,
            'threat': 0.999988,
            'insult': 0.637390,
            'identity_hate': 0.215818,
        },
        ['toxic', 'obscene', 'threat'],
    ),
]


class TextPredictionRegressionTests(unittest.TestCase):
    def test_short_utterance_is_tokenized_as_only_the_pronoun(self):
        analyzer = api.model.named_steps['tfidf'].build_analyzer()

        self.assertEqual(analyzer('You?'), ['you'])

    def test_production_api_scores_and_threshold_labels(self):
        self.assertEqual(api.labels, LABELS)
        self.assertEqual(
            len(api.model.named_steps['classifier'].estimators_),
            len(LABELS),
        )

        for text, expected_scores, expected_labels in PREDICTION_CASES:
            with self.subTest(text=text):
                prediction = api.predict_text(api.TextRequest(text=text))
                self.assertEqual(prediction['label_order'], LABELS)
                self.assertEqual(prediction['scores'], expected_scores)

                detected_labels = [
                    label
                    for label in LABELS
                    if prediction['scores'][label]
                    >= DEFAULT_PRODUCTION_THRESHOLDS[label]
                ]
                self.assertEqual(detected_labels, expected_labels)


if __name__ == '__main__':
    unittest.main()
