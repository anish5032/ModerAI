import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / 'ml-service' / 'src' / 'text'))

from evaluation_protocol import (  # noqa: E402
    LABELS,
    DEFAULT_PRODUCTION_THRESHOLDS,
    evaluate_policy_for_thresholds,
    load_processed_dataset,
    make_train_validation_test_split,
    threshold_selection_report,
)


class EvaluationProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.df = load_processed_dataset(PROJECT_ROOT / 'ml-service' / 'data' / 'processed' / 'cleaned_train.csv')
        cls.train_df, cls.val_df, cls.test_df = make_train_validation_test_split(
            cls.df,
            random_state=42,
            test_size=0.20,
            validation_size=0.25,
        )

    def test_split_sizes_are_reproducible(self):
        train_df, val_df, test_df = make_train_validation_test_split(
            self.df,
            random_state=42,
            test_size=0.20,
            validation_size=0.25,
        )
        self.assertEqual(len(train_df), len(self.train_df))
        self.assertEqual(len(val_df), len(self.val_df))
        self.assertEqual(len(test_df), len(self.test_df))
        self.assertTrue(len(train_df) > len(val_df) > len(test_df))

    def test_threshold_selection_report_includes_selected_values(self):
        val_prob = np.random.RandomState(0).rand(len(self.val_df), len(LABELS))
        report = threshold_selection_report(
            self.val_df[LABELS].astype(int),
            val_prob,
            labels=LABELS,
            production_thresholds=DEFAULT_PRODUCTION_THRESHOLDS,
        )
        self.assertEqual(set(report['selected_thresholds'].keys()), set(LABELS))
        for label in LABELS:
            self.assertGreaterEqual(report['selected_thresholds'][label], 0.0)
            self.assertLessEqual(report['selected_thresholds'][label], 1.0)

    def test_metric_calculation_for_perfect_prediction(self):
        y_true = pd.DataFrame({
            'toxic': [0, 1, 1, 0],
            'severe_toxic': [0, 0, 0, 0],
            'obscene': [0, 0, 0, 0],
            'threat': [0, 0, 0, 0],
            'insult': [0, 0, 0, 0],
            'identity_hate': [0, 0, 1, 1],
        })
        y_proba = np.array([
            [0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
            [0.90, 0.08, 0.02, 0.02, 0.02, 0.08],
            [0.85, 0.02, 0.02, 0.02, 0.02, 0.91],
            [0.05, 0.02, 0.02, 0.02, 0.02, 0.92],
        ])
        metrics = evaluate_policy_for_thresholds(y_true, y_proba, {'toxic': 0.5, 'severe_toxic': 0.5, 'obscene': 0.5, 'threat': 0.5, 'insult': 0.5, 'identity_hate': 0.5})
        self.assertEqual(metrics['per_label'][0]['f1'], 1.0)
        self.assertEqual(metrics['per_label'][5]['f1'], 1.0)


if __name__ == '__main__':
    unittest.main()
