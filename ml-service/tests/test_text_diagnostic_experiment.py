import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / 'ml-service'))

from src.text.evaluation_protocol import LABELS  # noqa: E402
from src.text.text_diagnostic_experiment import (  # noqa: E402
    build_diagnostic_set,
    evaluate_scores,
    threshold_predictions,
)


class TextDiagnosticExperimentTests(unittest.TestCase):
    def test_diagnostic_sample_retains_labels_and_excludes_development_rows(self):
        rows = []
        for label in LABELS:
            labels = {name: 0 for name in LABELS}
            labels[label] = 1
            rows.append({
                'comment_text': f'source sample for {label}',
                **labels,
            })
        reserved = pd.DataFrame(rows)
        development = pd.DataFrame([{
            'comment_text': 'development only',
            **{label: 0 for label in LABELS},
        }])

        diagnostic = build_diagnostic_set(development, reserved, per_label=1)

        self.assertEqual(
            int((diagnostic['comment_text'] == 'You?').sum()),
            1,
        )
        self.assertTrue(
            (diagnostic.loc[diagnostic['comment_text'] == 'You?', LABELS] == 0)
            .all()
            .all()
        )
        self.assertFalse(
            set(diagnostic['comment_text']) & set(development['comment_text'])
        )
        for label in LABELS:
            source_positive = diagnostic.loc[
                diagnostic['diagnostic_group']
                == f'Jigsaw-labeled {label} positive'
            ]
            self.assertEqual(len(source_positive), 1)
            self.assertEqual(int(source_positive.iloc[0][label]), 1)

    def test_metrics_use_production_threshold_and_report_confusion_counts(self):
        scores = np.array([
            [0.90, 0.10, 0.10, 0.10, 0.10, 0.10],
            [0.80, 0.10, 0.10, 0.10, 0.10, 0.10],
            [0.10, 0.10, 0.10, 0.10, 0.10, 0.10],
        ])
        truth = pd.DataFrame([
            [1, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
        ], columns=LABELS)

        predictions = threshold_predictions(scores)
        metrics = evaluate_scores(truth, scores)['per_label'][0]

        self.assertEqual(predictions[:, 0].tolist(), [1, 1, 0])
        self.assertEqual(
            (metrics['tp'], metrics['fp'], metrics['tn'], metrics['fn']),
            (1, 1, 1, 0),
        )
        self.assertEqual(metrics['precision'], 0.5)
        self.assertEqual(metrics['recall'], 1.0)
        self.assertEqual(metrics['false_positive_rate'], 0.5)


if __name__ == '__main__':
    unittest.main()
