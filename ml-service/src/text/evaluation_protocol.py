from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
import json
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    hamming_loss,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline

LABELS = [
    'toxic',
    'severe_toxic',
    'obscene',
    'threat',
    'insult',
    'identity_hate',
]

DEFAULT_PRODUCTION_THRESHOLDS = {
    'toxic': 0.72,
    'severe_toxic': 0.82,
    'obscene': 0.72,
    'threat': 0.90,
    'insult': 0.74,
    'identity_hate': 0.82,
}

THRESHOLD_GRID = [round(float(v), 2) for v in np.linspace(0.05, 0.99, 95)]


@dataclass(frozen=True)
class ThresholdResult:
    label: str
    threshold: float
    precision: float
    recall: float
    f1: float
    support: int
    tp: int
    fp: int
    tn: int
    fn: int
    constraint_passed: bool


def load_processed_dataset(path: str | Path) -> pd.DataFrame:
    dataset_path = Path(path)
    if not dataset_path.exists():
        raise FileNotFoundError(f'Dataset not found: {dataset_path}')

    df = pd.read_csv(dataset_path)
    required = ['comment_text', *LABELS]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f'Required columns missing: {missing}')

    df = df.dropna(subset=['comment_text']).copy()
    df['comment_text'] = df['comment_text'].astype(str).str.strip()
    df = df[df['comment_text'] != '']
    df = df.drop_duplicates(subset=['comment_text']).reset_index(drop=True)

    for label in LABELS:
        df[label] = pd.to_numeric(df[label], errors='raise')
        if not df[label].isin([0, 1]).all():
            raise ValueError(f'Invalid values found in {label}')

    return df


def build_model() -> Pipeline:
    return Pipeline([
        (
            'tfidf',
            TfidfVectorizer(
                strip_accents='unicode',
                lowercase=True,
                ngram_range=(1, 2),
                max_features=100_000,
                sublinear_tf=True,
                dtype='float32',
            ),
        ),
        (
            'classifier',
            OneVsRestClassifier(
                LogisticRegression(
                    max_iter=1000,
                    class_weight='balanced',
                    solver='liblinear',
                    random_state=42,
                ),
                n_jobs=-1,
            ),
        ),
    ])


def _signature_for_split(df: pd.DataFrame) -> pd.Series:
    return df[LABELS].astype(int).apply(tuple, axis=1)


def make_train_validation_test_split(
    df: pd.DataFrame,
    random_state: int = 42,
    test_size: float = 0.20,
    validation_size: float = 0.20,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Create deterministic train/validation/test splits.

    We first attempt a multilabel-aware split by signature, but the dataset contains
    extremely sparse label combinations. In those cases sklearn's stratified split
    can fail because some signature classes include only a single example. If that
    happens we fall back to a deterministic random split and record the limitation.
    """
    if not 0.0 < test_size < 1.0:
        raise ValueError('test_size must be between 0 and 1.')
    if not 0.0 < validation_size < 1.0:
        raise ValueError('validation_size must be between 0 and 1.')

    use_stratify = True
    try:
        signatures = _signature_for_split(df)
        train_df, temp_df = train_test_split(
            df,
            test_size=test_size,
            random_state=random_state,
            stratify=signatures,
        )
        temp_signatures = _signature_for_split(temp_df)
        val_df, test_df = train_test_split(
            temp_df,
            test_size=validation_size,
            random_state=random_state,
            stratify=temp_signatures,
        )
    except ValueError:
        use_stratify = False
        train_df, temp_df = train_test_split(
            df,
            test_size=test_size,
            random_state=random_state,
        )
        val_df, test_df = train_test_split(
            temp_df,
            test_size=validation_size,
            random_state=random_state,
        )

    if len(val_df) == 0 or len(test_df) == 0:
        raise ValueError('Validation/test split produced an empty dataset.')

    return train_df, val_df, test_df


def _binary_confusion_counts(y_true: Sequence[int], y_pred: Sequence[int]) -> Tuple[int, int, int, int]:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return int(tn), int(fp), int(fn), int(tp)


def _threshold_metrics_for_label(
    y_true: Sequence[int],
    y_score: Sequence[float],
    threshold: float,
) -> Dict[str, Any]:
    predictions = (np.asarray(y_score) >= threshold).astype(int)
    tn, fp, fn, tp = _binary_confusion_counts(y_true, predictions)
    precision = precision_score(y_true, predictions, zero_division=0)
    recall = recall_score(y_true, predictions, zero_division=0)
    f1 = f1_score(y_true, predictions, zero_division=0)
    return {
        'threshold': float(threshold),
        'precision': float(precision),
        'recall': float(recall),
        'f1': float(f1),
        'support': int(np.sum(y_true)),
        'tp': tp,
        'fp': fp,
        'tn': tn,
        'fn': fn,
    }


def select_threshold_for_label(
    y_true: Sequence[int],
    y_score: Sequence[float],
    label: str,
    threshold_candidates: Optional[Iterable[float]] = None,
    min_precision: Optional[float] = None,
    min_recall: Optional[float] = None,
) -> ThresholdResult:
    candidates = list(threshold_candidates) if threshold_candidates is not None else THRESHOLD_GRID
    if not candidates:
        raise ValueError('Threshold candidates must not be empty.')

    best = None
    for threshold in sorted(candidates):
        metrics = _threshold_metrics_for_label(y_true, y_score, threshold)
        if min_precision is not None and metrics['precision'] < min_precision:
            continue
        if min_recall is not None and metrics['recall'] < min_recall:
            continue

        if best is None or metrics['f1'] > best['f1']:
            best = metrics
            best['threshold'] = float(threshold)

    if best is None:
        # Fall back to the best F1 even if a hard constraint is infeasible.
        best = max(
            (
                _threshold_metrics_for_label(y_true, y_score, threshold)
                for threshold in sorted(candidates)
            ),
            key=lambda m: (m['f1'], -abs(m['precision'] - 0.5), -abs(m['recall'] - 0.5)),
        )
        best['threshold'] = float(best['threshold'])

    return ThresholdResult(
        label=label,
        threshold=float(best['threshold']),
        precision=float(best['precision']),
        recall=float(best['recall']),
        f1=float(best['f1']),
        support=int(best['support']),
        tp=int(best['tp']),
        fp=int(best['fp']),
        tn=int(best['tn']),
        fn=int(best['fn']),
        constraint_passed=not (
            (min_precision is not None and best['precision'] < min_precision)
            or (min_recall is not None and best['recall'] < min_recall)
        ),
    )


def evaluate_policy_for_thresholds(
    y_true: pd.DataFrame,
    y_proba: np.ndarray,
    thresholds: Dict[str, float],
    labels: Sequence[str] = LABELS,
) -> Dict[str, Any]:
    label_list = list(labels)
    if isinstance(y_true, pd.DataFrame):
        y_true_array = y_true[label_list].astype(int).to_numpy()
    else:
        y_true_array = np.asarray(y_true, dtype=int)
        if y_true_array.shape[1] != len(label_list):
            raise ValueError(f'Expected {len(label_list)} label columns but got {y_true_array.shape[1]}.')

    predictions = np.zeros_like(y_true_array, dtype=int)

    for idx, label in enumerate(label_list):
        threshold = thresholds.get(label, 0.5)
        predictions[:, idx] = (y_proba[:, idx] >= threshold).astype(int)

    support = y_true_array.sum(axis=0)
    macro_f1 = f1_score(y_true_array, predictions, average='macro', zero_division=0)
    micro_f1 = f1_score(y_true_array, predictions, average='micro', zero_division=0)

    per_label = []
    for idx, label in enumerate(labels):
        truth = y_true_array[:, idx]
        pred = predictions[:, idx]
        tn, fp, fn, tp = confusion_matrix(truth, pred, labels=[0, 1]).ravel()
        per_label.append(
            {
                'label': label,
                'precision': float(precision_score(truth, pred, zero_division=0)),
                'recall': float(recall_score(truth, pred, zero_division=0)),
                'f1': float(f1_score(truth, pred, zero_division=0)),
                'support': int(support[idx]),
                'tp': int(tp),
                'fp': int(fp),
                'fn': int(fn),
                'tn': int(tn),
                'threshold': float(thresholds.get(label, 0.5)),
            }
        )

    return {
        'macro_f1': float(macro_f1),
        'micro_f1': float(micro_f1),
        'hamming_loss': float(hamming_loss(y_true_array, predictions)),
        'support': {label: int(support[idx]) for idx, label in enumerate(labels)},
        'per_label': per_label,
        'thresholds': {label: float(thresholds.get(label, 0.5)) for label in labels},
        'predictions': predictions,
    }


def threshold_selection_report(
    y_true: pd.DataFrame,
    y_proba: np.ndarray,
    labels: Sequence[str] = LABELS,
    production_thresholds: Optional[Dict[str, float]] = None,
    min_precision: Optional[Dict[str, float]] = None,
    min_recall: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    min_precision = min_precision or {}
    min_recall = min_recall or {}
    production_thresholds = production_thresholds or DEFAULT_PRODUCTION_THRESHOLDS

    selected = {}
    per_label = {}
    warnings_list = []

    for label in labels:
        y_true_column = y_true[label].astype(int).to_numpy()
        score_column = y_proba[:, labels.index(label)]
        support = int(y_true_column.sum())
        if support < 20:
            warnings_list.append(
                f'{label} has only {support} positive validation examples; threshold selection is weakly informed.'
            )

        result = select_threshold_for_label(
            y_true_column,
            score_column,
            label,
            threshold_candidates=THRESHOLD_GRID,
            min_precision=min_precision.get(label),
            min_recall=min_recall.get(label),
        )
        selected[label] = float(result.threshold)
        per_label[label] = {
            'threshold': float(result.threshold),
            'precision': float(result.precision),
            'recall': float(result.recall),
            'f1': float(result.f1),
            'support': int(result.support),
            'tp': int(result.tp),
            'fp': int(result.fp),
            'tn': int(result.tn),
            'fn': int(result.fn),
            'production_threshold': float(production_thresholds.get(label, 0.5)),
            'constraint_passed': bool(result.constraint_passed),
        }

    validation_production = evaluate_policy_for_thresholds(y_true, y_proba, production_thresholds, labels=labels)
    validation_selected = evaluate_policy_for_thresholds(y_true, y_proba, selected, labels=labels)

    return {
        'labels': list(labels),
        'selected_thresholds': selected,
        'production_thresholds': {label: float(production_thresholds.get(label, 0.5)) for label in labels},
        'validation_metrics': {
            'production': validation_production,
            'selected': validation_selected,
        },
        'per_label': per_label,
        'warnings': warnings_list,
    }


def _format_metric_row(label: str, metrics: Dict[str, Any]) -> str:
    return (
        f"| {label} | {metrics.get('threshold', 0.0):.2f} | "
        f"{metrics.get('precision', 0.0):.4f} | {metrics.get('recall', 0.0):.4f} | "
        f"{metrics.get('f1', 0.0):.4f} | {metrics.get('support', 0)} |"
    )


def render_markdown_report(report: Dict[str, Any], baseline_name: str = 'Production thresholds', candidate_name: str = 'Validation-selected thresholds') -> str:
    selected = report['selected_thresholds']
    per_label = report['per_label']
    lines = []
    lines.append('# ModerAI threshold calibration report')
    lines.append('')
    lines.append('## Summary')
    lines.append(f"- Selected thresholds: {json.dumps(selected, sort_keys=True)}")
    lines.append(f"- Baseline thresholds: {json.dumps(report['production_thresholds'], sort_keys=True)}")
    lines.append('')
    lines.append('## Per-label validation trade-offs')
    lines.append('| Label | Threshold | Precision | Recall | F1 | Support |')
    lines.append('| --- | ---: | ---: | ---: | ---: | ---: |')
    for label in report['labels']:
        lines.append(_format_metric_row(label, per_label[label]))

    lines.append('')
    lines.append('## Validation metrics by policy')
    lines.append(f'- {baseline_name}: macro-F1={report["validation_metrics"]["production"]["macro_f1"]:.4f}, micro-F1={report["validation_metrics"]["production"]["micro_f1"]:.4f}, hamming={report["validation_metrics"]["production"]["hamming_loss"]:.4f}')
    lines.append(f'- {candidate_name}: macro-F1={report["validation_metrics"]["selected"]["macro_f1"]:.4f}, micro-F1={report["validation_metrics"]["selected"]["micro_f1"]:.4f}, hamming={report["validation_metrics"]["selected"]["hamming_loss"]:.4f}')

    if report.get('warnings'):
        lines.append('')
        lines.append('## Caveats')
        for warning in report['warnings']:
            lines.append(f'- {warning}')

    return '\n'.join(lines) + '\n'


def compare_candidate_models(
    df: pd.DataFrame,
    candidate_builders: Dict[str, Any],
    labels: Sequence[str] = LABELS,
    thresholds: Optional[Dict[str, float]] = None,
    random_state: int = 42,
    test_size: float = 0.20,
    validation_size: float = 0.25,
) -> Dict[str, Any]:
    thresholds = thresholds or DEFAULT_PRODUCTION_THRESHOLDS
    train_df, val_df, test_df = make_train_validation_test_split(
        df,
        random_state=random_state,
        test_size=test_size,
        validation_size=validation_size,
    )

    results = {}
    for name, builder in candidate_builders.items():
        model = builder()
        model.fit(train_df['comment_text'], train_df[list(labels)].astype(int))
        val_proba = model.predict_proba(val_df['comment_text'])
        test_proba = model.predict_proba(test_df['comment_text'])

        val_metrics = evaluate_policy_for_thresholds(val_df[list(labels)], val_proba, thresholds, labels=list(labels))
        test_metrics = evaluate_policy_for_thresholds(test_df[list(labels)], test_proba, thresholds, labels=list(labels))

        results[name] = {
            'validation': val_metrics,
            'test': test_metrics,
            'model_type': str(type(model).__name__),
        }

    return {
        'split_sizes': {
            'train': int(len(train_df)),
            'validation': int(len(val_df)),
            'test': int(len(test_df)),
        },
        'candidates': results,
    }


def run_experiment(
    dataset_path: str | Path = 'ml-service/data/processed/cleaned_train.csv',
    random_state: int = 42,
    test_size: float = 0.20,
    validation_size: float = 0.25,
    model_output_path: str | Path | None = None,
    report_output_path: str | Path | None = None,
    json_output_path: str | Path | None = None,
    min_precision: Optional[Dict[str, float]] = None,
    min_recall: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    dataset_path = Path(dataset_path)
    df = load_processed_dataset(dataset_path)
    train_df, val_df, test_df = make_train_validation_test_split(
        df,
        random_state=random_state,
        test_size=test_size,
        validation_size=validation_size,
    )

    model = build_model()
    training_labels = LABELS
    X_train = train_df['comment_text']
    y_train = train_df[training_labels].astype(int)
    model.fit(X_train, y_train)

    val_scores = model.predict_proba(val_df['comment_text'])
    test_scores = model.predict_proba(test_df['comment_text'])

    val_labels = val_df[training_labels].astype(int)
    test_labels = test_df[training_labels].astype(int)

    report = threshold_selection_report(
        val_labels,
        val_scores,
        labels=training_labels,
        production_thresholds=DEFAULT_PRODUCTION_THRESHOLDS,
        min_precision=min_precision,
        min_recall=min_recall,
    )

    candidate_thresholds = report['selected_thresholds']
    validation_baseline = evaluate_policy_for_thresholds(val_labels, val_scores, DEFAULT_PRODUCTION_THRESHOLDS, labels=training_labels)
    validation_candidate = evaluate_policy_for_thresholds(val_labels, val_scores, candidate_thresholds, labels=training_labels)
    test_baseline = evaluate_policy_for_thresholds(test_labels, test_scores, DEFAULT_PRODUCTION_THRESHOLDS, labels=training_labels)
    test_candidate = evaluate_policy_for_thresholds(test_labels, test_scores, candidate_thresholds, labels=training_labels)

    experiment = {
        'dataset_path': str(dataset_path),
        'random_state': random_state,
        'test_size': test_size,
        'validation_size': validation_size,
        'split_sizes': {
            'train': int(len(train_df)),
            'validation': int(len(val_df)),
            'test': int(len(test_df)),
        },
        'label_counts': {
            'dataset': {label: int(df[label].sum()) for label in training_labels},
            'train': {label: int(train_df[label].sum()) for label in training_labels},
            'validation': {label: int(val_df[label].sum()) for label in training_labels},
            'test': {label: int(test_df[label].sum()) for label in training_labels},
        },
        'model_type': 'TF-IDF + One-vs-Rest Logistic Regression',
        'model_identity': 'tfidf-one-vs-rest-logreg',
        'production_thresholds': {label: float(DEFAULT_PRODUCTION_THRESHOLDS.get(label, 0.5)) for label in training_labels},
        'selected_thresholds': {label: float(candidate_thresholds.get(label, 0.5)) for label in training_labels},
        'validation': {
            'baseline': validation_baseline,
            'candidate': validation_candidate,
            'selection_report': report,
        },
        'test': {
            'baseline': test_baseline,
            'candidate': test_candidate,
        },
        'warnings': report['warnings'],
        'package_versions': {
            'numpy': np.__version__,
            'pandas': pd.__version__,
            'scikit_learn': __import__('sklearn').__version__,
        },
    }

    if model_output_path is not None:
        model_output = Path(model_output_path)
        model_output.parent.mkdir(parents=True, exist_ok=True)
        joblib = __import__('joblib')
        joblib.dump({'model': model, 'labels': list(training_labels)}, model_output, compress=3)
        experiment['candidate_model_path'] = str(model_output)

    if report_output_path is not None:
        report_output_path = Path(report_output_path)
        report_output_path.parent.mkdir(parents=True, exist_ok=True)
        report_output_path.write_text(render_markdown_report(report), encoding='utf-8')
        experiment['report_path'] = str(report_output_path)

    if json_output_path is not None:
        json_output_path = Path(json_output_path)
        json_output_path.parent.mkdir(parents=True, exist_ok=True)
        sanitized = json.loads(json.dumps(experiment, default=lambda o: getattr(o, 'tolist', lambda: str(o))()))
        json_output_path.write_text(json.dumps(sanitized, indent=2, sort_keys=True), encoding='utf-8')
        experiment['json_path'] = str(json_output_path)

    return experiment


if __name__ == '__main__':
    project_root = Path(__file__).resolve().parents[2]
    report_path = project_root / 'reports' / 'threshold_evaluation.md'
    json_path = project_root / 'reports' / 'threshold_evaluation.json'
    model_path = project_root / 'models' / 'candidates' / 'threshold_evaluation_candidate.joblib'
    run_experiment(
        dataset_path=project_root / 'data' / 'processed' / 'cleaned_train.csv',
        model_output_path=model_path,
        report_output_path=report_path,
        json_output_path=json_path,
    )
