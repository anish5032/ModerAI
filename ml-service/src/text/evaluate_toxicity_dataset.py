from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys
from typing import Any, Dict, List, Sequence

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
if str(ML_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_ROOT))

from src.text.evaluation_protocol import (  # noqa: E402
    DEFAULT_PRODUCTION_THRESHOLDS,
    LABELS,
)
from src.text.text_diagnostic_experiment import (  # noqa: E402
    evaluate_scores,
)

DATASET_VERSION = '1.0.0'
DATASET_PATH = ML_SERVICE_ROOT / 'data' / 'evaluation' / 'toxicity_eval_v1.csv'
TRAINING_CORPUS_PATH = (
    ML_SERVICE_ROOT / 'data' / 'processed' / 'cleaned_train.csv'
)
MODEL_PATH = ML_SERVICE_ROOT / 'models' / 'text_toxicity_model.joblib'
REPORT_PATH = ML_SERVICE_ROOT / 'reports' / 'toxicity_eval_v1_report.md'
NEAR_DUPLICATE_THRESHOLD = 0.85
PRODUCTION_TEST_SIZE = 0.20
PRODUCTION_SPLIT_SEED = 42

GROUP_LABELS = {
    'neutral_short': (0, 0, 0, 0, 0, 0),
    'ordinary_conversation': (0, 0, 0, 0, 0, 0),
    'insult': (1, 0, 0, 0, 1, 0),
    'profanity_no_threat': (0, 0, 1, 0, 0, 0),
    'short_threat': (1, 0, 0, 1, 0, 0),
    'longer_threat': (1, 0, 0, 1, 0, 0),
    'severe_toxicity': (1, 1, 0, 0, 1, 0),
    'identity_hate': (1, 0, 0, 0, 0, 1),
}
EXPECTED_GROUP_COUNTS = {
    'neutral_short': 20,
    'ordinary_conversation': 20,
    'insult': 20,
    'profanity_no_threat': 20,
    'short_threat': 12,
    'longer_threat': 8,
    'severe_toxicity': 20,
    'identity_hate': 20,
}
REQUIRED_COLUMNS = ['id', 'group', 'comment_text', *LABELS]


def load_evaluation_dataset(path: Path = DATASET_PATH) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f'Evaluation dataset not found: {path}')
    dataset = pd.read_csv(path, keep_default_na=False)
    missing = [column for column in REQUIRED_COLUMNS if column not in dataset]
    if missing:
        raise ValueError(f'Evaluation dataset is missing columns: {missing}')
    dataset = dataset[REQUIRED_COLUMNS].copy()

    if dataset.empty:
        raise ValueError('Evaluation dataset must not be empty.')
    if dataset['id'].duplicated().any():
        raise ValueError('Evaluation dataset IDs must be unique.')
    if dataset['comment_text'].str.strip().eq('').any():
        raise ValueError('Evaluation text must not be empty.')
    normalized = dataset['comment_text'].str.strip().str.casefold()
    if normalized.duplicated().any():
        raise ValueError('Evaluation text must be unique after normalization.')
    unknown_groups = sorted(set(dataset['group']) - set(GROUP_LABELS))
    if unknown_groups:
        raise ValueError(f'Unknown evaluation groups: {unknown_groups}')
    if set(dataset['group']) != set(GROUP_LABELS):
        raise ValueError('Evaluation dataset must include every required group.')

    for label in LABELS:
        values = pd.to_numeric(dataset[label], errors='raise')
        if not values.isin([0, 1]).all():
            raise ValueError(f'{label} labels must contain only 0 or 1.')
        dataset[label] = values.astype(int)

    counts = dataset['group'].value_counts().to_dict()
    wrong_counts = {
        group: {
            'expected': expected_count,
            'actual': counts.get(group, 0),
        }
        for group, expected_count in EXPECTED_GROUP_COUNTS.items()
        if counts.get(group, 0) != expected_count
    }
    if wrong_counts:
        raise ValueError(
            f'Evaluation group counts do not match the versioned dataset: '
            f'{wrong_counts}.'
        )

    for group, expected_labels in GROUP_LABELS.items():
        group_rows = dataset.loc[dataset['group'] == group, LABELS]
        expected = np.tile(
            np.asarray(expected_labels, dtype=int),
            (len(group_rows), 1),
        )
        if not np.array_equal(group_rows.to_numpy(dtype=int), expected):
            raise ValueError(
                f'Ground-truth labels do not match policy for group {group}.'
            )
    return dataset


def audit_text_leakage(
    evaluation_texts: Sequence[str],
    source_texts: Sequence[str],
    near_duplicate_threshold: float = NEAR_DUPLICATE_THRESHOLD,
) -> Dict[str, Any]:
    """Find exact overlap and high character n-gram cosine similarity.

    The caller supplies text only. This check does not inspect source labels or
    model scores, and is intended as a leakage audit, not model selection.
    """
    normalize = lambda value: ' '.join(str(value).casefold().split())
    normalized_eval = [normalize(text) for text in evaluation_texts]
    normalized_source = [normalize(text) for text in source_texts]
    source_set = set(normalized_source)
    exact_ids = [
        index for index, text in enumerate(normalized_eval)
        if text in source_set
    ]

    vectorizer = TfidfVectorizer(
        analyzer='char_wb',
        ngram_range=(3, 5),
        lowercase=True,
        dtype=np.float32,
        max_features=200_000,
    )
    source_matrix = vectorizer.fit_transform(normalized_source)
    evaluation_matrix = vectorizer.transform(normalized_eval)
    similarities = cosine_similarity(
        evaluation_matrix,
        source_matrix,
        dense_output=False,
    )
    maximum_similarities = np.asarray(similarities.max(axis=1).toarray()).ravel()
    near_indices = [
        index for index, similarity in enumerate(maximum_similarities)
        if similarity >= near_duplicate_threshold
    ]
    return {
        'exact_duplicate_count': len(exact_ids),
        'exact_duplicate_indices': exact_ids,
        'near_duplicate_threshold': near_duplicate_threshold,
        'near_duplicate_count': len(near_indices),
        'near_duplicate_indices': near_indices,
        'maximum_similarity': (
            float(maximum_similarities.max())
            if len(maximum_similarities)
            else 0.0
        ),
        'similarities': maximum_similarities,
    }


def production_training_texts(source_texts: Sequence[str]) -> List[str]:
    """Return only texts in the fixed training partition used by production."""
    training_indices, _ = train_test_split(
        np.arange(len(source_texts)),
        test_size=PRODUCTION_TEST_SIZE,
        random_state=PRODUCTION_SPLIT_SEED,
    )
    return [str(source_texts[index]) for index in training_indices]


def _metrics_markdown(metrics: Dict[str, Any]) -> List[str]:
    lines = [
        '| Label | Support | Precision | Recall | F1 | FPR | TP | FP | TN | FN |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]
    for item in metrics['per_label']:
        lines.append(
            f"| {item['label']} | {item['support']} | "
            f"{item['precision']:.3f} | {item['recall']:.3f} | "
            f"{item['f1']:.3f} | {item['false_positive_rate']:.3f} | "
            f"{item['tp']} | {item['fp']} | {item['tn']} | {item['fn']} |"
        )
    return lines


def evaluate_production_model(
    dataset: pd.DataFrame,
    model_path: Path = MODEL_PATH,
) -> Dict[str, Any]:
    import joblib

    if not model_path.exists():
        raise FileNotFoundError(f'Production model not found: {model_path}')
    saved = joblib.load(model_path)
    if saved['labels'] != LABELS:
        raise ValueError('Production model label order does not match dataset.')
    model = saved['model']

    scores = model.predict_proba(dataset['comment_text'].astype(str))
    neutral_mask = dataset['group'].eq('neutral_short')
    group_results = {}
    for group in GROUP_LABELS:
        group_mask = dataset['group'].eq(group)
        group_results[group] = evaluate_scores(
            dataset.loc[group_mask, LABELS].astype(int),
            scores[group_mask.to_numpy()],
        )

    return {
        'overall': evaluate_scores(dataset[LABELS].astype(int), scores),
        'neutral_short': evaluate_scores(
            dataset.loc[neutral_mask, LABELS].astype(int),
            scores[neutral_mask.to_numpy()],
        ),
        'groups': group_results,
    }


def render_report(
    dataset: pd.DataFrame,
    results: Dict[str, Any],
    leakage: Dict[str, Any],
    source_rows: int,
    total_source_rows: int,
    dataset_sha256: str,
) -> str:
    lines = [
        f'# Toxicity evaluation dataset v{DATASET_VERSION}',
        '',
        '## Dataset and labeling policy',
        '',
        f'- Dataset size: {len(dataset)} original, independently authored '
        'examples across 8 scenario groups.',
        '- Versioned CSV: `ml-service/data/evaluation/toxicity_eval_v1.csv`. '
        f'SHA-256: `{dataset_sha256}`.',
        '- The examples were authored for this evaluation and are not sampled '
        'or copied from Jigsaw. The labels are policy ground truth assigned '
        'during authoring, not third-party or adjudicated human annotations.',
        '- Six binary labels, in model order: ' + ', '.join(LABELS) + '.',
        '- Neutral-short and ordinary-conversation rows are all-negative.',
        '- Insults are toxic+insult only. Profanity-without-threat rows are '
        'obscene only; profanity alone is not a threat, insult, severe-toxicity, '
        'or identity-hate label.',
        '- Threat rows are toxic+threat. The short-threat and longer-threat '
        'groups are separately reported.',
        '- Severe-toxicity rows are toxic+severe_toxic+insult and contain '
        'intense personal degradation without a threat or protected-identity '
        'target. Profanity alone is not severe toxicity.',
        '- Identity-hate rows use the explicit `[protected group]` placeholder '
        'and express exclusion or denial of equal participation based on '
        'identity. They are toxic+identity_hate only. No slurs or real-world '
        'group stereotypes are used.',
        '- Labels are deliberately conservative and encode the intended '
        'standalone text meaning. Context, quotation, sarcasm, dialect, and '
        'annotator disagreement can change real moderation labels.',
        '',
        '## Leakage audit',
        '',
        f'- Compared against {source_rows:,} texts in the production training '
        f'partition ({total_source_rows:,} non-null texts total). The fixed '
        'seed-42 20% held-out partition was excluded. Only text was used; '
        'source labels, model scores, and held-out outcomes were not used.',
        f'- Exact normalized duplicates: {leakage["exact_duplicate_count"]}.',
        f'- Character n-gram cosine near-duplicates at threshold '
        f'{leakage["near_duplicate_threshold"]:.2f}: '
        f'{leakage["near_duplicate_count"]}.',
        f'- Maximum nearest-source similarity: '
        f'{leakage["maximum_similarity"]:.8f}.',
        '- Similarity screening is heuristic: paraphrases without substantial '
        'character overlap may not be found; common short phrases can have '
        'high similarity without being copied.',
        '',
        '## Evaluation protocol',
        '',
        '- Model: the current checked-in production artifact '
        '`ml-service/models/text_toxicity_model.joblib`.',
        '- Scores are rounded to the production API’s six decimals and compared '
        'against the unchanged thresholds in '
        '`ml-service/src/text/evaluation_protocol.py`.',
        '- This evaluation corpus is not used for training, validation, '
        'threshold selection, or model selection.',
        '- The seed-42 untouched holdout is not scored or used to tune this '
        'dataset. Source texts are consulted solely for duplicate screening.',
        '',
        '## Overall production-model results',
        '',
        f"- Rows: {results['overall']['rows']}; macro F1: "
        f"{results['overall']['macro_f1']:.3f}; micro F1: "
        f"{results['overall']['micro_f1']:.3f}; hamming loss: "
        f"{results['overall']['hamming_loss']:.3f}.",
        '',
        *_metrics_markdown(results['overall']),
        '',
        '## Neutral short-text subset',
        '',
        f"- Rows: {results['neutral_short']['rows']}; "
        f"macro F1: {results['neutral_short']['macro_f1']:.3f}; "
        f"false-positive label count: "
        f"{sum(item['fp'] for item in results['neutral_short']['per_label'])}.",
        '',
        *_metrics_markdown(results['neutral_short']),
        '',
        '## Scenario group metrics',
        '',
        '| Group | N | Macro F1 | Micro F1 |',
        '| --- | ---: | ---: | ---: |',
    ]
    for group, metrics in results['groups'].items():
        lines.append(
            f"| {group} | {metrics['rows']} | {metrics['macro_f1']:.3f} | "
            f"{metrics['micro_f1']:.3f} |"
        )
    lines.extend([
        '',
        '## Limitations',
        '',
        '- At 20 examples per scenario, this is more informative than the '
        'previous 26-prompt challenge but remains a small curated benchmark, '
        'not a statistically powered estimate of production prevalence.',
        '- Examples are authored by one project contributor/workflow and '
        'labels have not been independently adjudicated. Identity-hate uses a '
        'placeholder rather than real identity terms, limiting lexical '
        'coverage.',
        '- Performance on this dataset is descriptive only. Do not alter '
        'production thresholds or promote a model from these results; any '
        'candidate must use development-only validation followed by a '
        'pre-registered evaluation on a genuinely untouched holdout.',
        '',
        '## Reproduction',
        '',
        'From the repository root:',
        '',
        '```powershell',
        '& .\\ml-service\\.venv\\Scripts\\python.exe '
        'ml-service\\src\\text\\evaluate_toxicity_dataset.py',
        '& .\\ml-service\\.venv\\Scripts\\python.exe -m unittest discover '
        '-s ml-service\\tests -v',
        'node --test backend\\tests\\analysisService.test.js '
        'backend\\tests\\videoRiskScore.test.js',
        '```',
        '',
        'The evaluator writes `ml-service/reports/toxicity_eval_v1_report.md`. '
        'It does not write or modify model artifacts or thresholds.',
        '',
    ])
    return '\n'.join(lines)


def run_evaluation(
    dataset_path: Path = DATASET_PATH,
    corpus_path: Path = TRAINING_CORPUS_PATH,
    model_path: Path = MODEL_PATH,
    report_path: Path = REPORT_PATH,
) -> Dict[str, Any]:
    dataset = load_evaluation_dataset(dataset_path)
    if not corpus_path.exists():
        raise FileNotFoundError(f'Training corpus not found: {corpus_path}')

    # Text-only corpus read: this is leakage screening, not test evaluation.
    source_df = pd.read_csv(corpus_path, usecols=['comment_text'])
    source_texts = source_df['comment_text'].dropna().astype(str).tolist()
    development_texts = production_training_texts(source_texts)
    leakage = audit_text_leakage(
        dataset['comment_text'].astype(str).tolist(),
        development_texts,
    )
    if leakage['exact_duplicate_count']:
        raise ValueError(
            'Exact duplicate evaluation examples found in the source corpus.'
        )
    if leakage['near_duplicate_count']:
        duplicate_ids = [
            (
                dataset.iloc[index]['id'],
                round(float(leakage['similarities'][index]), 4),
            )
            for index in leakage['near_duplicate_indices']
        ]
        raise ValueError(
            'Near-duplicate evaluation examples require review before scoring: '
            f'{duplicate_ids}'
        )

    results = evaluate_production_model(dataset, model_path)
    dataset_sha256 = hashlib.sha256(dataset_path.read_bytes()).hexdigest()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        render_report(
            dataset,
            results,
            leakage,
            len(development_texts),
            len(source_texts),
            dataset_sha256,
        ),
        encoding='utf-8',
    )
    return {
        'dataset_rows': len(dataset),
        'group_counts': dataset['group'].value_counts().to_dict(),
        'leakage': leakage,
        'results': results,
        'dataset_sha256': dataset_sha256,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, default=DATASET_PATH)
    parser.add_argument('--corpus', type=Path, default=TRAINING_CORPUS_PATH)
    parser.add_argument('--model', type=Path, default=MODEL_PATH)
    parser.add_argument('--report', type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    result = run_evaluation(
        args.dataset,
        args.corpus,
        args.model,
        args.report,
    )
    print(f"Dataset rows: {result['dataset_rows']}")
    print(f"Dataset SHA-256: {result['dataset_sha256']}")
    print(
        'Leakage: '
        f"{result['leakage']['exact_duplicate_count']} exact, "
        f"{result['leakage']['near_duplicate_count']} near duplicates "
        f"(threshold {result['leakage']['near_duplicate_threshold']:.2f})"
    )
    print(f"Report: {args.report.resolve()}")
    for name in ['overall', 'neutral_short']:
        metrics = result['results'][name]
        print(
            f"{name}: macro_f1={metrics['macro_f1']:.3f}, "
            f"micro_f1={metrics['micro_f1']:.3f}"
        )
        for item in metrics['per_label']:
            print(
                f"  {item['label']}: precision={item['precision']:.3f} "
                f"recall={item['recall']:.3f} f1={item['f1']:.3f} "
                f"fpr={item['false_positive_rate']:.3f} "
                f"TP={item['tp']} FP={item['fp']} TN={item['tn']} FN={item['fn']}"
            )


if __name__ == '__main__':
    main()
