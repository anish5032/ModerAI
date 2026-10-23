import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / 'ml-service'))

from src.text.evaluate_toxicity_dataset import (  # noqa: E402
    DATASET_PATH,
    EXPECTED_GROUP_COUNTS,
    GROUP_LABELS,
    audit_text_leakage,
    load_evaluation_dataset,
    production_training_texts,
)
from src.text.evaluation_protocol import LABELS  # noqa: E402
from src.text.text_diagnostic_experiment import evaluate_scores  # noqa: E402


class EvaluateToxicityDatasetTests(unittest.TestCase):
    def test_versioned_dataset_has_balanced_groups_and_valid_labels(self):
        dataset = load_evaluation_dataset(DATASET_PATH)

        self.assertEqual(len(dataset), 140)
        self.assertEqual(set(dataset['group']), set(GROUP_LABELS))
        self.assertEqual(
            dataset['group'].value_counts().to_dict(),
            EXPECTED_GROUP_COUNTS,
        )
        self.assertTrue(dataset[LABELS].isin([0, 1]).all().all())

    def test_dataset_rejects_group_label_policy_violation(self):
        dataset = pd.read_csv(DATASET_PATH, keep_default_na=False)
        dataset.loc[dataset['id'] == 'N001', 'toxic'] = 1
        with tempfile.TemporaryDirectory() as temporary_directory:
            invalid_path = Path(temporary_directory) / 'invalid.csv'
            dataset.to_csv(invalid_path, index=False)

            with self.assertRaisesRegex(ValueError, 'policy for group'):
                load_evaluation_dataset(invalid_path)

    def test_dataset_rejects_duplicate_normalized_text(self):
        dataset = pd.read_csv(DATASET_PATH, keep_default_na=False)
        dataset.loc[dataset['id'] == 'N002', 'comment_text'] = ' you? '
        with tempfile.TemporaryDirectory() as temporary_directory:
            invalid_path = Path(temporary_directory) / 'duplicate.csv'
            dataset.to_csv(invalid_path, index=False)

            with self.assertRaisesRegex(ValueError, 'unique after normalization'):
                load_evaluation_dataset(invalid_path)

    def test_leakage_audit_finds_exact_and_near_duplicates(self):
        result = audit_text_leakage(
            ['I will hurt you tonight.', 'A fresh unrelated sentence.'],
            ['I will hurt you tonight!', 'A different source sentence.'],
            near_duplicate_threshold=0.75,
        )

        self.assertEqual(result['exact_duplicate_count'], 0)
        self.assertEqual(result['near_duplicate_count'], 1)
        self.assertEqual(result['near_duplicate_indices'], [0])

    def test_leakage_screen_excludes_fixed_production_holdout(self):
        source_texts = [f'source row {index}' for index in range(10)]
        training_texts = production_training_texts(source_texts)
        _, heldout_indices = train_test_split(
            np.arange(len(source_texts)),
            test_size=0.20,
            random_state=42,
        )

        self.assertEqual(len(training_texts), 8)
        self.assertTrue(
            set(source_texts[index] for index in heldout_indices).isdisjoint(
                training_texts
            )
        )

    def test_metrics_report_each_label_and_confusion_counts(self):
        truth = np.zeros((2, len(LABELS)), dtype=int)
        truth[0, LABELS.index('threat')] = 1
        scores = np.full((2, len(LABELS)), 0.01)
        scores[0, LABELS.index('threat')] = 0.99
        scores[1, LABELS.index('toxic')] = 0.80

        result = evaluate_scores(truth, scores)
        toxic = next(
            item for item in result['per_label']
            if item['label'] == 'toxic'
        )
        threat = next(
            item for item in result['per_label']
            if item['label'] == 'threat'
        )

        self.assertEqual(len(result['per_label']), 6)
        self.assertEqual(
            (toxic['tp'], toxic['fp'], toxic['tn'], toxic['fn']),
            (0, 1, 1, 0),
        )
        self.assertEqual(
            (threat['tp'], threat['fp'], threat['tn'], threat['fn']),
            (1, 0, 1, 0),
        )
        self.assertEqual(toxic['false_positive_rate'], 0.5)


if __name__ == '__main__':
    unittest.main()
