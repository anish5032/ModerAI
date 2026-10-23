from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import f1_score, hamming_loss
from sklearn.model_selection import train_test_split

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
if str(ML_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_ROOT))

from src.text.evaluation_protocol import (  # noqa: E402
    DEFAULT_PRODUCTION_THRESHOLDS,
    LABELS,
    build_model,
    load_processed_dataset,
)

DATASET_PATH = ML_SERVICE_ROOT / 'data' / 'processed' / 'cleaned_train.csv'
MODEL_PATH = ML_SERVICE_ROOT / 'models' / 'text_toxicity_model.joblib'
REPORT_PATH = ML_SERVICE_ROOT / 'reports' / 'text_diagnostic_evaluation.md'
RANDOM_STATE = 42
CANDIDATE_RANDOM_STATE = 2026
DIAGNOSTIC_SIZE_PER_LABEL = 20
CANDIDATE_C = 2.0

NEUTRAL_EXAMPLES = [
    ('You?', 'neutral short pronoun'),
    ('I?', 'neutral short pronoun'),
    ('Me?', 'neutral short pronoun'),
    ('Us?', 'neutral short pronoun'),
    ('Hello, how are you?', 'polite/conversational'),
    ('Thank you for your help.', 'polite/conversational'),
    ('Good morning.', 'polite/conversational'),
    ('Could you help me?', 'polite/conversational'),
    ('I understand.', 'polite/conversational'),
    ('That sounds good.', 'polite/conversational'),
    ('Nice to meet you.', 'polite/conversational'),
    ('Have a good day.', 'polite/conversational'),
    ('I appreciate your time.', 'polite/conversational'),
    ('Are you coming?', 'polite/conversational'),
    ('What do you think?', 'polite/conversational'),
    ('Thanks for explaining.', 'polite/conversational'),
    ('I agree with you.', 'polite/conversational'),
    ('See you later.', 'polite/conversational'),
    ('Can we talk?', 'polite/conversational'),
    ('That is helpful.', 'polite/conversational'),
]

REGRESSION_EXAMPLES = [
    ('You?', 'neutral short pronoun'),
    ('Hello, how are you?', 'polite/conversational'),
    ('Thank you for your help.', 'polite/conversational'),
    ('You are an idiot.', 'insult'),
    ('I will kill you.', 'threat'),
]


def _zero_labels() -> Dict[str, int]:
    return {label: 0 for label in LABELS}


def build_diagnostic_set(
    development_df: pd.DataFrame,
    reserved_df: pd.DataFrame,
    per_label: int = DIAGNOSTIC_SIZE_PER_LABEL,
) -> pd.DataFrame:
    """Build a deterministic, non-training diagnostic set with explicit labels."""
    examples: List[Dict[str, Any]] = []
    seen_text = set()

    for text, group in NEUTRAL_EXAMPLES:
        if text in seen_text:
            continue
        seen_text.add(text)
        examples.append({
            'comment_text': text,
            **_zero_labels(),
            'diagnostic_group': group,
            'provenance': 'hand-authored neutral control',
        })

    # The two existing positive regression prompts have conservative labels:
    # profanity alone does not imply obscene, severe-toxic, or identity-hate.
    manual_positive_labels = {
        'You are an idiot.': {'toxic': 1, 'insult': 1},
        'I will kill you.': {'toxic': 1, 'threat': 1},
    }
    for text, group in REGRESSION_EXAMPLES:
        if text in seen_text:
            continue
        seen_text.add(text)
        labels = _zero_labels()
        labels.update(manual_positive_labels.get(text, {}))
        examples.append({
            'comment_text': text,
            **labels,
            'diagnostic_group': group,
            'provenance': 'existing regression input; manually labeled',
        })

    # Sample rare categories first, prefer examples with fewer simultaneous
    # labels, and break ties using a fixed random seed.
    label_order = sorted(
        LABELS,
        key=lambda label: (int(reserved_df[label].sum()), LABELS.index(label)),
    )
    used_indices = set()
    for label_index, label in enumerate(label_order):
        candidates = reserved_df.loc[reserved_df[label].astype(int) == 1].copy()
        candidates = candidates.loc[
            ~candidates['comment_text'].astype(str).isin(seen_text)
        ]
        candidates['_label_count'] = candidates[LABELS].astype(int).sum(axis=1)
        candidates['_tie_break'] = np.random.RandomState(
            RANDOM_STATE + label_index
        ).random_sample(len(candidates))
        candidates = candidates.sort_values(
            ['_label_count', '_tie_break'],
            kind='mergesort',
        )

        selected = []
        for source_index, row in candidates.iterrows():
            if source_index in used_indices:
                continue
            selected.append((source_index, row))
            if len(selected) == per_label:
                break

        if len(selected) < per_label:
            raise ValueError(
                f'Need {per_label} unique reserved positive examples for '
                f'{label}; found {len(selected)}.'
            )

        for source_index, row in selected:
            used_indices.add(source_index)
            text = str(row['comment_text'])
            seen_text.add(text)
            examples.append({
                'comment_text': text,
                **{name: int(row[name]) for name in LABELS},
                'diagnostic_group': f'Jigsaw-labeled {label} positive',
                'provenance': 'Jigsaw training corpus, reserved production split',
            })

    result = pd.DataFrame(examples)
    if result['comment_text'].duplicated().any():
        raise AssertionError('Diagnostic set contains duplicate text.')
    if set(result['comment_text']) & set(development_df['comment_text'].astype(str)):
        raise AssertionError('Diagnostic set overlaps model development data.')
    return result


def threshold_predictions(
    scores: np.ndarray,
    thresholds: Dict[str, float] = DEFAULT_PRODUCTION_THRESHOLDS,
) -> np.ndarray:
    rounded_scores = np.asarray([
        [round(float(score), 6) for score in row]
        for row in scores
    ])
    return np.column_stack([
        rounded_scores[:, index] >= thresholds[label]
        for index, label in enumerate(LABELS)
    ]).astype(int)


def per_label_metrics(
    y_true: pd.DataFrame | np.ndarray,
    y_pred: np.ndarray,
) -> List[Dict[str, Any]]:
    truth = np.asarray(y_true, dtype=int)
    predictions = np.asarray(y_pred, dtype=int)
    results = []
    for index, label in enumerate(LABELS):
        actual = truth[:, index]
        predicted = predictions[:, index]
        tp = int(np.sum((actual == 1) & (predicted == 1)))
        fp = int(np.sum((actual == 0) & (predicted == 1)))
        tn = int(np.sum((actual == 0) & (predicted == 0)))
        fn = int(np.sum((actual == 1) & (predicted == 0)))
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        results.append({
            'label': label,
            'precision': precision,
            'recall': recall,
            'f1': (
                2 * precision * recall / (precision + recall)
                if precision + recall
                else 0.0
            ),
            'false_positive_rate': fp / (fp + tn) if fp + tn else 0.0,
            'tp': tp,
            'fp': fp,
            'tn': tn,
            'fn': fn,
            'support': int(np.sum(actual == 1)),
        })
    return results


def evaluate_scores(
    y_true: pd.DataFrame | np.ndarray,
    scores: np.ndarray,
) -> Dict[str, Any]:
    predictions = threshold_predictions(scores)
    per_label = per_label_metrics(y_true, predictions)
    return {
        'rows': int(len(predictions)),
        'macro_f1': float(np.mean([item['f1'] for item in per_label])),
        'micro_f1': float(f1_score(
            y_true, predictions, average='micro', zero_division=0
        )),
        'hamming_loss': float(hamming_loss(y_true, predictions)),
        'per_label': per_label,
    }


def _format_metrics_table(metrics: Dict[str, Any]) -> List[str]:
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


def _candidate_validation(
    development_df: pd.DataFrame,
) -> Dict[str, Any]:
    train_df, validation_df = train_test_split(
        development_df,
        test_size=0.20,
        random_state=CANDIDATE_RANDOM_STATE,
    )
    y_train = train_df[LABELS].astype(int)
    y_validation = validation_df[LABELS].astype(int)

    baseline = build_model()
    candidate = clone(baseline).set_params(
        classifier__estimator__C=CANDIDATE_C,
    )

    results = {}
    for name, model in [
        ('same_configuration_baseline', baseline),
        ('candidate_logistic_regression_C_2', candidate),
    ]:
        model.fit(train_df['comment_text'].astype(str), y_train)
        results[name] = evaluate_scores(
            y_validation,
            model.predict_proba(validation_df['comment_text'].astype(str)),
        )
    return {
        'train_rows': int(len(train_df)),
        'validation_rows': int(len(validation_df)),
        'random_state': CANDIDATE_RANDOM_STATE,
        'results': results,
    }


def run_experiment(output_path: Path = REPORT_PATH) -> Dict[str, Any]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f'Production model not found: {MODEL_PATH}')
    dataset = load_processed_dataset(DATASET_PATH)

    development_df, reserved_df = train_test_split(
        dataset,
        test_size=0.20,
        random_state=RANDOM_STATE,
    )
    diagnostic_df = build_diagnostic_set(development_df, reserved_df)

    saved_model = joblib.load(MODEL_PATH)
    model = saved_model['model']
    if saved_model['labels'] != LABELS:
        raise ValueError('Production model labels do not match evaluation order.')

    scores = model.predict_proba(diagnostic_df['comment_text'].astype(str))
    production_metrics = evaluate_scores(
        diagnostic_df[LABELS].astype(int),
        scores,
    )
    candidate = _candidate_validation(development_df)
    regression_scores = model.predict_proba(
        [text for text, _ in REGRESSION_EXAMPLES]
    )
    regression_table = []
    for (text, group), row in zip(REGRESSION_EXAMPLES, regression_scores):
        score_map = dict(zip(
            LABELS,
            [round(float(score), 6) for score in row],
        ))
        labels_found = [
            label for label in LABELS
            if score_map[label] >= DEFAULT_PRODUCTION_THRESHOLDS[label]
        ]
        regression_table.append({
            'text': text,
            'group': group,
            'scores': score_map,
            'threshold_labels': labels_found,
        })

    grouped_counts = (
        diagnostic_df['diagnostic_group'].value_counts().sort_index().to_dict()
    )
    report = {
        'dataset_rows': int(len(dataset)),
        'development_rows': int(len(development_df)),
        'reserved_rows': int(len(reserved_df)),
        'diagnostic_rows': int(len(diagnostic_df)),
        'diagnostic_group_counts': grouped_counts,
        'production_metrics': production_metrics,
        'candidate': candidate,
        'regression_examples': regression_table,
    }

    lines = [
        '# ModerAI text diagnostic evaluation',
        '',
        '## Protocol and provenance',
        '',
        '- Source: `ml-service/data/raw/text/train.csv`, prepared by '
        '`ml-service/src/text/prepare_data.py` into '
        '`ml-service/data/processed/cleaned_train.csv`.',
        '- The current production model was trained from the processed Jigsaw '
        'training corpus using the deterministic 80/20 split '
        '`train_test_split(test_size=0.20, random_state=42)`.',
        '- Diagnostic positives are sampled only from that split’s reserved '
        '20%, so they were excluded from production-model fitting. Source '
        'labels are retained as the six ground-truth labels. The diagnostic '
        'set is never used for candidate fitting or selection.',
        '- Twenty hand-authored neutral controls (short pronouns and '
        'conversational/polite phrases) are explicitly all-negative. The five '
        'regression prompts are included. The insult example is labeled toxic '
        'and insult only; the threat example toxic and threat only. Profanity '
        'does not imply severe toxicity or identity hate.',
        '- For each of the six labels, the diagnostic set includes '
        f'{DIAGNOSTIC_SIZE_PER_LABEL} unique source-labeled positive examples. '
        'The sampler prioritizes examples with fewer simultaneous positive '
        'labels. Dataset excerpts are evaluated in memory and are not copied '
        'into this report.',
        '- Production decisions use the unchanged configured thresholds and '
        'six-decimal scores returned by the ML API. No threshold selection is '
        'performed.',
        '- Candidate comparison uses a separate deterministic 80/20 '
        'train/validation split of the development partition. Both models '
        'train on the candidate train portion and are compared on validation '
        'only. The untouched reserved remainder is not used to choose or tune '
        'the candidate.',
        '- The candidate changes only Logistic Regression `C` from the '
        'baseline default to 2.0, as a predeclared exploratory candidate. It '
        'is not saved or promoted.',
        '',
        '## Diagnostic set',
        '',
        f'- Rows: {report["diagnostic_rows"]} (including source-labeled '
        f'positive samples and neutral controls).',
        '- Group counts: '
        + ', '.join(
            f'{name}: {count}'
            for name, count in report['diagnostic_group_counts'].items()
        ),
        '- This is a deliberately balanced diagnostic sample, not a '
        'prevalence-representative production estimate. Jigsaw annotations '
        'are inherited and may be noisy; performance should not be generalized '
        'from this small curated sample.',
        '',
        '## Production artifact on diagnostic set',
        '',
        f"- Rows: {production_metrics['rows']}; macro F1: "
        f"{production_metrics['macro_f1']:.3f}; micro F1: "
        f"{production_metrics['micro_f1']:.3f}; hamming loss: "
        f"{production_metrics['hamming_loss']:.3f}.",
        '',
        *_format_metrics_table(production_metrics),
        '',
        '## Existing regression prompts',
        '',
        'Scores are listed in label order: toxic, severe_toxic, obscene, '
        'threat, insult, identity_hate. The last column is threshold output; '
        'the existing backend short-transcript policy is unchanged.',
        '',
        '| Input | Ground-truth group | Raw scores | Labels above threshold |',
        '| --- | --- | --- | --- |',
    ]
    for item in regression_table:
        ordered_scores = ', '.join(
            f'{item["scores"][label]:.6f}' for label in LABELS
        )
        labels_text = ', '.join(item['threshold_labels']) or 'none'
        lines.append(
            f'| {item["text"]} | {item["group"]} | {ordered_scores} | '
            f'{labels_text} |'
        )

    lines.extend([
        '',
        '## Candidate comparison (validation only)',
        '',
        f"- Split: {candidate['train_rows']} train / "
        f"{candidate['validation_rows']} validation rows "
        f"(seed {candidate['random_state']}).",
        '- The diagnostic set and reserved production split were excluded.',
        '',
        '| Model | Macro F1 | Micro F1 | Hamming loss |',
        '| --- | ---: | ---: | ---: |',
    ])
    for name, metrics in candidate['results'].items():
        lines.append(
            f"| {name} | {metrics['macro_f1']:.4f} | "
            f"{metrics['micro_f1']:.4f} | {metrics['hamming_loss']:.4f} |"
        )

    lines.extend([
        '',
        'Per-label validation metrics:',
        '',
    ])
    for name, metrics in candidate['results'].items():
        lines.extend([
            f'### {name}',
            '',
            *_format_metrics_table(metrics),
            '',
        ])

    baseline_metrics = candidate['results']['same_configuration_baseline']
    candidate_metrics = candidate['results']['candidate_logistic_regression_C_2']
    macro_delta = candidate_metrics['macro_f1'] - baseline_metrics['macro_f1']
    micro_delta = candidate_metrics['micro_f1'] - baseline_metrics['micro_f1']
    lines.extend([
        '## Interpretation',
        '',
        f'- Candidate minus baseline validation macro F1: {macro_delta:+.4f}; '
        f'micro F1: {micro_delta:+.4f}.',
        '- The small validation gains merit further investigation, not '
        'promotion. This is one comparison; any apparent gain requires '
        'confirmation on a future untouched holdout and review of rare-label '
        'precision/recall.',
        '- The neutral short pronoun `You?` remains a known false positive if '
        'its threshold scores persist in the diagnostic reproduction. This '
        'experiment changes no runtime moderation behavior.',
        '',
        '## Exact reproduction commands',
        '',
        'From the repository root:',
        '',
        '```powershell',
        '& .\\ml-service\\.venv\\Scripts\\python.exe '
        'ml-service\\src\\text\\text_diagnostic_experiment.py',
        '& .\\ml-service\\.venv\\Scripts\\python.exe -m unittest discover '
        '-s ml-service\\tests -v',
        'node --test backend\\tests\\analysisService.test.js',
        '```',
        '',
        'No production thresholds, production model files, or runtime '
        'moderation code are modified by this experiment.',
        '',
    ])
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text('\n'.join(lines), encoding='utf-8')
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--output',
        type=Path,
        default=REPORT_PATH,
        help='Markdown report path (default: ml-service/reports/text_diagnostic_evaluation.md)',
    )
    args = parser.parse_args()
    report = run_experiment(args.output)
    print(f"Diagnostic examples: {report['diagnostic_rows']}")
    print(f"Report written to: {args.output.resolve()}")
    print('Production diagnostic per-label metrics:')
    for item in report['production_metrics']['per_label']:
        print(
            f"{item['label']}: P={item['precision']:.3f} "
            f"R={item['recall']:.3f} F1={item['f1']:.3f} "
            f"FPR={item['false_positive_rate']:.3f} "
            f"TP={item['tp']} FP={item['fp']} TN={item['tn']} FN={item['fn']}"
        )
    print('Candidate validation metrics:')
    for name, metrics in report['candidate']['results'].items():
        print(
            f"{name}: macro_f1={metrics['macro_f1']:.4f} "
            f"micro_f1={metrics['micro_f1']:.4f} "
            f"hamming_loss={metrics['hamming_loss']:.4f}"
        )


if __name__ == '__main__':
    main()
